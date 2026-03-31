import { z } from 'zod';

// ─── Maintenance ───────────────────────────────────────────────────

export const CreateMaintenanceSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  type: z.enum(['planned', 'emergency', 'upgrade']),
  scope: z.enum(['platform', 'tenant', 'service']),
  tenantIds: z.array(z.string()).default([]),
  startsAt: z.string().datetime({ message: 'startsAt must be ISO datetime' }),
  endsAt: z.string().datetime({ message: 'endsAt must be ISO datetime' }),
});

export const UpdateMaintenanceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  tenantIds: z.array(z.string()).optional(),
});

export type CreateMaintenanceDto = z.infer<typeof CreateMaintenanceSchema>;
export type UpdateMaintenanceDto = z.infer<typeof UpdateMaintenanceSchema>;

// ─── Backup ────────────────────────────────────────────────────────

export const TriggerBackupSchema = z.object({
  type: z.enum(['full', 'incremental', 'schema']),
  notes: z.string().max(500).optional(),
});

export const InitiateRestoreSchema = z.object({
  notes: z.string().max(500).optional(),
});

export type TriggerBackupDto = z.infer<typeof TriggerBackupSchema>;

// ─── Tenant ────────────────────────────────────────────────────────

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(200),
  ownerName: z.string().min(1).max(200),
  ownerEmail: z.string().email(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).default('free'),
  featureFlags: z.record(z.boolean()).optional(),
});

export const SuspendTenantSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const ChangePlanSchema = z.object({
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']),
});

export type CreateTenantDto = z.infer<typeof CreateTenantSchema>;

// ─── Audit ─────────────────────────────────────────────────────────

export const AuditListQuerySchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const AuditExportSchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

// ─── Alert Rules ───────────────────────────────────────────────────

export const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.enum(['cpu', 'memory', 'disk', 'queue_lag', 'error_rate', 'response_time_p95']),
  threshold: z.number().min(0),
  operator: z.enum(['gt', 'lt', 'gte', 'lte']),
  severity: z.enum(['info', 'warning', 'critical']),
  notifyChannels: z.array(z.string()),
  cooldownMs: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const UpdateAlertRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  threshold: z.number().min(0).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  enabled: z.boolean().optional(),
  notifyChannels: z.array(z.string()).optional(),
  cooldownMs: z.number().int().min(0).optional(),
});

export type CreateAlertRuleDto = z.infer<typeof CreateAlertRuleSchema>;
export type UpdateAlertRuleDto = z.infer<typeof UpdateAlertRuleSchema>;

// ─── Scheduled Maintenance ────────────────────────────────────────

export const CreateScheduledMaintenanceSchema = z.object({
  title: z.string().min(1).max(200),
  cronExpr: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(1440),
  scope: z.string().min(1),
  notifyBefore: z.number().int().min(0).default(60),
  enabled: z.boolean().optional(),
});

export type CreateScheduledMaintenanceDto = z.infer<typeof CreateScheduledMaintenanceSchema>;

// ─── Admin Activity ───────────────────────────────────────────────

export const LogActivitySchema = z.object({
  adminId: z.string().min(1),
  action: z.string().min(1).max(200),
  target: z.string().min(1).max(200),
  details: z.record(z.unknown()).optional(),
});

export type LogActivityDto = z.infer<typeof LogActivitySchema>;
