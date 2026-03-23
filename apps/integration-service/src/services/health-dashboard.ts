import type { IntegrationStore } from './integration-store.js';
import type { IntegrationRateLimiter } from './rate-limiter.js';

/** Per-integration health snapshot. */
export interface IntegrationHealth {
  integrationId: string;
  name: string;
  type: string;
  enabled: boolean;
  successCount: number;
  failureCount: number;
  totalCount: number;
  successRate: number;
  lastError: string | null;
  lastUsedAt: string | null;
  uptimePercent: number;
  rateLimit: {
    maxPerMinute: number;
    remainingTokens: number;
    resetInMs: number;
  };
}

/** Aggregate health summary across all integrations. */
export interface HealthSummary {
  totalIntegrations: number;
  enabledIntegrations: number;
  overallSuccessRate: number;
  totalEvents: number;
  totalFailures: number;
  dlqSize: number;
  integrations: IntegrationHealth[];
}

/**
 * Integration health dashboard service.
 * Computes uptime, success rate, and last error per integration
 * from the in-memory log store.
 */
export class HealthDashboard {
  constructor(
    private readonly store: IntegrationStore,
    private readonly rateLimiter: IntegrationRateLimiter,
  ) {}

  /** Get health summary for all integrations in a tenant. */
  getSummary(tenantId: string): HealthSummary {
    const { data: integrations } = this.store.listIntegrations(tenantId, {
      page: 1,
      limit: 500,
    });

    const healthList: IntegrationHealth[] = integrations.map((integration) => {
      const { data: logs } = this.store.listLogs(
        integration.id, tenantId, { page: 1, limit: 1000 },
      );

      const successCount = logs.filter((l) => l.status === 'success').length;
      const failureCount = logs.filter((l) => l.status === 'failure' || l.status === 'dead_letter').length;
      const totalCount = logs.length;
      const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;

      const lastFailure = logs.find((l) => l.status === 'failure' || l.status === 'dead_letter');

      // Uptime: percentage of time with no failures in last 24h
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const recentLogs = logs.filter((l) => l.createdAt >= oneDayAgo);
      const recentFailures = recentLogs.filter(
        (l) => l.status === 'failure' || l.status === 'dead_letter',
      ).length;
      const recentTotal = recentLogs.length;
      const uptimePercent = recentTotal > 0
        ? Math.round(((recentTotal - recentFailures) / recentTotal) * 100)
        : 100;

      return {
        integrationId: integration.id,
        name: integration.name,
        type: integration.type,
        enabled: integration.enabled,
        successCount,
        failureCount,
        totalCount,
        successRate,
        lastError: lastFailure?.errorMessage ?? null,
        lastUsedAt: integration.lastUsedAt,
        uptimePercent,
        rateLimit: this.rateLimiter.getStatus(integration.id),
      };
    });

    const totalEvents = healthList.reduce((sum, h) => sum + h.totalCount, 0);
    const totalFailures = healthList.reduce((sum, h) => sum + h.failureCount, 0);
    const overallSuccessRate = totalEvents > 0
      ? Math.round(((totalEvents - totalFailures) / totalEvents) * 100)
      : 100;

    const dlq = this.store.listDLQ(tenantId, { page: 1, limit: 1 });

    return {
      totalIntegrations: integrations.length,
      enabledIntegrations: integrations.filter((i) => i.enabled).length,
      overallSuccessRate,
      totalEvents,
      totalFailures,
      dlqSize: dlq.total,
      integrations: healthList,
    };
  }

  /** Get health for a single integration. */
  getIntegrationHealth(integrationId: string, tenantId: string): IntegrationHealth | null {
    const integration = this.store.getIntegration(integrationId, tenantId);
    if (!integration) return null;

    const { data: logs } = this.store.listLogs(
      integrationId, tenantId, { page: 1, limit: 1000 },
    );

    const successCount = logs.filter((l) => l.status === 'success').length;
    const failureCount = logs.filter((l) => l.status === 'failure' || l.status === 'dead_letter').length;
    const totalCount = logs.length;
    const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;
    const lastFailure = logs.find((l) => l.status === 'failure' || l.status === 'dead_letter');

    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const recentLogs = logs.filter((l) => l.createdAt >= oneDayAgo);
    const recentFailures = recentLogs.filter(
      (l) => l.status === 'failure' || l.status === 'dead_letter',
    ).length;
    const recentTotal = recentLogs.length;
    const uptimePercent = recentTotal > 0
      ? Math.round(((recentTotal - recentFailures) / recentTotal) * 100)
      : 100;

    return {
      integrationId: integration.id,
      name: integration.name,
      type: integration.type,
      enabled: integration.enabled,
      successCount,
      failureCount,
      totalCount,
      successRate,
      lastError: lastFailure?.errorMessage ?? null,
      lastUsedAt: integration.lastUsedAt,
      uptimePercent,
      rateLimit: this.rateLimiter.getStatus(integrationId),
    };
  }
}
