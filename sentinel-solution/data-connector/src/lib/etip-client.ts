import { InvocationContext } from '@azure/functions';

export interface EtipIOC {
  id: string;
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email';
  value: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  tlp: 'white' | 'green' | 'amber' | 'red';
  confidence: number;
  lifecycle: 'active' | 'expired' | 'revoked';
  tags: string[];
  mitreAttack: string[];
  malwareFamilies: string[];
  threatActors: string[];
  firstSeen: string;
  lastSeen: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface EtipStats {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byTlp: Record<string, number>;
  byLifecycle: Record<string, number>;
  lastUpdated: string;
}

interface EtipListResponse {
  data: EtipIOC[];
  nextCursor: string | null;
}

export class EtipClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    const baseUrl = process.env.ETIP_API_BASE_URL;
    const apiKey = process.env.ETIP_API_KEY;

    if (!baseUrl) throw new Error('Missing required env var: ETIP_API_BASE_URL');
    if (!apiKey) throw new Error('Missing required env var: ETIP_API_KEY');

    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-API-Key': this.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`ETIP API ${path} returned ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch all IOCs, optionally filtered by updatedSince timestamp.
   * Handles cursor-based pagination automatically.
   * Returns up to maxPages * 500 IOCs to prevent unbounded fetches.
   */
  async fetchIOCs(
    updatedSince?: string,
    context?: InvocationContext,
    maxPages = 20,
  ): Promise<EtipIOC[]> {
    const allIOCs: EtipIOC[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      const params: Record<string, string> = { limit: '500' };
      if (updatedSince) params.updatedSince = updatedSince;
      if (cursor) params.cursor = cursor;

      const result = await this.request<EtipListResponse>('/iocs', params);
      allIOCs.push(...result.data);
      cursor = result.nextCursor ?? undefined;
      page++;

      context?.log(`Fetched page ${page}: ${result.data.length} IOCs (total so far: ${allIOCs.length})`);

      if (!cursor) break;
    } while (page < maxPages);

    return allIOCs;
  }

  /**
   * Fetch aggregate IOC statistics from ETIP.
   */
  async fetchStats(): Promise<EtipStats> {
    return this.request<EtipStats>('/stats');
  }
}
