/**
 * @module access-review-service
 * @description I-17 Access Review Automation — stale detection, auto-disable,
 * review actions, quarterly reports. SOC 2 CC6.3 / ISO 27001 A.9.2.5.
 *
 * Scheduled jobs: implement as BullMQ repeatable jobs.
 *   - scanStaleSuperAdmins: cron '0 3 1 * *'   (1st of month, 03:00 UTC)
 *   - scanStaleUsers:       cron '0 4 1 * *'   (1st of month, 04:00 UTC)
 *   - processAutoDisable:   cron '0 5 * * *'   (daily 05:00 UTC)
 *   - generateQuarterlyReview: cron '0 6 1 1,4,7,10 *' (quarterly)
 */
import { AppError } from '@etip/shared-utils';
import { prisma } from './prisma.js';
import type { QuarterlyReviewSummary } from '@etip/shared-types';

const SUPER_ADMIN_STALE_DAYS = 60;
const ORG_USER_STALE_DAYS = 90;
const AUTO_DISABLE_GRACE_DAYS = 14;

/** Compute days since a date, relative to now. */
function daysSince(date: Date | null | undefined): number {
  if (!date) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/**
 * I-17 Access Review Automation service.
 * All scan methods return summary stats for job logging.
 */
export class AccessReviewService {

  // ── 1B: Stale Super Admin Detection (monthly) ───────────────────

  /** Scan all super_admin users. Flag those inactive > 60 days. */
  async scanStaleSuperAdmins(): Promise<{ flagged: number; skipped: number }> {
    const superAdmins = await prisma.user.findMany({
      where: { role: 'super_admin', active: true },
    });

    let flagged = 0;
    let skipped = 0;

    for (const admin of superAdmins) {
      const lastActivity = await this.getLastActivity(admin.id);
      const inactiveDays = daysSince(lastActivity);

      if (inactiveDays <= SUPER_ADMIN_STALE_DAYS) {
        skipped++;
        continue;
      }

      await prisma.accessReview.create({
        data: {
          userId: admin.id,
          tenantId: admin.tenantId,
          reviewType: 'stale_super_admin',
          action: 'pending',
        },
      });
      flagged++;
    }

    return { flagged, skipped };
  }

  // ── 1B: Auto-Disable (daily check) ─────────────────────────────

  /** Auto-disable users with pending reviews older than 14 days. */
  async processAutoDisable(): Promise<{ disabled: number; skippedLastAdmin: number }> {
    const cutoff = new Date(Date.now() - AUTO_DISABLE_GRACE_DAYS * 86_400_000);
    const pendingReviews = await prisma.accessReview.findMany({
      where: {
        action: 'pending',
        reviewType: 'stale_super_admin',
        createdAt: { lt: cutoff },
      },
    });

    let disabled = 0;
    let skippedLastAdmin = 0;

    for (const review of pendingReviews) {
      // Safety: never disable the last active super_admin
      const activeSuperAdminCount = await prisma.user.count({
        where: { role: 'super_admin', active: true },
      });

      if (activeSuperAdminCount <= 1) {
        skippedLastAdmin++;
        continue;
      }

      await prisma.accessReview.update({
        where: { id: review.id },
        data: { action: 'disabled', autoDisabled: true },
      });

      await prisma.user.update({
        where: { id: review.userId },
        data: { active: false },
      });

      // Terminate all sessions
      await prisma.session.updateMany({
        where: { userId: review.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      disabled++;
    }

    return { disabled, skippedLastAdmin };
  }

  // ── 1C: Stale User Detection — org-level (monthly) ──────────────

  /** Scan all tenants for users inactive > 90 days. */
  async scanStaleUsers(): Promise<{ flagged: number }> {
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    let flagged = 0;

    for (const tenant of tenants) {
      const users = await prisma.user.findMany({
        where: { tenantId: tenant.id, active: true },
      });

      for (const user of users) {
        const lastActivity = await this.getLastActivity(user.id);
        const inactiveDays = daysSince(lastActivity);

        if (inactiveDays <= ORG_USER_STALE_DAYS) continue;

        await prisma.accessReview.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            reviewType: 'stale_user',
            action: 'pending',
          },
        });
        flagged++;
      }
    }

    return { flagged };
  }

  // ── Review Actions ──────────────────────────────────────────────

  /** Act on a review — confirm or disable. */
  async actOnReview(
    reviewId: string,
    reviewedBy: string,
    input: { action: 'confirmed' | 'disabled'; notes?: string },
  ) {
    const review = await prisma.accessReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new AppError(404, 'Access review not found', 'NOT_FOUND');

    if (review.action !== 'pending') {
      throw new AppError(409, 'Review already actioned', 'REVIEW_ALREADY_ACTIONED');
    }

    if (input.action === 'disabled') {
      // Safety: don't disable last super_admin
      if (review.reviewType === 'stale_super_admin') {
        const activeCount = await prisma.user.count({
          where: { role: 'super_admin', active: true },
        });
        if (activeCount <= 1) {
          throw new AppError(409, 'Cannot disable the last active super admin', 'LAST_SUPER_ADMIN');
        }
      }

      await prisma.user.update({
        where: { id: review.userId },
        data: { active: false },
      });

      await prisma.session.updateMany({
        where: { userId: review.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const updated = await prisma.accessReview.update({
      where: { id: reviewId },
      data: {
        action: input.action,
        reviewedBy,
        reviewedAt: new Date(),
        notes: input.notes ?? null,
      },
    });

    return updated;
  }

  /** Act on a tenant-scoped review (tenant_admin). */
  async actOnTenantReview(
    reviewId: string,
    reviewedBy: string,
    tenantId: string,
    input: { action: 'confirmed' | 'disabled'; notes?: string },
  ) {
    const review = await prisma.accessReview.findUnique({ where: { id: reviewId } });
    if (!review || review.tenantId !== tenantId) {
      throw new AppError(404, 'Access review not found', 'NOT_FOUND');
    }
    return this.actOnReview(reviewId, reviewedBy, input);
  }

  // ── List / Query ────────────────────────────────────────────────

  /** List reviews with optional filters. tenantId scopes to a tenant. */
  async listReviews(
    filters: { reviewType?: string; action?: string; page: number; limit: number },
    tenantId?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (filters.reviewType) where.reviewType = filters.reviewType;
    if (filters.action) where.action = filters.action;

    const [data, total] = await Promise.all([
      prisma.accessReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.accessReview.count({ where }),
    ]);

    return { data, total, page: filters.page, limit: filters.limit };
  }

  // ── 1D: Quarterly Report ────────────────────────────────────────

  /** Generate quarterly access review summary for a tenant. */
  async generateQuarterlyReview(tenantId: string): Promise<QuarterlyReviewSummary> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) throw new AppError(404, 'Tenant not found', 'NOT_FOUND');

    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const allUsers = await prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, role: true, active: true, mfaEnabled: true,
        authProvider: true, createdAt: true,
      },
    });

    const activeUsers = allUsers.filter((u) => u.active);
    const inactiveUsers = allUsers.filter((u) => !u.active);

    // Users added this quarter
    const usersAdded = await prisma.user.count({
      where: { tenantId, createdAt: { gte: quarterStart } },
    });

    // Users disabled this quarter
    const usersRemoved = await prisma.user.count({
      where: { tenantId, active: false, updatedAt: { gte: quarterStart } },
    });

    // Role distribution
    const roleDistribution: Record<string, number> = {};
    for (const user of allUsers) {
      roleDistribution[user.role] = (roleDistribution[user.role] ?? 0) + 1;
    }

    // MFA adoption (among active users)
    const mfaCount = activeUsers.filter((u) => u.mfaEnabled).length;
    const mfaAdoptionRate = activeUsers.length > 0
      ? (mfaCount / activeUsers.length) * 100 : 0;

    // SSO vs local
    const ssoUsers = allUsers.filter((u) => u.authProvider === 'saml' || u.authProvider === 'oidc');
    const localUsers = allUsers.filter((u) => u.authProvider === 'email');

    // Stale users check (no session in 90 days)
    const staleSessionCutoff = new Date(Date.now() - ORG_USER_STALE_DAYS * 86_400_000);
    const recentSessions = await prisma.session.findMany({
      where: { tenantId, createdAt: { gte: staleSessionCutoff } },
      select: { userId: true },
    });
    const recentUserIds = new Set(recentSessions.map((s) => s.userId));
    const staleCount = activeUsers.filter((u) => !recentUserIds.has(u.id)).length;

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      totalUsers: allUsers.length,
      activeUsers: activeUsers.length,
      inactiveUsers: inactiveUsers.length,
      usersAddedInPeriod: usersAdded,
      usersRemovedInPeriod: usersRemoved,
      staleUsers: staleCount,
      roleDistribution,
      mfaAdoptionRate,
      ssoUsersCount: ssoUsers.length,
      localAuthUsersCount: localUsers.length,
      generatedAt: now.toISOString(),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Get last activity date for a user (most recent session). */
  private async getLastActivity(userId: string): Promise<Date | null> {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { createdAt: true },
    });
    return sessions[0]?.createdAt ?? null;
  }
}
