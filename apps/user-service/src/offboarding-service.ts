/**
 * @module OffboardingService (user-service)
 * @description I-19 — Organization offboarding lifecycle.
 * Imported by API gateway for route handling.
 * Full implementation — identical to user-management-service version.
 */
import { AppError } from '@etip/shared-utils';
import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from './audit-logger.js';
import type {
  OffboardTenantResponse,
  CancelOffboardResponse,
  OffboardStatusResponse,
  OffboardingPipelineItem,
  OffboardingJobPayload,
} from '@etip/shared-types';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const PURGE_DELAY_DAYS = 60;

interface SessionManagerLike { revokeAll(userId: string, tenantId: string): number; }
interface QueueLike<T> { add(name: string, data: T, opts?: Record<string, unknown>): Promise<unknown>; }

export interface OffboardingDeps {
  prisma: PrismaClient;
  auditLogger: AuditLogger;
  sessionManager: SessionManagerLike;
  offboardingQueue: QueueLike<OffboardingJobPayload> | null;
}

export class OffboardingService {
  private prisma: PrismaClient;
  private auditLogger: AuditLogger;
  private sessionManager: SessionManagerLike;
  private offboardingQueue: QueueLike<OffboardingJobPayload> | null;

  constructor(deps: OffboardingDeps) {
    this.prisma = deps.prisma;
    this.auditLogger = deps.auditLogger;
    this.sessionManager = deps.sessionManager;
    this.offboardingQueue = deps.offboardingQueue;
  }

  async initiateOffboarding(
    tenantId: string, actorEmail: string, actorTenantId: string,
  ): Promise<OffboardTenantResponse> {
    if (tenantId === SYSTEM_TENANT_ID) {
      throw new AppError(403, 'Cannot offboard the system tenant', 'SYSTEM_TENANT_PROTECTED');
    }
    if (actorTenantId === tenantId) {
      throw new AppError(403, 'Cannot offboard your own organization', 'SELF_ORG_OFFBOARD_DENIED');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
    if (tenant.offboardingStatus === 'purged') throw new AppError(409, 'Tenant already purged', 'ALREADY_PURGED');
    if (tenant.offboardingStatus === 'offboarding' || tenant.offboardingStatus === 'archived') {
      throw new AppError(409, 'Tenant already being offboarded', 'ALREADY_OFFBOARDING');
    }

    const now = new Date();
    const purgeDate = new Date(now.getTime() + PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000);

    // Step 1 — Block tenant + users
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { active: false, offboardingStatus: 'offboarding', offboardedAt: now, offboardedBy: actorEmail, purgeScheduledAt: purgeDate },
    });
    await this.prisma.user.updateMany({ where: { tenantId }, data: { active: false } });

    // Step 2 — Terminate sessions
    const users = await this.prisma.user.findMany({ where: { tenantId }, select: { id: true } });
    let sessionsTerminated = 0;
    for (const u of users) sessionsTerminated += this.sessionManager.revokeAll(u.id, tenantId);
    await this.prisma.session.deleteMany({ where: { tenantId } });

    // Step 3 — Revoke API keys
    const apiKeyResult = await this.prisma.apiKey.updateMany({ where: { tenantId, active: true }, data: { active: false } });

    // Step 4 — Disable SSO
    await this.prisma.ssoConfig.updateMany({ where: { tenantId, enabled: true }, data: { enabled: false } });

    // Step 5 — Revoke SCIM tokens
    await this.prisma.scimToken.updateMany({ where: { tenantId, revoked: false }, data: { revoked: true } });

    // Step 6 — Queue archive job
    if (this.offboardingQueue) {
      await this.offboardingQueue.add(`archive-${tenantId}`, {
        tenantId, stage: 'archive', purgeScheduledAt: purgeDate.toISOString(),
      }, { attempts: 3, backoff: { type: 'exponential', delay: 60000 } });
    }

    this.auditLogger.log({
      tenantId, userId: null, action: 'offboarding.initiated', riskLevel: 'critical',
      details: { offboardedBy: actorEmail, purgeScheduledAt: purgeDate.toISOString(), sessionsTerminated, apiKeysRevoked: apiKeyResult.count },
    });

    return {
      tenantId, offboardingStatus: 'offboarding', offboardedAt: now.toISOString(),
      offboardedBy: actorEmail, purgeScheduledAt: purgeDate.toISOString(),
      message: `Offboarding initiated. Data purge after ${purgeDate.toISOString().split('T')[0]}.`,
    };
  }

  async cancelOffboarding(tenantId: string, actorEmail: string): Promise<CancelOffboardResponse> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
    if (tenant.offboardingStatus === 'purged') throw new AppError(409, 'Already purged', 'ALREADY_PURGED');
    if (!tenant.offboardingStatus || tenant.offboardingStatus === 'active') {
      throw new AppError(400, 'Tenant is not being offboarded', 'NOT_OFFBOARDING');
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { active: true, offboardingStatus: 'active', offboardedAt: null, offboardedBy: null, purgeScheduledAt: null },
    });
    await this.prisma.user.updateMany({ where: { tenantId }, data: { active: true } });

    this.auditLogger.log({
      tenantId, userId: null, action: 'offboarding.cancelled', riskLevel: 'high',
      details: { cancelledBy: actorEmail },
    });

    return { tenantId, offboardingStatus: 'active', message: 'Offboarding cancelled. Users must re-login.' };
  }

  async getStatus(tenantId: string): Promise<OffboardStatusResponse> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
    return {
      tenantId: tenant.id, tenantName: tenant.name,
      offboardingStatus: (tenant.offboardingStatus ?? 'active') as OffboardStatusResponse['offboardingStatus'],
      offboardedAt: tenant.offboardedAt?.toISOString() ?? null,
      offboardedBy: tenant.offboardedBy ?? null,
      purgeScheduledAt: tenant.purgeScheduledAt?.toISOString() ?? null,
      archivePath: tenant.archivePath ?? null,
      archiveHash: tenant.archiveHash ?? null,
    };
  }

  async listPipeline(): Promise<OffboardingPipelineItem[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { offboardingStatus: { in: ['offboarding', 'archived'] } },
      select: { id: true, name: true, offboardingStatus: true, offboardedAt: true, purgeScheduledAt: true },
      orderBy: { purgeScheduledAt: 'asc' },
    });
    const now = Date.now();
    return tenants.map((t) => ({
      tenantId: t.id, tenantName: t.name,
      offboardingStatus: (t.offboardingStatus ?? 'offboarding') as OffboardingPipelineItem['offboardingStatus'],
      offboardedAt: t.offboardedAt?.toISOString() ?? new Date().toISOString(),
      purgeScheduledAt: t.purgeScheduledAt?.toISOString() ?? new Date().toISOString(),
      daysUntilPurge: t.purgeScheduledAt ? Math.max(0, Math.ceil((t.purgeScheduledAt.getTime() - now) / 86_400_000)) : 0,
    }));
  }
}
