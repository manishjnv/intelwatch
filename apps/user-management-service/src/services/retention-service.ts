/**
 * @module RetentionService
 * @description I-20 — Data retention enforcement.
 * Daily job archives/soft-deletes records older than tenant's retention policy.
 * Retention days come from PlanFeatureLimit (data_retention key).
 * Audit logs are EXEMPT from retention (compliance requirement).
 */
import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from './audit-logger.js';
import type {
  TenantRetentionInfo,
  RetentionRunSummary,
  RetentionRecordsAtRisk,
} from '@etip/shared-types';

/** Default retention days per plan (used when PlanFeatureLimit not found). */
const DEFAULT_RETENTION: Record<string, number> = {
  free: 30,
  starter: 90,
  pro: 365,
  enterprise: -1, // unlimited
};

/** Next upgrade suggestion per plan. */
const UPGRADE_MAP: Record<string, { plan: string; retentionDays: number } | null> = {
  free: { plan: 'starter', retentionDays: 90 },
  starter: { plan: 'pro', retentionDays: 365 },
  pro: { plan: 'enterprise', retentionDays: -1 },
  enterprise: null,
};

/** In-memory retention run history. */
const runHistory: RetentionRunSummary[] = [];

export interface RetentionDeps {
  prisma: PrismaClient;
  auditLogger: AuditLogger;
}

export class RetentionService {
  private prisma: PrismaClient;
  private auditLogger: AuditLogger;

  constructor(deps: RetentionDeps) {
    this.prisma = deps.prisma;
    this.auditLogger = deps.auditLogger;
  }

  /** Run daily retention enforcement for all active tenants. */
  async enforceRetention(): Promise<RetentionRunSummary[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { active: true, offboardingStatus: { not: 'offboarding' } },
      select: { id: true, name: true, plan: true },
    });

    const results: RetentionRunSummary[] = [];

    for (const tenant of tenants) {
      const retentionDays = await this.getRetentionDays(tenant.id, tenant.plan);
      if (retentionDays === -1) continue; // unlimited

      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoffDate.toISOString().split('T')[0]!;

      const archived = await this.archiveTenantRecords(tenant.id, cutoffDate);

      const summary: RetentionRunSummary = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        retentionDays,
        cutoffDate: cutoffStr,
        recordsArchived: archived,
        runAt: new Date().toISOString(),
      };
      results.push(summary);

      const totalArchived = archived.iocs + archived.threatActors +
        archived.malwareProfiles + archived.vulnerabilityProfiles + archived.articles;

      if (totalArchived > 0) {
        this.auditLogger.log({
          tenantId: tenant.id,
          userId: null,
          action: 'data_retention.enforced',
          riskLevel: 'medium',
          details: {
            retentionDays,
            cutoffDate: cutoffStr,
            recordsArchived: archived,
          },
        });
      }
    }

    // Also cleanup expired sessions globally
    await this.cleanupExpiredSessions();

    // Store in history
    runHistory.push(...results);
    // Keep last 100 entries
    if (runHistory.length > 100) runHistory.splice(0, runHistory.length - 100);

    return results;
  }

  /** Soft-delete records older than cutoff by setting archivedAt. */
  private async archiveTenantRecords(
    tenantId: string,
    cutoffDate: Date,
  ): Promise<RetentionRecordsAtRisk> {
    const archiveReason = 'retention_policy';
    const now = new Date();

    const [iocResult, actorResult, malwareResult, vulnResult, articleResult] = await Promise.all([
      this.prisma.ioc.updateMany({
        where: { tenantId, createdAt: { lt: cutoffDate }, archivedAt: null },
        data: { archivedAt: now, archiveReason },
      }),
      this.prisma.threatActorProfile.updateMany({
        where: { tenantId, updatedAt: { lt: cutoffDate }, archivedAt: null },
        data: { archivedAt: now, archiveReason },
      }),
      this.prisma.malwareProfile.updateMany({
        where: { tenantId, updatedAt: { lt: cutoffDate }, archivedAt: null },
        data: { archivedAt: now, archiveReason },
      }),
      this.prisma.vulnerabilityProfile.updateMany({
        where: { tenantId, updatedAt: { lt: cutoffDate }, archivedAt: null },
        data: { archivedAt: now, archiveReason },
      }),
      this.prisma.article.updateMany({
        where: { tenantId, publishedAt: { lt: cutoffDate }, archivedAt: null },
        data: { archivedAt: now, archiveReason },
      }),
    ]);

    return {
      iocs: iocResult.count,
      threatActors: actorResult.count,
      malwareProfiles: malwareResult.count,
      vulnerabilityProfiles: vulnResult.count,
      articles: articleResult.count,
    };
  }

  /** Cleanup expired sessions globally. */
  private async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });
    return result.count;
  }

  /** Get retention days for a tenant from plan feature limits. */
  private async getRetentionDays(tenantId: string, plan: string): Promise<number> {
    // Check for tenant-specific override first
    const override = await this.prisma.tenantFeatureOverride.findFirst({
      where: { tenantId, featureKey: 'data_retention' },
      select: { limitTotal: true },
    });
    if (override?.limitTotal != null) {
      return override.limitTotal;
    }

    // Check plan feature limit via SubscriptionPlanDefinition
    const planDef = await this.prisma.subscriptionPlanDefinition.findFirst({
      where: { planId: plan },
      select: { id: true },
    });
    if (planDef) {
      const feature = await this.prisma.planFeatureLimit.findFirst({
        where: { planDefId: planDef.id, featureKey: 'data_retention' },
        select: { limitTotal: true },
      });
      if (feature?.limitTotal != null && feature.limitTotal !== -1) {
        return feature.limitTotal;
      }
    }

    // Fallback to defaults
    return DEFAULT_RETENTION[plan] ?? 30;
  }

  /** GET /billing/retention — Tenant's own retention info. */
  async getTenantRetentionInfo(tenantId: string): Promise<TenantRetentionInfo> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    if (!tenant) {
      return this.buildRetentionInfo('free', tenantId, 30);
    }

    const retentionDays = await this.getRetentionDays(tenantId, tenant.plan);
    return this.buildRetentionInfo(tenant.plan, tenantId, retentionDays);
  }

  /** Build retention info response with at-risk record counts. */
  private async buildRetentionInfo(
    plan: string,
    tenantId: string,
    retentionDays: number,
  ): Promise<TenantRetentionInfo> {
    const cutoffDate = retentionDays === -1
      ? new Date(0) // unlimited — nothing at risk
      : new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().split('T')[0]!;

    const recordsAtRisk = retentionDays === -1
      ? { iocs: 0, threatActors: 0, malwareProfiles: 0, vulnerabilityProfiles: 0, articles: 0 }
      : await this.countAtRiskRecords(tenantId, cutoffDate);

    // Next run at 02:00 UTC tomorrow
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0);

    const upgrade = UPGRADE_MAP[plan] ?? null;

    return {
      retentionDays,
      plan,
      cutoffDate: cutoffStr,
      recordsAtRisk,
      nextRunAt: tomorrow.toISOString(),
      upgradeForMore: upgrade ? {
        plan: upgrade.plan,
        retentionDays: upgrade.retentionDays,
        upgradeUrl: '/command-center?tab=billing',
      } : null,
    };
  }

  /** Count records at risk of archival. */
  private async countAtRiskRecords(
    tenantId: string,
    cutoffDate: Date,
  ): Promise<RetentionRecordsAtRisk> {
    const [iocs, actors, malware, vulns, articles] = await Promise.all([
      this.prisma.ioc.count({
        where: { tenantId, createdAt: { lt: cutoffDate }, archivedAt: null },
      }),
      this.prisma.threatActorProfile.count({
        where: { tenantId, updatedAt: { lt: cutoffDate }, archivedAt: null },
      }),
      this.prisma.malwareProfile.count({
        where: { tenantId, updatedAt: { lt: cutoffDate }, archivedAt: null },
      }),
      this.prisma.vulnerabilityProfile.count({
        where: { tenantId, updatedAt: { lt: cutoffDate }, archivedAt: null },
      }),
      this.prisma.article.count({
        where: { tenantId, publishedAt: { lt: cutoffDate }, archivedAt: null },
      }),
    ]);

    return {
      iocs,
      threatActors: actors,
      malwareProfiles: malware,
      vulnerabilityProfiles: vulns,
      articles,
    };
  }

  /** GET /admin/retention/status — Admin view of all tenants. */
  async getAdminStatus(): Promise<{ tenants: RetentionRunSummary[]; lastRunAt: string | null; nextRunAt: string }> {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0);

    const lastRun = runHistory.length > 0 ? runHistory[runHistory.length - 1]! : null;

    return {
      tenants: runHistory.slice(-20), // last 20 entries
      lastRunAt: lastRun?.runAt ?? null,
      nextRunAt: tomorrow.toISOString(),
    };
  }

  /** GET /admin/retention/history — All past retention runs. */
  getHistory(): RetentionRunSummary[] {
    return [...runHistory];
  }
}
