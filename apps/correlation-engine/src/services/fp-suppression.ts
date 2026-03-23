/**
 * #9 — False Positive Suppression Engine
 * Tracks analyst feedback, computes per-rule FP rates,
 * auto-suppresses rules exceeding configurable threshold.
 */
import { randomUUID } from 'crypto';
import type {
  FPFeedback, RuleStats, CorrelationResult,
} from '../schemas/correlation.js';

export interface FPSuppressionConfig {
  fpThreshold: number;   // Auto-suppress above this FP rate (0-1)
  minSamples: number;    // Minimum feedback count before auto-suppress
}

const DEFAULT_CONFIG: FPSuppressionConfig = {
  fpThreshold: 0.7,
  minSamples: 5,
};

export class FPSuppressionService {
  private readonly config: FPSuppressionConfig;

  constructor(config: Partial<FPSuppressionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Record analyst feedback on a correlation result */
  recordFeedback(
    tenantId: string,
    correlationId: string,
    verdict: 'true_positive' | 'false_positive',
    analystId: string,
    feedbackStore: FPFeedback[],
    ruleStatsStore: Map<string, RuleStats>,
    ruleId: string,
    reason?: string,
  ): FPFeedback {
    const feedback: FPFeedback = {
      id: randomUUID(),
      tenantId,
      correlationId,
      verdict,
      analystId,
      reason,
      submittedAt: new Date().toISOString(),
    };

    feedbackStore.push(feedback);
    this.updateRuleStats(ruleId, verdict, ruleStatsStore);

    return feedback;
  }

  /** Update rule statistics based on new feedback */
  updateRuleStats(
    ruleId: string,
    verdict: 'true_positive' | 'false_positive',
    ruleStatsStore: Map<string, RuleStats>,
  ): RuleStats {
    const existing = ruleStatsStore.get(ruleId) ?? {
      ruleId,
      totalResults: 0,
      fpCount: 0,
      tpCount: 0,
      fpRate: 0,
      suppressed: false,
    };

    if (verdict === 'false_positive') existing.fpCount++;
    else existing.tpCount++;
    existing.totalResults = existing.fpCount + existing.tpCount;

    existing.fpRate = existing.totalResults > 0
      ? Math.round((existing.fpCount / existing.totalResults) * 1000) / 1000
      : 0;

    // Auto-suppress check
    existing.suppressed = this.shouldSuppress(existing);

    ruleStatsStore.set(ruleId, existing);
    return existing;
  }

  /** Check if a rule should be auto-suppressed */
  shouldSuppress(stats: RuleStats): boolean {
    return stats.totalResults >= this.config.minSamples &&
           stats.fpRate >= this.config.fpThreshold;
  }

  /** Apply suppression to correlation results based on rule stats */
  applySuppression(
    results: CorrelationResult[],
    ruleStatsStore: Map<string, RuleStats>,
  ): CorrelationResult[] {
    return results.map((result) => {
      const stats = ruleStatsStore.get(result.ruleId);
      if (stats && stats.suppressed) {
        return { ...result, suppressed: true };
      }
      return result;
    });
  }

  /** Get all rule stats for a tenant */
  getAllRuleStats(ruleStatsStore: Map<string, RuleStats>): RuleStats[] {
    return Array.from(ruleStatsStore.values()).sort((a, b) => b.fpRate - a.fpRate);
  }

  /** Get suppressed rule IDs */
  getSuppressedRuleIds(ruleStatsStore: Map<string, RuleStats>): string[] {
    return Array.from(ruleStatsStore.values())
      .filter((s) => s.suppressed)
      .map((s) => s.ruleId);
  }

  /** Check if a specific rule is suppressed */
  isRuleSuppressed(ruleId: string, ruleStatsStore: Map<string, RuleStats>): boolean {
    const stats = ruleStatsStore.get(ruleId);
    return stats?.suppressed ?? false;
  }

  /** Get current config */
  getConfig(): FPSuppressionConfig {
    return { ...this.config };
  }
}
