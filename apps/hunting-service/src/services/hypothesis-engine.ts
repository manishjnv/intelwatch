import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession } from '../schemas/hunting.js';

export const HYPOTHESIS_VERDICTS = [
  'pending', 'confirmed', 'refuted', 'inconclusive',
] as const;
export type HypothesisVerdict = (typeof HYPOTHESIS_VERDICTS)[number];

export interface Hypothesis {
  id: string;
  huntId: string;
  statement: string;
  rationale: string;
  verdict: HypothesisVerdict;
  evidenceIds: string[];
  mitreTechniques: string[];
  confidence: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  verdictSetBy?: string;
  verdictSetAt?: string;
}

/**
 * #6 Hunt Hypothesis Engine — structured hypothesis tracking with evidence linking.
 *
 * Each hunt can have multiple hypotheses. Analysts create, link evidence,
 * and set verdicts (confirmed/refuted/inconclusive). Confidence auto-adjusts
 * based on linked evidence count and verdict.
 */
export class HypothesisEngine {
  /** huntId → hypothesisId → Hypothesis */
  private readonly hypotheses = new Map<string, Map<string, Hypothesis>>();
  private readonly store: HuntingStore;

  constructor(store: HuntingStore) {
    this.store = store;
  }

  /** Create a new hypothesis for a hunt. */
  create(
    tenantId: string,
    huntId: string,
    userId: string,
    input: {
      statement: string;
      rationale: string;
      mitreTechniques?: string[];
    },
  ): Hypothesis {
    this.requireHunt(tenantId, huntId);

    const now = new Date().toISOString();
    const hypothesis: Hypothesis = {
      id: randomUUID(),
      huntId,
      statement: input.statement,
      rationale: input.rationale,
      verdict: 'pending',
      evidenceIds: [],
      mitreTechniques: input.mitreTechniques ?? [],
      confidence: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    this.getHuntHypotheses(huntId).set(hypothesis.id, hypothesis);
    return hypothesis;
  }

  /** Get a hypothesis by ID. */
  get(tenantId: string, huntId: string, hypothesisId: string): Hypothesis {
    this.requireHunt(tenantId, huntId);
    const h = this.getHuntHypotheses(huntId).get(hypothesisId);
    if (!h) {
      throw new AppError(404, `Hypothesis ${hypothesisId} not found`, 'HYPOTHESIS_NOT_FOUND');
    }
    return h;
  }

  /** List all hypotheses for a hunt. */
  list(tenantId: string, huntId: string): Hypothesis[] {
    this.requireHunt(tenantId, huntId);
    return Array.from(this.getHuntHypotheses(huntId).values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Set the verdict on a hypothesis. */
  setVerdict(
    tenantId: string,
    huntId: string,
    hypothesisId: string,
    userId: string,
    verdict: HypothesisVerdict,
  ): Hypothesis {
    const h = this.get(tenantId, huntId, hypothesisId);
    h.verdict = verdict;
    h.verdictSetBy = userId;
    h.verdictSetAt = new Date().toISOString();
    h.updatedAt = h.verdictSetAt;
    h.confidence = this.calculateConfidence(h);
    return h;
  }

  /** Link evidence to a hypothesis. */
  linkEvidence(
    tenantId: string,
    huntId: string,
    hypothesisId: string,
    evidenceId: string,
  ): Hypothesis {
    const h = this.get(tenantId, huntId, hypothesisId);
    if (!h.evidenceIds.includes(evidenceId)) {
      h.evidenceIds.push(evidenceId);
      h.updatedAt = new Date().toISOString();
      h.confidence = this.calculateConfidence(h);
    }
    return h;
  }

  /** Unlink evidence from a hypothesis. */
  unlinkEvidence(
    tenantId: string,
    huntId: string,
    hypothesisId: string,
    evidenceId: string,
  ): Hypothesis {
    const h = this.get(tenantId, huntId, hypothesisId);
    const idx = h.evidenceIds.indexOf(evidenceId);
    if (idx >= 0) {
      h.evidenceIds.splice(idx, 1);
      h.updatedAt = new Date().toISOString();
      h.confidence = this.calculateConfidence(h);
    }
    return h;
  }

  /** Delete a hypothesis. */
  delete(tenantId: string, huntId: string, hypothesisId: string): void {
    this.requireHunt(tenantId, huntId);
    const map = this.getHuntHypotheses(huntId);
    if (!map.has(hypothesisId)) {
      throw new AppError(404, `Hypothesis ${hypothesisId} not found`, 'HYPOTHESIS_NOT_FOUND');
    }
    map.delete(hypothesisId);
  }

  /** Calculate confidence based on evidence count and verdict. */
  private calculateConfidence(h: Hypothesis): number {
    const evidenceScore = Math.min(h.evidenceIds.length * 15, 60);
    const verdictMultiplier =
      h.verdict === 'confirmed' ? 1.0 :
      h.verdict === 'refuted' ? 0.1 :
      h.verdict === 'inconclusive' ? 0.5 :
      0.3; // pending
    return Math.round(evidenceScore * verdictMultiplier);
  }

  /** Get or create the hypothesis map for a hunt. */
  private getHuntHypotheses(huntId: string): Map<string, Hypothesis> {
    let map = this.hypotheses.get(huntId);
    if (!map) {
      map = new Map();
      this.hypotheses.set(huntId, map);
    }
    return map;
  }

  /** Verify the hunt exists in the store. */
  private requireHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
