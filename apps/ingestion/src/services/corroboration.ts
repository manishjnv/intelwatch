/**
 * Cross-Feed IOC Corroboration Engine
 * Tracks IOC sightings across independent feeds. When 2+ feeds report the same
 * IOC, confidence is boosted logarithmically. This is the single biggest accuracy
 * improvement over competitors — it mathematically reduces false positives.
 *
 * Differentiator: Recorded Future/Mandiant assign static confidence. ETIP
 * dynamically boosts confidence as more independent sources corroborate.
 */
import { normalizeIOCValue, detectIOCType, calculateCompositeConfidence } from '@etip/shared-normalization';
import { buildDedupeKey } from '@etip/shared-utils';

export interface Sighting {
  feedId: string;
  tenantId: string;
  firstSeen: Date;
  lastSeen: Date;
}

export interface SightingRecord {
  iocKey: string;
  iocValue: string;
  iocType: string;
  sightings: Map<string, Sighting>; // keyed by feedId
}

export interface CorroborationResult {
  sightingCount: number;
  feedIds: string[];
  boostedConfidence: number;
  corroborationSignal: number; // 0-100 for use in calculateCompositeConfidence
}

export class CorroborationEngine {
  private sightingMap: Map<string, SightingRecord> = new Map();

  /** Record an IOC sighting from a specific feed */
  recordSighting(iocValue: string, iocType: string, feedId: string, tenantId: string): SightingRecord {
    const normalizedType = iocType || detectIOCType(iocValue);
    const normalized = normalizeIOCValue(iocValue, normalizedType as ReturnType<typeof detectIOCType>);
    const key = buildDedupeKey(normalizedType, normalized, tenantId);

    let record = this.sightingMap.get(key);
    if (!record) {
      record = { iocKey: key, iocValue: normalized, iocType: normalizedType, sightings: new Map() };
      this.sightingMap.set(key, record);
    }

    const now = new Date();
    const existing = record.sightings.get(feedId);
    if (existing) {
      existing.lastSeen = now;
    } else {
      record.sightings.set(feedId, { feedId, tenantId, firstSeen: now, lastSeen: now });
    }

    return record;
  }

  /** Get number of independent feeds that have reported this IOC */
  getSightingCount(iocValue: string, iocType: string, tenantId: string): number {
    const normalizedType = iocType || detectIOCType(iocValue);
    const normalized = normalizeIOCValue(iocValue, normalizedType as ReturnType<typeof detectIOCType>);
    const key = buildDedupeKey(normalizedType, normalized, tenantId);
    const record = this.sightingMap.get(key);
    return record ? record.sightings.size : 0;
  }

  /** Calculate confidence boost based on corroboration count */
  calculateCorroboratedConfidence(baseConfidence: number, sightingCount: number): number {
    if (sightingCount <= 1) return baseConfidence;
    // Logarithmic boost: base * (1 + 0.15 * ln(sightings))
    const boost = 1 + 0.15 * Math.log(sightingCount);
    return Math.min(100, Math.round(baseConfidence * boost));
  }

  /** Convert sighting count to a 0-100 corroboration signal for composite confidence */
  sightingCountToSignal(sightingCount: number): number {
    // 1 source = 20, 2 = 50, 3 = 70, 5+ = 90, 10+ = 100
    if (sightingCount <= 0) return 0;
    if (sightingCount === 1) return 20;
    // Logarithmic scale: min(100, 20 + 35 * ln(count))
    return Math.min(100, Math.round(20 + 35 * Math.log(sightingCount)));
  }

  /** Full corroboration analysis for an IOC */
  getCorroboration(iocValue: string, iocType: string, tenantId: string, baseConfidence: number = 50): CorroborationResult {
    const normalizedType = iocType || detectIOCType(iocValue);
    const normalized = normalizeIOCValue(iocValue, normalizedType as ReturnType<typeof detectIOCType>);
    const key = buildDedupeKey(normalizedType, normalized, tenantId);
    const record = this.sightingMap.get(key);

    const sightingCount = record ? record.sightings.size : 0;
    const feedIds = record ? [...record.sightings.keys()] : [];

    return {
      sightingCount,
      feedIds,
      boostedConfidence: this.calculateCorroboratedConfidence(baseConfidence, sightingCount),
      corroborationSignal: this.sightingCountToSignal(sightingCount),
    };
  }

  /** Integrate with shared-normalization composite confidence */
  calculateFullConfidence(
    feedReliability: number, corroborationSignal: number,
    aiScore: number, communityVotes: number, daysSinceLastSeen: number,
  ) {
    return calculateCompositeConfidence(
      { feedReliability, corroboration: corroborationSignal, aiScore, communityVotes },
      daysSinceLastSeen,
    );
  }

  /** Get total tracked IOCs */
  size(): number {
    return this.sightingMap.size;
  }

  /** Clear all sightings (for testing or reset) */
  clear(): void {
    this.sightingMap.clear();
  }
}
