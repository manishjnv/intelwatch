/**
 * @module AuditLogger (user-service)
 * @description Lightweight audit logger for gateway-instantiated services.
 * Logs to Prisma audit_logs table via the shared prisma client.
 */
import { prisma } from './prisma.js';

export interface AuditInput {
  tenantId: string;
  userId: string | null;
  action: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export class AuditLogger {
  log(input: AuditInput): string {
    const id = crypto.randomUUID();
    // Fire-and-forget Prisma write (non-blocking audit)
    prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        entityType: 'system',
        changes: input.details as object,
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    }).catch(() => {
      // Audit log write failure should not crash the service
    });
    return id;
  }
}
