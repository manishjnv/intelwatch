/**
 * #13 — Correlation Confidence Decay
 * Type-specific IOC aging per DECISION-015 + correlation-level decay.
 * Dual-decay model: IOC confidence AND correlation confidence decay independently.
 * Revalidation boost when decayed IOC is re-observed in new feed data.
 */
import type {
  CorrelatedIOC, CorrelationResult, DecayedResult,
} from '../schemas/correlation.js';

// ── IOC Decay Rates (inlined from DECISION-015, same as shared-normalization) ──

const IOC_DECAY_RATES: Record<string, number> = {
  hash_md5: 0.002,
  hash_sha1: 0.001,
  hash_sha256: 0.001,
  hash_sha512: 0.001,
  ip: 0.05,
  ipv6: 0.05,
  domain: 0.02,
  fqdn: 0.02,
  url: 0.04,
  email: 0.03,
  cve: 0.005,
  cidr: 0.04,
  asn: 0.01,
  bitcoin_address: 0.003,
};

const DEFAULT_DECAY_RATE = 0.01;

export interface ConfidenceDecayConfig {
  correlationDecayRate: number;
  revalidationBoostFactor: number;
}

const DEFAULT_CONFIG: ConfidenceDecayConfig = {
  correlationDecayRate: 0.01,
  revalidationBoostFactor: 0.8,
};

export class ConfidenceDecayService {
  private readonly config: ConfidenceDecayConfig;

  constructor(config: Partial<ConfidenceDecayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Get the decay rate for an IOC type. Falls back to DEFAULT_DECAY_RATE. */
  getIOCDecayRate(iocType: string): number {
    return IOC_DECAY_RATES[iocType] ?? DEFAULT_DECAY_RATE;
  }

  /** Decay IOC confidence: originalConfidence * exp(-rate * daysSinceLastSeen) */
  decayIOCConfidence(originalConfidence: number, iocType: string, daysSinceLastSeen: number): number {
    if (daysSinceLastSeen <= 0 || originalConfidence <= 0) return originalConfidence;
    const rate = this.getIOCDecayRate(iocType);
    const factor = Math.exp(-rate * daysSinceLastSeen);
    return Math.round(originalConfidence * factor * 1000) / 1000;
  }

  /** Decay correlation confidence: original * exp(-correlationDecayRate * daysSinceCreated) */
  decayCorrelationConfidence(originalConfidence: number, daysSinceCreated: number): number {
    if (daysSinceCreated <= 0 || originalConfidence <= 0) return originalConfidence;
    const factor = Math.exp(-this.config.correlationDecayRate * daysSinceCreated);
    return Math.round(originalConfidence * factor * 1000) / 1000;
  }

  /** Revalidation boost: if IOC was re-observed after correlation creation */
  applyRevalidationBoost(currentConfidence: number, originalConfidence: number): number {
    const boosted = originalConfidence * this.config.revalidationBoostFactor;
    return Math.round(Math.max(currentConfidence, boosted) * 1000) / 1000;
  }

  /** Apply dual decay to all correlation results, referencing IOC lastSeen dates. */
  applyDecay(
    results: Map<string, CorrelationResult>,
    iocs: Map<string, CorrelatedIOC>,
  ): DecayedResult[] {
    const now = Date.now();
    const msPerDay = 24 * 3600 * 1000;
    const decayed: DecayedResult[] = [];

    for (const result of results.values()) {
      const createdAtMs = new Date(result.createdAt).getTime();
      const daysSinceCreated = Math.max(0, (now - createdAtMs) / msPerDay);

      // Correlation-level decay
      const corrDecayFactor = daysSinceCreated > 0
        ? Math.exp(-this.config.correlationDecayRate * daysSinceCreated)
        : 1;
      let decayedConfidence = result.confidence * corrDecayFactor;

      // Per-entity IOC decay
      const iocDecays: DecayedResult['iocDecays'] = [];
      for (const entity of result.entities) {
        const ioc = iocs.get(entity.entityId);
        if (!ioc) continue;

        const lastSeenMs = new Date(ioc.lastSeen).getTime();
        const daysSinceLastSeen = Math.max(0, (now - lastSeenMs) / msPerDay);

        const iocDecayed = this.decayIOCConfidence(ioc.confidence, ioc.iocType, daysSinceLastSeen);

        // Revalidation: if IOC was re-seen after correlation was created
        const revalidated = lastSeenMs > createdAtMs;
        const finalIocConf = revalidated
          ? this.applyRevalidationBoost(iocDecayed, ioc.confidence)
          : iocDecayed;

        iocDecays.push({
          iocId: ioc.id,
          iocType: ioc.iocType,
          originalConfidence: ioc.confidence,
          decayedConfidence: Math.round(finalIocConf * 1000) / 1000,
          daysSinceLastSeen: Math.round(daysSinceLastSeen * 100) / 100,
          revalidated,
        });
      }

      // Adjust correlation confidence by average IOC decay ratio
      if (iocDecays.length > 0) {
        const avgIocRatio = iocDecays.reduce((sum, d) => {
          return sum + (d.originalConfidence > 0 ? d.decayedConfidence / d.originalConfidence : 1);
        }, 0) / iocDecays.length;
        decayedConfidence *= avgIocRatio;
      }

      decayed.push({
        correlationId: result.id,
        originalConfidence: result.confidence,
        decayedConfidence: Math.round(Math.max(0, Math.min(1, decayedConfidence)) * 1000) / 1000,
        decayFactor: Math.round(corrDecayFactor * 1000) / 1000,
        daysSinceCreated: Math.round(daysSinceCreated * 100) / 100,
        iocDecays,
      });
    }

    return decayed;
  }

  /** Get current config. */
  getConfig(): ConfidenceDecayConfig {
    return { ...this.config };
  }
}
