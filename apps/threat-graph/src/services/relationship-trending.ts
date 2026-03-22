import type { ConfidenceChange, TrendingResponse } from '../schemas/operations.js';
import type { RelationshipType } from '../schemas/graph.js';

/**
 * Relationship Strength Trending — #20.
 *
 * Tracks confidence changes over time for each relationship.
 * In-memory circular buffer (last 100 changes per relationship).
 * Records are created when PUT /relationships updates confidence.
 */
export class RelationshipTrendingService {
  private readonly maxChanges: number;
  private readonly changes = new Map<string, ConfidenceChange[]>();

  constructor(maxChanges = 100) {
    this.maxChanges = maxChanges;
  }

  /** Builds a relationship key for storage lookup. */
  private key(fromId: string, type: string, toId: string): string {
    return `${fromId}-${type}-${toId}`;
  }

  /** Records a confidence change event. */
  record(
    fromNodeId: string,
    type: RelationshipType,
    toNodeId: string,
    oldConfidence: number,
    newConfidence: number,
    source: 'auto-detected' | 'analyst-confirmed',
    updatedBy: string,
  ): void {
    const k = this.key(fromNodeId, type, toNodeId);
    const history = this.changes.get(k) ?? [];

    history.push({
      timestamp: new Date().toISOString(),
      oldConfidence,
      newConfidence,
      delta: Math.round((newConfidence - oldConfidence) * 1000) / 1000,
      source,
      updatedBy,
    });

    // Circular buffer
    if (history.length > this.maxChanges) {
      history.splice(0, history.length - this.maxChanges);
    }

    this.changes.set(k, history);
  }

  /** Gets trending data for a specific relationship. */
  getTrending(
    fromNodeId: string,
    type: RelationshipType,
    toNodeId: string,
    currentConfidence: number,
  ): TrendingResponse {
    const k = this.key(fromNodeId, type, toNodeId);
    const history = this.changes.get(k) ?? [];

    let trend: TrendingResponse['trend'] = 'insufficient_data';
    let avgConfidence = currentConfidence;

    if (history.length >= 3) {
      const recent = history.slice(-5);
      const deltas = recent.map((c) => c.delta);
      const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;

      if (avgDelta > 0.01) trend = 'increasing';
      else if (avgDelta < -0.01) trend = 'decreasing';
      else trend = 'stable';

      const allConfidences = history.map((c) => c.newConfidence);
      avgConfidence = Math.round(
        (allConfidences.reduce((s, c) => s + c, 0) / allConfidences.length) * 1000,
      ) / 1000;
    }

    return {
      relationshipId: k,
      fromNodeId,
      type,
      toNodeId,
      currentConfidence,
      changes: [...history].reverse(), // Newest first
      trend,
      avgConfidence,
    };
  }

  /** Returns the number of tracked relationships. */
  size(): number {
    return this.changes.size;
  }

  /** Clears all trending data. Used in testing. */
  clear(): void {
    this.changes.clear();
  }
}
