/**
 * @module compliance-report-service
 * @description I-18 Compliance Report Generation — SOC 2, GDPR DSAR,
 * privileged access reports. JSON format only (PDF is future frontend concern).
 *
 * Reports are generated synchronously for now. For large datasets, queue via
 * QUEUES.REPORT_GENERATE and process asynchronously.
 */
import { AppError } from '@etip/shared-utils';
import { prisma } from './prisma.js';
import type {
  Soc2AccessReviewReport,
  PrivilegedAccessReport,
  DsarExport,
} from '@etip/shared-types';

/**
 * I-18 Compliance Report service.
 * Generates SOC 2 user access review, privileged access, and GDPR DSAR exports.
 */
export class ComplianceReportService {

  // ── Report CRUD ─────────────────────────────────────────────────

  /** Create a report record with status 'generating'. */
  async createReport(input: {
    type: string;
    periodFrom: string;
    periodTo: string;
    tenantId?: string;
    userId?: string;
  }, generatedBy: string) {
    return prisma.complianceReport.create({
      data: {
        reportType: input.type,
        periodFrom: new Date(input.periodFrom),
        periodTo: new Date(input.periodTo),
        tenantId: input.tenantId ?? null,
        generatedBy,
        status: 'generating',
      },
    });
  }

  /** List reports with filters and pagination. */
  async listReports(filters: {
    type?: string;
    status?: string;
    page: number;
    limit: number;
    tenantId?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.type) where.reportType = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.tenantId) where.tenantId = filters.tenantId;

    const [data, total] = await Promise.all([
      prisma.complianceReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.complianceReport.count({ where }),
    ]);

    return { data, total, page: filters.page, limit: filters.limit };
  }

  /** Get a single report by ID (with data). */
  async getReport(reportId: string) {
    const report = await prisma.complianceReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new AppError(404, 'Compliance report not found', 'NOT_FOUND');
    return report;
  }

  // ── 2B: SOC 2 User Access Review Report ─────────────────────────

  /** Generate SOC 2 CC6.3 access review report for a period. */
  async generateSoc2Report(
    periodFrom: Date,
    periodTo: Date,
    tenantId?: string,
  ): Promise<Soc2AccessReviewReport> {
    const userWhere: Record<string, unknown> = {};
    if (tenantId) userWhere.tenantId = tenantId;

    const allUsers = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true, email: true, role: true, mfaEnabled: true,
        active: true, lastLoginAt: true, createdAt: true,
      },
    });

    // Access changes in period
    const usersAdded = await prisma.user.count({
      where: { ...userWhere, createdAt: { gte: periodFrom, lte: periodTo } },
    });
    const usersRemoved = await prisma.user.count({
      where: { ...userWhere, active: false, updatedAt: { gte: periodFrom, lte: periodTo } },
    });

    // Role changes via audit log
    const roleChangeWhere: Record<string, unknown> = {
      action: 'USER_ROLE_CHANGED',
      createdAt: { gte: periodFrom, lte: periodTo },
    };
    if (tenantId) roleChangeWhere.tenantId = tenantId;
    const roleChanges = await prisma.auditLog.findMany({
      where: roleChangeWhere,
      select: { id: true },
    });

    // Stale accounts (no session in 90 days)
    const staleCutoff = new Date(Date.now() - 90 * 86_400_000);
    const sessionWhere: Record<string, unknown> = { createdAt: { gte: staleCutoff } };
    if (tenantId) sessionWhere.tenantId = tenantId;
    const recentSessions = await prisma.session.findMany({
      where: sessionWhere,
      select: { userId: true },
    });
    const recentUserIds = new Set(recentSessions.map((s) => s.userId));
    const staleAccounts = allUsers
      .filter((u) => u.active && !recentUserIds.has(u.id))
      .map((u) => ({
        userId: u.id,
        email: u.email,
        lastActivityDays: daysSince(u.lastLoginAt),
      }));

    // Role distribution
    const roleDistribution: Record<string, number> = {};
    for (const u of allUsers) {
      roleDistribution[u.role] = (roleDistribution[u.role] ?? 0) + 1;
    }

    // MFA adoption
    const activeUsers = allUsers.filter((u) => u.active);
    const mfaCount = activeUsers.filter((u) => u.mfaEnabled).length;
    const mfaAdoptionRate = activeUsers.length > 0
      ? (mfaCount / activeUsers.length) * 100 : 0;

    // Access review actions in period
    const reviewWhere: Record<string, unknown> = {
      createdAt: { gte: periodFrom, lte: periodTo },
    };
    if (tenantId) reviewWhere.tenantId = tenantId;

    const [confirmed, disabled, pending, autoDisabled] = await Promise.all([
      prisma.accessReview.count({ where: { ...reviewWhere, action: 'confirmed' } }),
      prisma.accessReview.count({ where: { ...reviewWhere, action: 'disabled', autoDisabled: false } }),
      prisma.accessReview.count({ where: { ...reviewWhere, action: 'pending' } }),
      prisma.accessReview.count({ where: { ...reviewWhere, autoDisabled: true } }),
    ]);

    return {
      period: { from: periodFrom.toISOString(), to: periodTo.toISOString() },
      totalUsers: allUsers.length,
      roleDistribution,
      mfaAdoptionRate,
      accessChanges: {
        added: usersAdded,
        removed: usersRemoved,
        roleChanged: roleChanges.length,
      },
      staleAccounts,
      reviewActions: { confirmed, disabled, pending, autoDisabled },
      generatedAt: new Date().toISOString(),
    };
  }

  // ── 2C: Privileged Access Report ────────────────────────────────

  /** Generate privileged access report for a period. */
  async generatePrivilegedAccessReport(
    periodFrom: Date,
    periodTo: Date,
  ): Promise<PrivilegedAccessReport> {
    // Super admins
    const superAdmins = await prisma.user.findMany({
      where: { role: 'super_admin' },
      select: {
        id: true, email: true, lastLoginAt: true,
        mfaEnabled: true, tenant: { select: { name: true } },
      },
    });

    const superAdminData = await Promise.all(
      superAdmins.map(async (sa) => {
        const sessions = await prisma.session.findMany({
          where: { userId: sa.id, createdAt: { gte: periodFrom, lte: periodTo } },
          select: { geoCountry: true, geoCity: true },
        });
        const geoLocations = [...new Set(
          sessions.map((s) => s.geoCountry).filter(Boolean) as string[],
        )];
        return {
          userId: sa.id,
          email: sa.email,
          lastLogin: sa.lastLoginAt?.toISOString() ?? null,
          sessionCount: sessions.length,
          mfaEnabled: sa.mfaEnabled,
          geoLocations,
        };
      }),
    );

    // Tenant admins
    const tenantAdmins = await prisma.user.findMany({
      where: { role: 'tenant_admin' },
      select: {
        id: true, email: true, lastLoginAt: true,
        mfaEnabled: true, tenant: { select: { name: true } },
      },
    });

    const tenantAdminData = tenantAdmins.map((ta) => ({
      userId: ta.id,
      email: ta.email,
      tenantName: ta.tenant.name,
      lastLogin: ta.lastLoginAt?.toISOString() ?? null,
      mfaEnabled: ta.mfaEnabled,
    }));

    // API keys grouped by tenant
    const apiKeys = await prisma.apiKey.findMany({
      where: { active: true },
      select: {
        tenantId: true, scopes: true, lastUsed: true,
        tenant: { select: { name: true } },
      },
    });

    const apiKeysByTenant = new Map<string, {
      tenantName: string; count: number; lastUsed: string | null; scopes: string[][];
    }>();
    for (const key of apiKeys) {
      const existing = apiKeysByTenant.get(key.tenantId) ?? {
        tenantName: key.tenant.name, count: 0, lastUsed: null as string | null, scopes: [] as string[][],
      };
      existing.count++;
      if (key.lastUsed) {
        const lu = key.lastUsed.toISOString();
        if (!existing.lastUsed || lu > existing.lastUsed) existing.lastUsed = lu;
      }
      existing.scopes.push(key.scopes);
      apiKeysByTenant.set(key.tenantId, existing);
    }

    // SCIM tokens grouped by tenant
    const scimTokens = await prisma.scimToken.findMany({
      where: { revoked: false },
      select: {
        tenantId: true, lastUsedAt: true,
        tenant: { select: { name: true } },
      },
    });

    const scimByTenant = new Map<string, {
      tenantName: string; count: number; lastUsed: string | null;
    }>();
    for (const token of scimTokens) {
      const existing = scimByTenant.get(token.tenantId) ?? {
        tenantName: token.tenant.name, count: 0, lastUsed: null as string | null,
      };
      existing.count++;
      if (token.lastUsedAt) {
        const lu = token.lastUsedAt.toISOString();
        if (!existing.lastUsed || lu > existing.lastUsed) existing.lastUsed = lu;
      }
      scimByTenant.set(token.tenantId, existing);
    }

    return {
      period: { from: periodFrom.toISOString(), to: periodTo.toISOString() },
      superAdmins: superAdminData,
      tenantAdmins: tenantAdminData,
      apiKeys: [...apiKeysByTenant.entries()].map(([tenantId, v]) => ({
        tenantId, tenantName: v.tenantName, count: v.count,
        lastUsed: v.lastUsed, scopes: v.scopes,
      })),
      scimTokens: [...scimByTenant.entries()].map(([tenantId, v]) => ({
        tenantId, tenantName: v.tenantName, count: v.count, lastUsed: v.lastUsed,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // ── 2D: GDPR DSAR Export ────────────────────────────────────────

  /** Generate GDPR Data Subject Access Request export for a user. */
  async generateDsarExport(
    userId: string,
    requestedBy: string,
    tenantId?: string,
  ): Promise<DsarExport> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

    // Tenant isolation check
    if (tenantId && user.tenantId !== tenantId) {
      throw new AppError(403, 'User does not belong to your organization', 'FORBIDDEN');
    }

    const [sessions, auditLogs, apiKeysList] = await Promise.all([
      prisma.session.findMany({
        where: { userId },
        select: {
          id: true, ipAddress: true, userAgent: true, geoCountry: true,
          geoCity: true, geoIsp: true, createdAt: true, revokedAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        select: {
          id: true, action: true, entityType: true, entityId: true,
          changes: true, ipAddress: true, createdAt: true,
        },
      }),
      prisma.apiKey.findMany({
        where: { userId },
        select: { id: true, name: true, scopes: true, createdAt: true },
      }),
    ]);

    // Audit: log the DSAR export
    if (tenantId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: requestedBy,
          action: 'compliance.dsar_exported',
          entityType: 'user',
          entityId: userId,
          changes: { requestedBy, exportedAt: new Date().toISOString() },
        },
      });
    }

    return {
      dataSubject: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      profile: {
        role: user.role,
        authProvider: user.authProvider,
        mfaEnabled: user.mfaEnabled,
        active: user.active,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
      sessions: sessions.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
      auditLogs: auditLogs.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      apiKeys: apiKeysList.map((k) => ({
        id: k.id,
        name: k.name,
        scopes: k.scopes,
        createdAt: k.createdAt.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
      requestedBy,
    };
  }

  /** Complete a DSAR report with pre-generated data. */
  async completeDsarReport(reportId: string, dsar: DsarExport): Promise<void> {
    const json = JSON.stringify(dsar);
    const fileSizeKb = Math.ceil(Buffer.byteLength(json, 'utf8') / 1024);

    await prisma.complianceReport.update({
      where: { id: reportId },
      data: {
        status: 'completed',
        reportData: dsar as object,
        fileSizeKb,
        completedAt: new Date(),
      },
    });
  }

  // ── Full report generation + persist ────────────────────────────

  /** Generate and persist a compliance report. */
  async generateAndPersist(reportId: string): Promise<void> {
    const report = await prisma.complianceReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new AppError(404, 'Report not found', 'NOT_FOUND');

    try {
      let reportData: unknown;

      switch (report.reportType) {
        case 'soc2_access_review':
          reportData = await this.generateSoc2Report(
            report.periodFrom, report.periodTo, report.tenantId ?? undefined,
          );
          break;
        case 'privileged_access':
          reportData = await this.generatePrivilegedAccessReport(
            report.periodFrom, report.periodTo,
          );
          break;
        case 'gdpr_dsar':
          throw new AppError(400, 'Use DSAR endpoint directly', 'INVALID_REPORT_TYPE');
        default:
          throw new AppError(400, `Unknown report type: ${report.reportType}`, 'INVALID_REPORT_TYPE');
      }

      const json = JSON.stringify(reportData);
      const fileSizeKb = Math.ceil(Buffer.byteLength(json, 'utf8') / 1024);

      await prisma.complianceReport.update({
        where: { id: reportId },
        data: {
          status: 'completed',
          reportData: reportData as object,
          fileSizeKb,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      await prisma.complianceReport.update({
        where: { id: reportId },
        data: { status: 'failed', completedAt: new Date() },
      });
      throw err;
    }
  }
}

/** Compute days since a date, relative to now. */
function daysSince(date: Date | null | undefined): number {
  if (!date) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}
