import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

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
export type AuditEntryInput = Omit<AuditEntry, 'id' | 'timestamp'>;

export const SOC2_MANDATORY_ACTIONS = [
  'auth.login','auth.logout','auth.login_failed','auth.mfa_verified','auth.password_changed',
  'auth.api_key_created','auth.api_key_revoked','user.created','user.role_changed',
  'user.disabled','user.deleted','data.exported','data.deleted','data.bulk_import',
  'integration.connected','integration.disconnected','config.feature_flag_changed',
  'config.tenant_settings_changed','admin.impersonation_started','admin.impersonation_ended',
] as const;

export type SOC2MandatoryAction = (typeof SOC2_MANDATORY_ACTIONS)[number];

export interface AuditLogDB {
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown>; };
}

export class SOC2AuditWriter {
  constructor(private readonly db: AuditLogDB) {}

  async record(entry: AuditEntryInput): Promise<void> {
    const fullEntry = { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
    const result = AuditEntrySchema.safeParse(fullEntry);
    if (!result.success) {
      throw new AppError(422, 'Audit entry validation failed', 'AUDIT_VALIDATION_ERROR', result.error.flatten());
    }
    await this.db.auditLog.create({ data: { ...result.data } });
  }

  static isMandatoryAction(action: string): action is SOC2MandatoryAction {
    return (SOC2_MANDATORY_ACTIONS as readonly string[]).includes(action);
  }
}
