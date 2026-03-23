import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession, HuntSeverity } from '../schemas/hunting.js';

export interface HuntScore {
  huntId: string;
  overallScore: number;
  components: {
    severityScore: number;
    entityRiskScore: number;
    correlationScore: number;
    evidenceScore: number;
    recencyScore: number;
  };
  priority: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface PrioritizedHunt {
  hunt: HuntSession;
  score: HuntScore;
}

const SEVERITY_WEIGHTS: Record<HuntSeverity, number> = {
  critical: 100,
  high: 80,
  medium: 50,
  low: 25,
  info: 10,
};

/**
 * #13 Hunt Scoring & Prioritization — risk-based hunt ranking.
 *
 * Calculates a composite score from: severity, entity risk,
 * correlation confidence, evidence volume, and recency.
 * Provides ranked hunt lists for analyst triage.
 */
export class HuntScoring {
  private readonly store: HuntingStore;

  constructor(store: HuntingStore) {
    this.store = store;
  }

  /** Score a single hunt. */
  scoreHunt(tenantId: string, huntId: string): HuntScore {
    const session = this.requireHunt(tenantId, huntId);
    return this.calculateScore(session);
  }

  /** Score and rank all active hunts for a tenant. */
  prioritize(tenantId: string): PrioritizedHunt[] {
    const sessions = Array.from(this.store.getTenantSessions(tenantId).values());
    const active = sessions.filter(
      (s) => s.status === 'active' || s.status === 'draft' || s.status === 'paused',
    );

    const scored: PrioritizedHunt[] = active.map((hunt) => ({
      hunt,
      score: this.calculateScore(hunt),
    }));

    return scored.sort((a, b) => b.score.overallScore - a.score.overallScore);
  }

  /** Calculate composite score for a hunt. */
  private calculateScore(session: HuntSession): HuntScore {
    const severityScore = SEVERITY_WEIGHTS[session.severity] ?? 50;
    const entityRiskScore = this.calculateEntityRiskScore(session);
    const correlationScore = this.calculateCorrelationScore(session);
    const evidenceScore = Math.min(session.queryHistory.length * 10, 100);
    const recencyScore = this.calculateRecencyScore(session);

    // Weighted composite: severity 30%, entity risk 25%, correlation 20%, evidence 15%, recency 10%
    const overallScore = Math.round(
      severityScore * 0.3 +
      entityRiskScore * 0.25 +
      correlationScore * 0.2 +
      evidenceScore * 0.15 +
      recencyScore * 0.1,
    );

    const priority = this.scoreToPriority(overallScore);
    const recommendation = this.generateRecommendation(session, overallScore, priority);

    return {
      huntId: session.id,
      overallScore,
      components: {
        severityScore,
        entityRiskScore,
        correlationScore,
        evidenceScore,
        recencyScore,
      },
      priority,
      recommendation,
    };
  }

  /** Calculate entity risk score based on count and diversity. */
  private calculateEntityRiskScore(session: HuntSession): number {
    if (session.entities.length === 0) return 0;
    const typeCount = new Set(session.entities.map((e) => e.type)).size;
    const entityCountScore = Math.min(session.entities.length * 5, 50);
    const diversityScore = Math.min(typeCount * 10, 50);
    return entityCountScore + diversityScore;
  }

  /** Calculate correlation score based on linked leads. */
  private calculateCorrelationScore(session: HuntSession): number {
    return Math.min(session.correlationLeads.length * 20, 100);
  }

  /** Calculate recency score (more recent = higher score). */
  private calculateRecencyScore(session: HuntSession): number {
    const hoursSinceUpdate = (Date.now() - new Date(session.updatedAt).getTime()) / 3600000;
    if (hoursSinceUpdate < 1) return 100;
    if (hoursSinceUpdate < 24) return 80;
    if (hoursSinceUpdate < 72) return 60;
    if (hoursSinceUpdate < 168) return 40;
    return 20;
  }

  /** Map overall score to priority level. */
  private scoreToPriority(score: number): HuntScore['priority'] {
    if (score >= 75) return 'critical';
    if (score >= 55) return 'high';
    if (score >= 35) return 'medium';
    return 'low';
  }

  /** Generate a human-readable recommendation. */
  private generateRecommendation(
    session: HuntSession,
    score: number,
    priority: string,
  ): string {
    if (session.entities.length === 0) {
      return 'Add seed entities to begin investigation';
    }
    if (session.correlationLeads.length === 0) {
      return 'Run correlation auto-link to discover related patterns';
    }
    if (score >= 75) {
      return 'High-priority hunt — requires immediate analyst attention';
    }
    if (session.status === 'paused') {
      return 'Review and resume — paused hunt with active indicators';
    }
    return `Continue investigation — ${priority} priority based on current evidence`;
  }

  private requireHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
