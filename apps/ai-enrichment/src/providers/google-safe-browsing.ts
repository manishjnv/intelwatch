import type pino from 'pino';
import type { RateLimiter } from '../rate-limiter.js';
import type { GSBResult } from '../schema.js';

const GSB_BASE = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
] as const;

const SUPPORTED_IOC_TYPES = new Set(['url', 'domain', 'fqdn']);

/** Convert IOC value to a full URL for GSB lookup */
function toGSBUrl(iocType: string, value: string): string {
  if (iocType === 'url') return value;
  return `http://${value}`;
}

export class GoogleSafeBrowsingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: pino.Logger,
  ) {}

  /** Check if this provider can handle the given IOC type */
  supports(iocType: string): boolean {
    return SUPPORTED_IOC_TYPES.has(iocType);
  }

  /** Look up a single IOC in Google Safe Browsing */
  async lookup(iocType: string, value: string): Promise<GSBResult | null> {
    const results = await this.batchLookup(iocType, [value]);
    return results[0] ?? null;
  }

  /** Batch lookup — up to 500 URLs in a single API call */
  async batchLookup(iocType: string, values: string[]): Promise<(GSBResult | null)[]> {
    if (!this.apiKey) {
      this.logger.debug('GSB: no API key configured — skipping');
      return values.map(() => null);
    }

    if (!this.supports(iocType)) {
      this.logger.debug({ iocType }, 'GSB: unsupported IOC type');
      return values.map(() => null);
    }

    const urls = values.map((v) => toGSBUrl(iocType, v));

    await this.rateLimiter.acquire();

    try {
      const body = {
        client: { clientId: 'etip', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: [...THREAT_TYPES],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: urls.map((url) => ({ url })),
        },
      };

      const res = await fetch(`${GSB_BASE}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 429) {
        this.logger.warn('GSB: rate limited by API');
        return values.map(() => null);
      }

      if (!res.ok) {
        this.logger.warn({ status: res.status }, 'GSB: unexpected response');
        return values.map(() => null);
      }

      const json = await res.json() as {
        matches?: Array<{
          threatType?: string;
          platformType?: string;
          threat?: { url?: string };
        }>;
      };

      const now = new Date().toISOString();

      // Build a map of URL → threats
      const threatMap = new Map<string, Array<{ type: string; platform: string }>>();
      if (json.matches) {
        for (const match of json.matches) {
          const matchUrl = match.threat?.url ?? '';
          if (!threatMap.has(matchUrl)) threatMap.set(matchUrl, []);
          threatMap.get(matchUrl)!.push({
            type: match.threatType ?? 'UNKNOWN',
            platform: match.platformType ?? 'ANY_PLATFORM',
          });
        }
      }

      // Map results back to input order
      return urls.map((url): GSBResult => {
        const threats = threatMap.get(url) ?? [];
        return {
          safe: threats.length === 0,
          threats,
          checkedAt: now,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: message }, 'GSB: lookup failed');
      return values.map(() => null);
    }
  }
}
