/**
 * #4 — TTP Similarity Scoring
 * Sorensen-Dice coefficient on MITRE ATT&CK technique sets.
 * Quantifies behavioral similarity between entities.
 */

export interface TTPSimilarityResult {
  entityA: string;
  entityB: string;
  diceCoefficient: number;
  sharedTechniques: string[];
  totalUniqueTechniques: number;
}

export class TTPSimilarityService {
  /**
   * Sorensen-Dice coefficient: 2|A ∩ B| / (|A| + |B|)
   * Returns 0 when both sets are empty, 1 when identical.
   */
  diceCoefficient(techniquesA: string[], techniquesB: string[]): number {
    if (techniquesA.length === 0 && techniquesB.length === 0) return 0;
    if (techniquesA.length === 0 || techniquesB.length === 0) return 0;

    const setA = new Set(techniquesA);
    const setB = new Set(techniquesB);

    let intersection = 0;
    for (const t of setA) {
      if (setB.has(t)) intersection++;
    }

    return (2 * intersection) / (setA.size + setB.size);
  }

  /** Find shared techniques between two sets */
  sharedTechniques(techniquesA: string[], techniquesB: string[]): string[] {
    const setB = new Set(techniquesB);
    return techniquesA.filter((t) => setB.has(t));
  }

  /** Compare two entities by their MITRE ATT&CK technique sets */
  compare(
    entityA: { id: string; mitreAttack: string[] },
    entityB: { id: string; mitreAttack: string[] },
  ): TTPSimilarityResult {
    const shared = this.sharedTechniques(entityA.mitreAttack, entityB.mitreAttack);
    const allTechniques = new Set([...entityA.mitreAttack, ...entityB.mitreAttack]);

    return {
      entityA: entityA.id,
      entityB: entityB.id,
      diceCoefficient: Math.round(this.diceCoefficient(entityA.mitreAttack, entityB.mitreAttack) * 1000) / 1000,
      sharedTechniques: shared,
      totalUniqueTechniques: allTechniques.size,
    };
  }

  /** Compare one entity against all others, return sorted by similarity */
  compareAll(
    target: { id: string; mitreAttack: string[] },
    others: Array<{ id: string; mitreAttack: string[] }>,
    minScore: number = 0.1,
  ): TTPSimilarityResult[] {
    const results: TTPSimilarityResult[] = [];

    for (const other of others) {
      if (other.id === target.id) continue;
      const result = this.compare(target, other);
      if (result.diceCoefficient >= minScore) {
        results.push(result);
      }
    }

    return results.sort((a, b) => b.diceCoefficient - a.diceCoefficient);
  }
}
