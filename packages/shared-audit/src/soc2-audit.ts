/**
 * @module @etip/shared-audit/soc2-audit
 * @description SOC 2 Type II compliant immutable audit trail.
 * All audit entries are INSERT-only — the PostgreSQL table has DENY
 * triggers on UPDATE/DELETE. Retention: 7 years.
 *
 * @see SKILL_SECURITY.md §16
 */
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

// ── Schema ───────────────────────────────────────────────────────────

/** Zod schema for a single audit log entry. */
export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  sessionId: z.string().uuid().nullable(),
  action: z.string().min(1).max(255),
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().max(255),
  changes: z.record(z.unknown()).nullable(),
  ipAddress: z.string().ip().nullable(),
  userAgent: z.string().max(500).nullable(),
  outcome: z.enum(['success', 'failure', 'denied']),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
  timestamp: z.string().datetime(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** Input for creating a new audit entry (id + timestamp auto-generated). */
export type AuditEntryInput = Omit<AuditEntry, 'id' | 'timestamp'>;

// ── Mandatory Actions ────────────────────────────────────────────────

/**
 * SOC 2 action categories that MUST always be logged.
 * Missing any of these is a compliance violation.
 */
export const SOC2_MANDATORY_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.login_failed',
  'auth.mfa_verified',
  'auth.password_changed',
  'auth.api_key_created',
  'auth.api_key_revoked',
  'user.created',
  'user.role_changed',
  'user.disabled',
  'user.deleted',
  'data.exported',
  'data.deleted',
  'data.bulk_import',
  'integration.connected',
  'integration.disconnected',
  'config.feature_flag_changed',
  'config.tenant_settings_changed',
  'admin.impersonation_started',
  'admin.impersonation_ended',
] as const;

export type SOC2MandatoryAction = (typeof SOC2_MANDATORY_ACTIONS)[number];

// ── DB Interface ─────────────────────────────────────────────────────

/**
 * Generic audit log DB interface.
 * Accepts any Prisma-like client with an `auditLog.create()` method.
 * Using a generic interface avoids a direct PrismaClient dependency.
 */
export interface AuditLogDB {
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

// ── Writer ───────────────────────────────────────────────────────────

/**
 * Immutable audit writer. Uses INSERT only — no UPDATE or DELETE.
 * The PostgreSQL `audit_logs` table has DENY rules on UPDATE/DELETE
 * via a trigger (see SKILL_SECURITY.md §16).
 */
export class SOC2AuditWriter {
  constructor(private readonly db: AuditLogDB) {}

  /**
   * Record an immutable audit log entry.
   * Validates input via Zod before persisting.
   *
   * @param entry - Audit entry input (without id/timestamp)
   * @throws AppError(422) if validation fails
   */
  async record(entry: AuditEntryInput): Promise<void> {
    const fullEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // Validate before INSERT
    const result = AuditEntrySchema.safeParse(fullEntry);
    if (!result.success) {
      throw new AppError(
        422,
        'Audit entry validation failed',
        'AUDIT_VALIDATION_ERROR',
        result.error.flatten(),
      );
    }

    await this.db.auditLog.create({
      data: {
        id: result.data.id,
        tenantId: result.data.tenantId,
        userId: result.data.userId,
        sessionId: result.data.sessionId,
        action: result.data.action,
        resourceType: result.data.resourceType,
        resourceId: result.data.resourceId,
        changes: result.data.changes,
        ipAddress: result.data.ipAddress,
        userAgent: result.data.userAgent,
        outcome: result.data.outcome,
        riskLevel: result.data.riskLevel,
        timestamp: result.data.timestamp,
      },
    });
  }

  /**
   * Check if an action is a SOC 2 mandatory action.
   */
  static isMandatoryAction(action: string): action is SOC2MandatoryAction {
    return (SOC2_MANDATORY_ACTIONS as readonly string[]).includes(action);
  }
}
