/**
 * @module RetentionService (user-service)
 * @description I-20 — Data retention enforcement.
 * Imported by API gateway for route handling.
 * Daily job soft-deletes records older than tenant's retention policy.
 * Audit logs EXEMPT from retention (compliance).
 */
import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from './audit-logger.js';
import type {
  TenantRetentionInfo,
  RetentionRunSummary,
  RetentionRecordsAtRisk,
} from '@etip/shared-types';

const DEFAULT_RETENTION: Record<string, number> = {
  free: 30, starter: 90, pro: 365, enterprise: -1,
};
const UPGRADE_MAP: Record<string, { plan: string; retentionDays: number } | null> = {
  free: { plan: 'starter', retentionDays: 90 },
  starter: { plan: 'pro', retentionDays: 365 },
  pro: { plan: 'enterprise', retentionDays: -1 },
  enterprise: null,
};

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

  async enforceRetention(): Promise<RetentionRunSummary[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { active: true, offboardingStatus: { not: 'offboarding' } },
      select: { id: true, name: true, plan: true },
    });
    const results: RetentionRunSummary[] = [];

    for (const tenant of tenants) {
      const retentionDays = await this.getRetentionDays(tenant.id, tenant.plan);
      if (retentionDays === -1) continue;

      const cutoffDate = new Date(Date.now() - retentionDays * 86_400_000);
      const archived = await this.archiveRecords(tenant.id, cutoffDate);
      const total = archived.iocs + archived.threatActors + archived.malwareProfiles +
        archived.vulnerabilityProfiles + archived.articles;

      const summary: RetentionRunSummary = {
        tenantId: tenant.id, tenantName: tenant.name, retentionDays,
        cutoffDate: cutoffDate.toISOString().split('T')[0]!,
        recordsArchived: archived, runAt: new Date().toISOString(),
      };
      results.push(summary);

      if (total > 0) {
        this.auditLogger.log({
          tenantId: tenant.id, userId: null, action: 'data_retention.enforced', riskLevel: 'medium',
          details: { retentionDays, cutoffDate: summary.cutoffDate, recordsArchived: archived },
        });
      }
    }

    await this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
    });

    runHistory.push(...results);
    if (runHistory.length > 100) runHistory.splice(0, runHistory.length - 100);
    return results;
  }

  private async archiveRecords(tenantId: string, cutoff: Date): Promise<RetentionRecordsAtRisk> {
    const now = new Date();
    const reason = 'retention_policy';
    const [iocs, actors, malware, vulns, articles] = await Promise.all([
      this.prisma.ioc.updateMany({ where: { tenantId, createdAt: { lt: cutoff }, archivedAt: null }, data: { archivedAt: now, archiveReason: reason } }),
      this.prisma.threatActorProfile.updateMany({ where: { tenantId, updatedAt: { lt: cutoff }, archivedAt: null }, data: { archivedAt: now, archiveReason: reason } }),
      this.prisma.malwareProfile.updateMany({ where: { tenantId, updatedAt: { lt: cutoff }, archivedAt: null }, data: { archivedAt: now, archiveReason: reason } }),
      this.prisma.vulnerabilityProfile.updateMany({ where: { tenantId, updatedAt: { lt: cutoff }, archivedAt: null }, data: { archivedAt: now, archiveReason: reason } }),
      this.prisma.article.updateMany({ where: { tenantId, publishedAt: { lt: cutoff }, archivedAt: null }, data: { archivedAt: now, archiveReason: reason } }),
    ]);
    return { iocs: iocs.count, threatActors: actors.count, malwareProfiles: malware.count, vulnerabilityProfiles: vulns.count, articles: articles.count };
  }

  private async getRetentionDays(tenantId: string, plan: string): Promise<number> {
    const override = await this.prisma.tenantFeatureOverride.findFirst({
      where: { tenantId, featureKey: 'data_retention' }, select: { limitTotal: true },
    });
    if (override?.limitTotal != null) return override.limitTotal;

    const planDef = await this.prisma.subscriptionPlanDefinition.findFirst({
      where: { planId: plan }, select: { id: true },
    });
    if (planDef) {
      const feature = await this.prisma.planFeatureLimit.findFirst({
        where: { planDefId: planDef.id, featureKey: 'data_retention' }, select: { limitTotal: true },
      });
      if (feature?.limitTotal != null && feature.limitTotal !== -1) return feature.limitTotal;
    }
    return DEFAULT_RETENTION[plan] ?? 30;
  }

  async getTenantRetentionInfo(tenantId: string): Promise<TenantRetentionInfo> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    const plan = tenant?.plan ?? 'free';
    const retentionDays = await this.getRetentionDays(tenantId, plan);
    const cutoff = retentionDays === -1 ? new Date(0) : new Date(Date.now() - retentionDays * 86_400_000);
    const recordsAtRisk = retentionDays === -1
      ? { iocs: 0, threatActors: 0, malwareProfiles: 0, vulnerabilityProfiles: 0, articles: 0 }
      : await this.countAtRisk(tenantId, cutoff);

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0);
    const upgrade = UPGRADE_MAP[plan] ?? null;

    return {
      retentionDays, plan, cutoffDate: cutoff.toISOString().split('T')[0]!,
      recordsAtRisk, nextRunAt: tomorrow.toISOString(),
      upgradeForMore: upgrade ? { plan: upgrade.plan, retentionDays: upgrade.retentionDays, upgradeUrl: '/command-center?tab=billing' } : null,
    };
  }

  private async countAtRisk(tenantId: string, cutoff: Date): Promise<RetentionRecordsAtRisk> {
    const [iocs, actors, malware, vulns, articles] = await Promise.all([
      this.prisma.ioc.count({ where: { tenantId, createdAt: { lt: cutoff }, archivedAt: null } }),
      this.prisma.threatActorProfile.count({ where: { tenantId, updatedAt: { lt: cutoff }, archivedAt: null } }),
      this.prisma.malwareProfile.count({ where: { tenantId, updatedAt: { lt: cutoff }, archivedAt: null } }),
      this.prisma.vulnerabilityProfile.count({ where: { tenantId, updatedAt: { lt: cutoff }, archivedAt: null } }),
      this.prisma.article.count({ where: { tenantId, publishedAt: { lt: cutoff }, archivedAt: null } }),
    ]);
    return { iocs, threatActors: actors, malwareProfiles: malware, vulnerabilityProfiles: vulns, articles };
  }

  async getAdminStatus() {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0);
    const lastRun = runHistory.length > 0 ? runHistory[runHistory.length - 1]! : null;
    return { tenants: runHistory.slice(-20), lastRunAt: lastRun?.runAt ?? null, nextRunAt: tomorrow.toISOString() };
  }

  getHistory(): RetentionRunSummary[] { return [...runHistory]; }
}
