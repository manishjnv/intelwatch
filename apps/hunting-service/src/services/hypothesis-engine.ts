import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession } from '../schemas/hunting.js';
import type { DocRepo } from '../doc-repo.js';
import { MemoryDocRepo } from '../doc-repo.js';

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

export type HypothesisDoc = Hypothesis & { tenantId: string };

/**
 * #6 Hunt Hypothesis Engine — structured hypothesis tracking with evidence linking.
 *
 * Each hunt can have multiple hypotheses. Analysts create, link evidence,
 * and set verdicts (confirmed/refuted/inconclusive). Confidence auto-adjusts
 * based on linked evidence count and verdict.
 */
export class HypothesisEngine {
  private readonly store: HuntingStore;
  private readonly repo: DocRepo<HypothesisDoc>;

  constructor(store: HuntingStore, repo: DocRepo<HypothesisDoc> = new MemoryDocRepo()) {
    this.store = store;
    this.repo = repo;
    store.registerCascadeRepo({ deleteByParent: (t, h) => this.repo.deleteByParent(t, h) });
  }

  /** Create a new hypothesis for a hunt. */
  async create(
    tenantId: string,
    huntId: string,
    userId: string,
    input: {
      statement: string;
      rationale: string;
      mitreTechniques?: string[];
    },
  ): Promise<Hypothesis> {
    await this.requireHunt(tenantId, huntId);

    const now = new Date().toISOString();
    const hypothesis: HypothesisDoc = {
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
      tenantId,
    };

    await this.repo.save(hypothesis, huntId);
    return hypothesis;
  }

  /** Get a hypothesis by ID. */
  async get(tenantId: string, huntId: string, hypothesisId: string): Promise<Hypothesis> {
    await this.requireHunt(tenantId, huntId);
    const h = await this.repo.get(hypothesisId, tenantId);
    if (!h || h.huntId !== huntId) {
      throw new AppError(404, `Hypothesis ${hypothesisId} not found`, 'HYPOTHESIS_NOT_FOUND');
    }
    return h;
  }

  /** List all hypotheses for a hunt. */
  async list(tenantId: string, huntId: string): Promise<Hypothesis[]> {
    await this.requireHunt(tenantId, huntId);
    const all = await this.repo.list(tenantId, huntId);
    return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Set the verdict on a hypothesis. */
  async setVerdict(
    tenantId: string,
    huntId: string,
    hypothesisId: string,
    userId: string,
    verdict: HypothesisVerdict,
  ): Promise<Hypothesis> {
    const h = await this.get(tenantId, huntId, hypothesisId);
    h.verdict = verdict;
    h.verdictSetBy = userId;
    h.verdictSetAt = new Date().toISOString();
    h.updatedAt = h.verdictSetAt;
    h.confidence = this.calculateConfidence(h);
    await this.repo.save(h as HypothesisDoc, huntId);
    return h;
  }

  /** Link evidence to a hypothesis. */
  async linkEvidence(
    tenantId: string,
    huntId: string,
    hypothesisId: string,
    evidenceId: string,
  ): Promise<Hypothesis> {
    const h = await this.get(tenantId, huntId, hypothesisId);
    if (!h.evidenceIds.includes(evidenceId)) {
      h.evidenceIds.push(evidenceId);
      h.updatedAt = new Date().toISOString();
      h.confidence = this.calculateConfidence(h);
      await this.repo.save(h as HypothesisDoc, huntId);
    }
    return h;
  }

  /** Unlink evidence from a hypothesis. */
  async unlinkEvidence(
    tenantId: string,
    huntId: string,
    hypothesisId: string,
    evidenceId: string,
  ): Promise<Hypothesis> {
    const h = await this.get(tenantId, huntId, hypothesisId);
    const idx = h.evidenceIds.indexOf(evidenceId);
    if (idx >= 0) {
      h.evidenceIds.splice(idx, 1);
      h.updatedAt = new Date().toISOString();
      h.confidence = this.calculateConfidence(h);
      await this.repo.save(h as HypothesisDoc, huntId);
    }
    return h;
  }

  /** Delete a hypothesis. */
  async delete(tenantId: string, huntId: string, hypothesisId: string): Promise<void> {
    await this.requireHunt(tenantId, huntId);
    const h = await this.repo.get(hypothesisId, tenantId);
    if (!h || h.huntId !== huntId) {
      throw new AppError(404, `Hypothesis ${hypothesisId} not found`, 'HYPOTHESIS_NOT_FOUND');
    }
    await this.repo.delete(hypothesisId, tenantId);
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

  /** Verify the hunt exists in the store. */
  private async requireHunt(tenantId: string, huntId: string): Promise<HuntSession> {
    const session = await this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
