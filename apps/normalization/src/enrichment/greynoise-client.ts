/**
 * @module GreyNoiseClient
 * @description GreyNoise Community API enrichment client for global IOC processing.
 * Gracefully degrades when API key is not set (returns null).
 * DECISION-029 Phase B2.
 */

export interface GreyNoiseIpResult {
  ip: string;
  noise: boolean;
  riot: boolean;
  classification: string;
  name: string;
  link: string;
  lastSeen: string;
  message: string;
}

export interface GreyNoiseThreatAssessment {
  isBenignScanner: boolean;
  isMalicious: boolean;
  isKnownService: boolean;
  confidenceAdjustment: number;
}

export class GreyNoiseClient {
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env['TI_GREYNOISE_API_KEY'];
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async enrichIp(ip: string): Promise<GreyNoiseIpResult | null> {
    if (!this.apiKey) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(
        `https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`,
        {
          headers: { key: this.apiKey },
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!res.ok) return null;

      const data = await res.json() as Record<string, unknown>;

      return {
        ip: String(data['ip'] ?? ip),
        noise: !!data['noise'],
        riot: !!data['riot'],
        classification: String(data['classification'] ?? 'unknown'),
        name: String(data['name'] ?? ''),
        link: String(data['link'] ?? ''),
        lastSeen: String(data['last_seen'] ?? ''),
        message: String(data['message'] ?? ''),
      };
    } catch {
      return null;
    }
  }

  static assessThreatLevel(result: GreyNoiseIpResult): GreyNoiseThreatAssessment {
    const isKnownService = result.riot === true;
    const isBenignScanner = result.noise === true && result.classification === 'benign';
    const isMalicious = result.classification === 'malicious';

    let confidenceAdjustment = 0;
    if (isKnownService) {
      confidenceAdjustment = -20;
    } else if (isBenignScanner) {
      confidenceAdjustment = -10;
    } else if (isMalicious) {
      confidenceAdjustment = 20;
    }

    return { isBenignScanner, isMalicious, isKnownService, confidenceAdjustment };
  }
}
