import { randomUUID } from 'node:crypto';
import { jaroWinkler, levenshteinNormalized, tldRiskScore } from './similarity-scoring.js';
import type { DomainEnricher } from './domain-enricher.js';

/** CertStream certificate data (simplified from real CertStream JSON). */
export interface CertStreamEntry {
  domain: string;
  san: string[];
  issuer: string;
  timestamp: string;
}

/** A match found by the CertStream monitor against monitored assets. */
export interface CertStreamMatch {
  id: string;
  certDomain: string;
  matchedAsset: string;
  similarity: number;
  method: 'jaro_winkler' | 'levenshtein';
  tldRisk: number;
  timestamp: string;
}

/** Real-time stats for the CertStream monitor. */
export interface CertStreamStats {
  enabled: boolean;
  connected: boolean;
  certificatesProcessed: number;
  matchesFound: number;
  matchesThisHour: number;
  alertsCreated: number;
  uptime: number;
  lastCertAt: string | null;
  rateLimited: boolean;
}

export interface CertStreamMonitorConfig {
  enabled: boolean;
  url: string;
  maxMatchesPerHour: number;
  matchThreshold: number;
}

/**
 * CertStream real-time monitor — watches certificate transparency logs
 * for domains similar to monitored assets. Sub-15-minute detection.
 *
 * In development: processes simulated entries.
 * In production: connects to wss://certstream.calidog.io via WebSocket.
 */
export class CertStreamMonitor {
  private readonly config: CertStreamMonitorConfig;
  readonly enricher: DomainEnricher;
  private monitoredAssets: string[] = [];
  private stats: CertStreamStats;
  private hourlyMatchCount = 0;
  private hourResetInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private startedAt = 0;

  constructor(config: CertStreamMonitorConfig, enricher: DomainEnricher) {
    this.config = config;
    this.enricher = enricher;
    this.stats = {
      enabled: config.enabled,
      connected: false,
      certificatesProcessed: 0,
      matchesFound: 0,
      matchesThisHour: 0,
      alertsCreated: 0,
      uptime: 0,
      lastCertAt: null,
      rateLimited: false,
    };
  }

  /** Update the list of monitored assets (brand names, domains). */
  setMonitoredAssets(assets: string[]): void {
    this.monitoredAssets = assets.map((a) => a.toLowerCase());
  }

  /** Start the CertStream monitor. */
  start(): void {
    if (!this.config.enabled || this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    this.stats.connected = true;
    // Reset hourly counter every hour
    this.hourResetInterval = setInterval(() => {
      this.hourlyMatchCount = 0;
      this.stats.rateLimited = false;
    }, 3600000);
  }

  /** Stop the CertStream monitor. */
  stop(): void {
    this.running = false;
    this.stats.connected = false;
    if (this.hourResetInterval) {
      clearInterval(this.hourResetInterval);
      this.hourResetInterval = null;
    }
  }

  /** Process a certificate entry (called by WebSocket handler or test harness). */
  processCertificate(entry: CertStreamEntry): CertStreamMatch[] {
    if (!this.running) return [];

    this.stats.certificatesProcessed++;
    this.stats.lastCertAt = entry.timestamp;
    this.stats.uptime = Date.now() - this.startedAt;

    // Rate limiting — budget gate
    if (this.hourlyMatchCount >= this.config.maxMatchesPerHour) {
      this.stats.rateLimited = true;
      return [];
    }

    const allDomains = [entry.domain, ...entry.san].filter(Boolean);
    const matches: CertStreamMatch[] = [];

    for (const certDomain of allDomains) {
      const cleanDomain = certDomain.replace(/^\*\./, '').toLowerCase();
      for (const asset of this.monitoredAssets) {
        const match = this.checkMatch(cleanDomain, asset);
        if (match) {
          matches.push(match);
          this.hourlyMatchCount++;
          this.stats.matchesFound++;
          this.stats.matchesThisHour = this.hourlyMatchCount;
        }
      }
    }

    return matches;
  }

  /** Check if a certificate domain matches a monitored asset. */
  private checkMatch(certDomain: string, asset: string): CertStreamMatch | null {
    // Skip exact matches (legitimate certs for own domains)
    const certName = certDomain.split('.')[0] ?? certDomain;
    const assetName = asset.split('.')[0] ?? asset;
    if (certName === assetName) return null;

    const jwScore = jaroWinkler(assetName, certName);
    const levScore = levenshteinNormalized(assetName, certName);
    const bestScore = Math.max(jwScore, levScore);
    const method = jwScore >= levScore ? 'jaro_winkler' as const : 'levenshtein' as const;

    if (bestScore < this.config.matchThreshold) return null;

    return {
      id: randomUUID(),
      certDomain,
      matchedAsset: asset,
      similarity: bestScore,
      method,
      tldRisk: tldRiskScore(certDomain),
      timestamp: new Date().toISOString(),
    };
  }

  /** Detect registration bursts — 3+ similar domains within the processed batch. */
  detectRegistrationBurst(matches: CertStreamMatch[], windowMs = 3600000): CertStreamMatch[][] {
    const bursts: CertStreamMatch[][] = [];
    const byAsset = new Map<string, CertStreamMatch[]>();

    for (const m of matches) {
      const key = m.matchedAsset;
      const existing = byAsset.get(key) ?? [];
      existing.push(m);
      byAsset.set(key, existing);
    }

    for (const [, assetMatches] of byAsset) {
      if (assetMatches.length >= 3) {
        // Check if all within the time window
        const timestamps = assetMatches.map((m) => new Date(m.timestamp).getTime());
        const range = Math.max(...timestamps) - Math.min(...timestamps);
        if (range <= windowMs) {
          bursts.push(assetMatches);
        }
      }
    }

    return bursts;
  }

  /** Get current monitor stats. */
  getStats(): CertStreamStats {
    if (this.running) {
      this.stats.uptime = Date.now() - this.startedAt;
    }
    return { ...this.stats };
  }

  /** Check if the monitor is currently running. */
  isRunning(): boolean {
    return this.running;
  }
}
