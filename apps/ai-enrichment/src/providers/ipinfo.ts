import type pino from 'pino';
import type { RateLimiter } from '../rate-limiter.js';
import type { IPinfoResult } from '../schema.js';

const IPINFO_BASE = 'https://ipinfo.io';

/**
 * IPinfo.io provider for IP geolocation, ASN, and privacy detection.
 * Free tier: 50,000 lookups/month. Strategy budget: 1,200/day.
 * Supports ip and ipv6 IOC types only.
 */
export class IPinfoProvider {
  constructor(
    private readonly token: string,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: pino.Logger,
  ) {}

  /** IPinfo only supports IP lookups */
  supports(iocType: string): boolean {
    return iocType === 'ip' || iocType === 'ipv6';
  }

  /** Look up an IP address in IPinfo.io */
  async lookup(iocType: string, value: string): Promise<IPinfoResult | null> {
    if (!this.token) {
      this.logger.debug('IPinfo: no API token configured — skipping');
      return null;
    }

    if (!this.supports(iocType)) {
      return null;
    }

    await this.rateLimiter.acquire();

    try {
      const url = `${IPINFO_BASE}/${encodeURIComponent(value)}?token=${this.token}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 429) {
        this.logger.warn('IPinfo: rate limited by API');
        return null;
      }

      if (!res.ok) {
        this.logger.warn({ status: res.status }, 'IPinfo: unexpected response');
        return null;
      }

      const json = await res.json() as {
        ip?: string;
        hostname?: string;
        city?: string;
        region?: string;
        country?: string;
        loc?: string;
        org?: string;
        postal?: string;
        timezone?: string;
        bogon?: boolean;
        privacy?: {
          vpn?: boolean;
          proxy?: boolean;
          tor?: boolean;
          relay?: boolean;
          hosting?: boolean;
        };
      };

      const { asn, orgName } = parseOrg(json.org);
      const { latitude, longitude } = parseLoc(json.loc);

      return {
        hostname: json.hostname ?? null,
        city: json.city ?? '',
        region: json.region ?? '',
        country: json.country ?? '',
        latitude,
        longitude,
        asn,
        orgName,
        postal: json.postal ?? '',
        timezone: json.timezone ?? '',
        isVpn: json.privacy?.vpn ?? false,
        isProxy: json.privacy?.proxy ?? false,
        isTor: json.privacy?.tor ?? false,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: message, value }, 'IPinfo: lookup failed');
      return null;
    }
  }
}

/** Parse org field "AS1234 Company Name" → { asn, orgName } */
function parseOrg(org: string | undefined): { asn: string; orgName: string } {
  if (!org) return { asn: '', orgName: '' };
  const match = org.match(/^(AS\d+)\s*(.*)/);
  if (!match) return { asn: '', orgName: org };
  return { asn: match[1]!, orgName: match[2]?.trim() ?? '' };
}

/** Parse loc field "37.7749,-122.4194" → { latitude, longitude } */
function parseLoc(loc: string | undefined): { latitude: number; longitude: number } {
  if (!loc) return { latitude: 0, longitude: 0 };
  const parts = loc.split(',');
  if (parts.length !== 2) return { latitude: 0, longitude: 0 };
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { latitude: 0, longitude: 0 };
  return { latitude: lat, longitude: lng };
}
