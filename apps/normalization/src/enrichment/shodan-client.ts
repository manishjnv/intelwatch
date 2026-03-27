/**
 * @module ShodanClient
 * @description Shodan IP enrichment client for global IOC processing.
 * Gracefully degrades when API key is not set (returns null).
 * DECISION-029 Phase B2.
 */

export interface ShodanIpResult {
  ip: string;
  hostnames: string[];
  org: string;
  isp: string;
  os: string | null;
  ports: number[];
  vulns: string[];
  country: string;
  city: string;
  lastUpdate: string;
  tags: string[];
}

export interface ShodanRiskIndicators {
  openPorts: number;
  hasKnownVulns: boolean;
  vulnCount: number;
  isCloudHosted: boolean;
  isTorExit: boolean;
  riskScore: number;
}

export class ShodanClient {
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env['TI_SHODAN_API_KEY'];
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async enrichIp(ip: string): Promise<ShodanIpResult | null> {
    if (!this.apiKey) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(
        `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${this.apiKey}`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!res.ok) return null;

      const data = await res.json() as Record<string, unknown>;

      return {
        ip: String(data['ip_str'] ?? ip),
        hostnames: Array.isArray(data['hostnames']) ? data['hostnames'] as string[] : [],
        org: String(data['org'] ?? ''),
        isp: String(data['isp'] ?? ''),
        os: data['os'] != null ? String(data['os']) : null,
        ports: Array.isArray(data['ports']) ? data['ports'] as number[] : [],
        vulns: Array.isArray(data['vulns']) ? data['vulns'] as string[] : [],
        country: String(data['country_name'] ?? data['country_code'] ?? ''),
        city: String(data['city'] ?? ''),
        lastUpdate: String(data['last_update'] ?? ''),
        tags: Array.isArray(data['tags']) ? data['tags'] as string[] : [],
      };
    } catch {
      return null;
    }
  }

  static extractRiskIndicators(result: ShodanIpResult): ShodanRiskIndicators {
    const openPorts = result.ports.length;
    const vulnCount = result.vulns.length;
    const hasKnownVulns = vulnCount > 0;
    const isCloudHosted = result.tags.some((t) => t.toLowerCase() === 'cloud');
    const isTorExit = result.tags.some((t) => t.toLowerCase() === 'tor');

    let riskScore = 20;
    riskScore += Math.min(openPorts * 5, 30);
    riskScore += Math.min(vulnCount * 10, 40);
    if (isTorExit) riskScore += 15;
    if (isCloudHosted) riskScore -= 5;
    riskScore = Math.max(0, Math.min(100, riskScore));

    return { openPorts, hasKnownVulns, vulnCount, isCloudHosted, isTorExit, riskScore };
  }
}
