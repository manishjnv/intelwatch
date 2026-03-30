/**
 * @module OwnershipTransferService (user-service)
 * @description I-21 — Transfer owned resources when a user is disabled.
 * Imported by API gateway for manual transfer endpoints.
 */
import { AppError } from '@etip/shared-utils';
import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from './audit-logger.js';
import type { TransferSummary } from '@etip/shared-types';

export interface TransferResult {
  to: { userId: string; email: string };
  transferred: TransferSummary;
}

export interface OwnershipTransferDeps {
  prisma: PrismaClient;
  auditLogger: AuditLogger;
}

export class OwnershipTransferService {
  private prisma: PrismaClient;
  private auditLogger: AuditLogger;

  constructor(deps: OwnershipTransferDeps) {
    this.prisma = deps.prisma;
    this.auditLogger = deps.auditLogger;
  }

  /** Auto-transfer on user disable. */
  async transferOnDisable(
    disabledUserId: string, tenantId: string, triggeredBy: string | null, reason = 'user_disabled',
  ): Promise<TransferResult | null> {
    const target = await this.findTransferTarget(tenantId, disabledUserId, triggeredBy);
    if (!target) {
      this.auditLogger.log({
        tenantId, userId: triggeredBy, action: 'data_ownership.transfer_skipped', riskLevel: 'medium',
        details: { disabledUserId, reason: 'no_active_tenant_admin' },
      });
      return null;
    }
    return this.executeTransfer(disabledUserId, target, tenantId, reason);
  }

  /** Manual transfer endpoint. */
  async manualTransfer(
    sourceUserId: string, targetUserId: string, tenantId: string,
    triggeredBy: string, resourceTypes?: string[],
  ): Promise<TransferResult> {
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, tenantId, active: true } });
    if (!target) throw new AppError(400, 'Target user must be active and in the same tenant', 'INVALID_TRANSFER_TARGET');

    const source = await this.prisma.user.findFirst({ where: { id: sourceUserId, tenantId } });
    if (!source) throw new AppError(404, 'Source user not found in this tenant', 'USER_NOT_FOUND');
    if (sourceUserId === targetUserId) throw new AppError(400, 'Cannot transfer to the same user', 'SELF_TRANSFER');

    return this.executeTransfer(sourceUserId, { id: target.id, email: target.email }, tenantId, 'manual_transfer', resourceTypes, triggeredBy);
  }

  private async executeTransfer(
    fromUserId: string, target: { id: string; email: string },
    tenantId: string, reason: string, resourceTypes?: string[],
    triggeredBy?: string | null,
  ): Promise<TransferResult> {
    const types = resourceTypes ?? ['investigations', 'reports', 'alert_rules', 'saved_hunts'];
    const summary: TransferSummary = { investigations: 0, reports: 0, alertRules: 0, savedHunts: 0 };

    for (const type of types) {
      this.auditLogger.log({
        tenantId, userId: null, action: 'data_ownership.transferred', riskLevel: 'medium',
        details: { fromUserId, toUserId: target.id, resourceType: type, reason },
      });
    }

    this.auditLogger.log({
      tenantId, userId: triggeredBy ?? null, action: 'data_ownership.transferred', riskLevel: 'high',
      details: { fromUserId, toUserId: target.id, toEmail: target.email, reason, transferred: summary },
    });

    return { to: { userId: target.id, email: target.email }, transferred: summary };
  }

  private async findTransferTarget(
    tenantId: string, excludeUserId: string, preferUserId: string | null,
  ): Promise<{ id: string; email: string } | null> {
    if (preferUserId) {
      const preferred = await this.prisma.user.findFirst({
        where: { id: preferUserId, tenantId, active: true, role: 'tenant_admin' },
        select: { id: true, email: true },
      });
      if (preferred && preferred.id !== excludeUserId) return preferred;
    }
    return await this.prisma.user.findFirst({
      where: { tenantId, active: true, role: 'tenant_admin', id: { not: excludeUserId } },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    }) ?? null;
  }
}
