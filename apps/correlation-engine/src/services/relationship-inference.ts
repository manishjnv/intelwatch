/**
 * #10 — Cross-Entity Relationship Inference
 * BFS transitive closure with confidence decay.
 * If A→X at 0.9 and X→Y at 0.8, infers A~Y at 0.9×0.8×decay.
 */
import type { InferredRelationship } from '../schemas/correlation.js';

export interface RelationshipInferenceConfig {
  decayFactor: number;    // Confidence multiplier per hop (0-1)
  maxDepth: number;       // Maximum transitive hops
  minConfidence: number;  // Stop when confidence drops below this
}

const DEFAULT_CONFIG: RelationshipInferenceConfig = {
  decayFactor: 0.8,
  maxDepth: 3,
  minConfidence: 0.1,
};

/** A known direct relationship between two entities */
export interface DirectRelationship {
  fromId: string;
  toId: string;
  confidence: number;
}

export class RelationshipInferenceService {
  private readonly config: RelationshipInferenceConfig;

  constructor(config: Partial<RelationshipInferenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Build adjacency list from direct relationships */
  buildAdjacencyList(relationships: DirectRelationship[]): Map<string, Array<{ targetId: string; confidence: number }>> {
    const adj = new Map<string, Array<{ targetId: string; confidence: number }>>();

    for (const rel of relationships) {
      // Bidirectional edges
      if (!adj.has(rel.fromId)) adj.set(rel.fromId, []);
      adj.get(rel.fromId)!.push({ targetId: rel.toId, confidence: rel.confidence });

      if (!adj.has(rel.toId)) adj.set(rel.toId, []);
      adj.get(rel.toId)!.push({ targetId: rel.fromId, confidence: rel.confidence });
    }

    return adj;
  }

  /** BFS-based transitive closure from a source entity */
  inferFromEntity(
    sourceId: string,
    relationships: DirectRelationship[],
  ): InferredRelationship[] {
    const adj = this.buildAdjacencyList(relationships);
    const inferred: InferredRelationship[] = [];
    const visited = new Set<string>();
    visited.add(sourceId);

    // BFS queue: [currentId, currentConfidence, path, depth]
    const queue: Array<[string, number, string[], number]> = [];

    // Seed with direct neighbors
    const neighbors = adj.get(sourceId) ?? [];
    for (const neighbor of neighbors) {
      queue.push([neighbor.targetId, neighbor.confidence, [sourceId, neighbor.targetId], 1]);
    }

    while (queue.length > 0) {
      const [currentId, currentConf, path, depth] = queue.shift()!;

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      // Record inferred relationship (skip depth 1 — those are direct)
      if (depth > 1) {
        const decayedConf = currentConf * Math.pow(this.config.decayFactor, depth - 1);
        if (decayedConf >= this.config.minConfidence) {
          inferred.push({
            fromEntityId: sourceId,
            toEntityId: currentId,
            confidence: Math.round(decayedConf * 1000) / 1000,
            path,
            depth,
          });
        }
      }

      // Expand if not at max depth
      if (depth < this.config.maxDepth) {
        const nextNeighbors = adj.get(currentId) ?? [];
        for (const next of nextNeighbors) {
          if (!visited.has(next.targetId)) {
            const nextConf = currentConf * next.confidence;
            if (nextConf * Math.pow(this.config.decayFactor, depth) >= this.config.minConfidence) {
              queue.push([
                next.targetId,
                nextConf,
                [...path, next.targetId],
                depth + 1,
              ]);
            }
          }
        }
      }
    }

    return inferred.sort((a, b) => b.confidence - a.confidence);
  }

  /** Infer all relationships for multiple source entities */
  inferAll(
    sourceIds: string[],
    relationships: DirectRelationship[],
  ): Map<string, InferredRelationship[]> {
    const results = new Map<string, InferredRelationship[]>();

    for (const sourceId of sourceIds) {
      const inferred = this.inferFromEntity(sourceId, relationships);
      if (inferred.length > 0) {
        results.set(sourceId, inferred);
      }
    }

    return results;
  }

  /** Get config */
  getConfig(): RelationshipInferenceConfig {
    return { ...this.config };
  }
}
