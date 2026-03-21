import type pino from 'pino';
import type { RateLimiter } from '../rate-limiter.js';
import type { AbuseIPDBResult } from '../schema.js';

const ABUSEIPDB_BASE = 'https://api.abuseipdb.com/api/v2';

export class AbuseIPDBProvider {
  constructor(
    private readonly apiKey: string,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: pino.Logger,
  ) {}

  /** AbuseIPDB only supports IP lookups */
  supports(iocType: string): boolean {
    return iocType === 'ip' || iocType === 'ipv6';
  }

  /** Look up an IP in AbuseIPDB */
  async lookup(iocType: string, value: string): Promise<AbuseIPDBResult | null> {
    if (!this.apiKey) {
      this.logger.debug('AbuseIPDB: no API key configured — skipping');
      return null;
    }

    if (!this.supports(iocType)) {
      return null;
    }

    await this.rateLimiter.acquire();

    try {
      const url = `${ABUSEIPDB_BASE}/check?ipAddress=${encodeURIComponent(value)}&maxAgeInDays=90&verbose`;
      const res = await fetch(url, {
        headers: {
          Key: this.apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 429) {
        this.logger.warn('AbuseIPDB: rate limited by API');
        return null;
      }

      if (!res.ok) {
        this.logger.warn({ status: res.status }, 'AbuseIPDB: unexpected response');
        return null;
      }

      const json = await res.json() as {
        data?: {
          abuseConfidenceScore?: number;
          totalReports?: number;
          numDistinctUsers?: number;
          lastReportedAt?: string | null;
          isp?: string;
          countryCode?: string;
          usageType?: string;
          isWhitelisted?: boolean;
          isTor?: boolean;
        };
      };

      const data = json.data;
      if (!data) return this.emptyResult();

      return {
        abuseConfidenceScore: data.abuseConfidenceScore ?? 0,
        totalReports: data.totalReports ?? 0,
        numDistinctUsers: data.numDistinctUsers ?? 0,
        lastReportedAt: data.lastReportedAt ?? null,
        isp: data.isp ?? '',
        countryCode: data.countryCode ?? '',
        usageType: data.usageType ?? '',
        isWhitelisted: data.isWhitelisted ?? false,
        isTor: data.isTor ?? false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: message, value }, 'AbuseIPDB: lookup failed');
      return null;
    }
  }

  private emptyResult(): AbuseIPDBResult {
    return {
      abuseConfidenceScore: 0, totalReports: 0, numDistinctUsers: 0,
      lastReportedAt: null, isp: '', countryCode: '', usageType: '',
      isWhitelisted: false, isTor: false,
    };
  }
}
