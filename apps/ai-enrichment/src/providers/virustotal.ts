import type pino from 'pino';
import type { RateLimiter } from '../rate-limiter.js';
import type { VTResult } from '../schema.js';

const VT_BASE = 'https://www.virustotal.com/api/v3';

/** IOC type → VT endpoint path mapping */
function vtEndpoint(iocType: string, value: string): string | null {
  switch (iocType) {
    case 'ip': case 'ipv6': return `/ip_addresses/${value}`;
    case 'domain': case 'fqdn': return `/domains/${value}`;
    case 'url': return `/urls/${btoa(value).replace(/=/g, '')}`;
    case 'hash_md5': case 'hash_sha1': case 'hash_sha256': case 'hash_sha512':
      return `/files/${value}`;
    default: return null;
  }
}

export class VirusTotalProvider {
  constructor(
    private readonly apiKey: string,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: pino.Logger,
  ) {}

  /** Check if this provider can handle the given IOC type */
  supports(iocType: string): boolean {
    return vtEndpoint(iocType, '') !== null;
  }

  /** Look up an IOC in VirusTotal */
  async lookup(iocType: string, value: string): Promise<VTResult | null> {
    if (!this.apiKey) {
      this.logger.debug('VT: no API key configured — skipping');
      return null;
    }

    const path = vtEndpoint(iocType, value);
    if (!path) {
      this.logger.debug({ iocType }, 'VT: unsupported IOC type');
      return null;
    }

    await this.rateLimiter.acquire();

    try {
      const res = await fetch(`${VT_BASE}${path}`, {
        headers: { 'x-apikey': this.apiKey },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 404) {
        this.logger.debug({ value, iocType }, 'VT: not found');
        return this.emptyResult();
      }

      if (res.status === 429) {
        this.logger.warn('VT: rate limited by API');
        return null;
      }

      if (!res.ok) {
        this.logger.warn({ status: res.status }, 'VT: unexpected response');
        return null;
      }

      const json = await res.json() as {
        data?: {
          attributes?: {
            last_analysis_stats?: Record<string, number>;
            last_analysis_date?: number;
            tags?: string[];
          };
        };
      };

      const stats = json.data?.attributes?.last_analysis_stats;
      if (!stats) return this.emptyResult();

      const malicious = stats.malicious ?? 0;
      const suspicious = stats.suspicious ?? 0;
      const harmless = stats.harmless ?? 0;
      const undetected = stats.undetected ?? 0;
      const totalEngines = malicious + suspicious + harmless + undetected;

      return {
        malicious,
        suspicious,
        harmless,
        undetected,
        totalEngines,
        detectionRate: totalEngines > 0 ? Math.round((malicious / totalEngines) * 100) : 0,
        tags: json.data?.attributes?.tags ?? [],
        lastAnalysisDate: json.data?.attributes?.last_analysis_date
          ? new Date(json.data.attributes.last_analysis_date * 1000).toISOString()
          : null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: message, value }, 'VT: lookup failed');
      return null;
    }
  }

  private emptyResult(): VTResult {
    return {
      malicious: 0, suspicious: 0, harmless: 0, undetected: 0,
      totalEngines: 0, detectionRate: 0, tags: [], lastAnalysisDate: null,
    };
  }
}
