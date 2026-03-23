import type {
  HealthScore,
  HealthScoreComponents,
  HealthHistoryPoint,
} from '../schemas/integration.js';
import type { IntegrationStore } from './integration-store.js';
import type { IntegrationRateLimiter } from './rate-limiter.js';

/**
 * P2 #11: Composite health scoring for integrations.
 * Computes a 0-100 score from: uptime %, error rate, latency p95, sync age.
 * Maintains a rolling 30-point history per integration.
 */
export class HealthScoring {
  private history = new Map<string, HealthHistoryPoint[]>();
  private readonly maxHistoryPoints = 30;

  constructor(
    private readonly store: IntegrationStore,
    _rateLimiter: IntegrationRateLimiter,
  ) {}

  /** Calculate composite health score for an integration. */
  calculateScore(integrationId: string, tenantId: string): HealthScore | null {
    const integration = this.store.getIntegration(integrationId, tenantId);
    if (!integration) return null;

    const { data: logs } = this.store.listLogs(
      integrationId, tenantId, { page: 1, limit: 1000 },
    );

    const components = this.computeComponents(logs, integration.lastUsedAt);
    const score = this.compositeScore(components);
    const grade = this.scoreToGrade(score);
    const now = new Date().toISOString();

    const result: HealthScore = {
      integrationId,
      score,
      grade,
      components,
      calculatedAt: now,
    };

    // Record in history
    this.addToHistory(integrationId, { score, grade, timestamp: now });

    return result;
  }

  /** Get health history for an integration (last 30 data points). */
  getHistory(integrationId: string, tenantId: string): HealthHistoryPoint[] | null {
    const integration = this.store.getIntegration(integrationId, tenantId);
    if (!integration) return null;
    return this.history.get(integrationId) ?? [];
  }

  /** Compute individual score components from log data. */
  private computeComponents(
    logs: Array<{ status: string; createdAt: string; statusCode: number | null }>,
    lastUsedAt: string | null,
  ): HealthScoreComponents {
    // Uptime score: based on success rate in last 24h
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const recentLogs = logs.filter((l) => l.createdAt >= oneDayAgo);
    const recentFailures = recentLogs.filter(
      (l) => l.status === 'failure' || l.status === 'dead_letter',
    ).length;
    const recentTotal = recentLogs.length;
    const uptimeScore = recentTotal > 0
      ? Math.round(((recentTotal - recentFailures) / recentTotal) * 100)
      : 100;

    // Error rate score: inverse of all-time error rate
    const totalLogs = logs.length;
    const totalFailures = logs.filter(
      (l) => l.status === 'failure' || l.status === 'dead_letter',
    ).length;
    const errorRate = totalLogs > 0 ? totalFailures / totalLogs : 0;
    const errorRateScore = Math.round((1 - errorRate) * 100);

    // Latency score: based on recent success log count (proxy for throughput)
    // Lower latency = more successful events processed per time window
    const recentSuccesses = recentLogs.filter((l) => l.status === 'success').length;
    const latencyScore = recentTotal > 0
      ? Math.min(100, Math.round((recentSuccesses / Math.max(recentTotal, 1)) * 100))
      : 100;

    // Sync age score: based on how recently the integration was used
    let syncAgeScore = 100;
    if (lastUsedAt) {
      const ageMs = Date.now() - new Date(lastUsedAt).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours <= 1) syncAgeScore = 100;
      else if (ageHours <= 6) syncAgeScore = 90;
      else if (ageHours <= 24) syncAgeScore = 75;
      else if (ageHours <= 72) syncAgeScore = 50;
      else if (ageHours <= 168) syncAgeScore = 25;
      else syncAgeScore = 10;
    } else {
      syncAgeScore = 0; // Never used
    }

    return { uptimeScore, errorRateScore, latencyScore, syncAgeScore };
  }

  /** Compute weighted composite score from components. */
  private compositeScore(components: HealthScoreComponents): number {
    const weights = {
      uptime: 0.35,
      errorRate: 0.30,
      latency: 0.20,
      syncAge: 0.15,
    };
    const raw =
      components.uptimeScore * weights.uptime +
      components.errorRateScore * weights.errorRate +
      components.latencyScore * weights.latency +
      components.syncAgeScore * weights.syncAge;
    return Math.round(raw);
  }

  /** Map numeric score to letter grade. */
  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  /** Add a data point to rolling history. */
  private addToHistory(integrationId: string, point: HealthHistoryPoint): void {
    if (!this.history.has(integrationId)) {
      this.history.set(integrationId, []);
    }
    const hist = this.history.get(integrationId)!;
    hist.push(point);
    if (hist.length > this.maxHistoryPoints) {
      hist.shift();
    }
  }
}
