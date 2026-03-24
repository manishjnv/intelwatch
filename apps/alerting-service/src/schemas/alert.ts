import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────

export const AlertSeverityEnum = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;

export const AlertStatusEnum = z.enum(['open', 'acknowledged', 'resolved', 'suppressed', 'escalated']);
export type AlertStatus = z.infer<typeof AlertStatusEnum>;

export const RuleTypeEnum = z.enum(['threshold', 'pattern', 'anomaly', 'absence']);
export type RuleType = z.infer<typeof RuleTypeEnum>;

export const ChannelTypeEnum = z.enum(['email', 'slack', 'webhook']);
export type ChannelType = z.infer<typeof ChannelTypeEnum>;

// ─── Alert Rule Schemas ──────────────────────────────────────────────

const ThresholdCondition = z.object({
  metric: z.string().min(1),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
  value: z.number(),
  windowMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

const PatternCondition = z.object({
  eventType: z.string().min(1),
  field: z.string().min(1),
  pattern: z.string().min(1),
  minOccurrences: z.coerce.number().int().min(1).default(3),
  windowMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

const AnomalyCondition = z.object({
  metric: z.string().min(1),
  deviationMultiplier: z.number().min(1).max(10).default(3),
  baselineWindowHours: z.coerce.number().int().min(1).max(168).default(24),
});

const AbsenceCondition = z.object({
  eventType: z.string().min(1),
  expectedIntervalMinutes: z.coerce.number().int().min(1).max(1440),
});

export const RuleConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('threshold'), threshold: ThresholdCondition }),
  z.object({ type: z.literal('pattern'), pattern: PatternCondition }),
  z.object({ type: z.literal('anomaly'), anomaly: AnomalyCondition }),
  z.object({ type: z.literal('absence'), absence: AbsenceCondition }),
]);

export type RuleCondition = z.infer<typeof RuleConditionSchema>;

export const CreateRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  tenantId: z.string().min(1).default('default'),
  severity: AlertSeverityEnum,
  condition: RuleConditionSchema,
  enabled: z.boolean().default(true),
  channelIds: z.array(z.string().uuid()).optional(),
  escalationPolicyId: z.string().uuid().optional(),
  cooldownMinutes: z.coerce.number().int().min(0).max(1440).default(15),
  tags: z.array(z.string()).max(20).optional(),
});

export type CreateRuleDto = z.infer<typeof CreateRuleSchema>;

export const UpdateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  severity: AlertSeverityEnum.optional(),
  condition: RuleConditionSchema.optional(),
  enabled: z.boolean().optional(),
  channelIds: z.array(z.string().uuid()).optional(),
  escalationPolicyId: z.string().uuid().optional(),
  cooldownMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

export type UpdateRuleDto = z.infer<typeof UpdateRuleSchema>;

export const ListRulesQuerySchema = z.object({
  tenantId: z.string().min(1).default('default'),
  type: RuleTypeEnum.optional(),
  severity: AlertSeverityEnum.optional(),
  enabled: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListRulesQuery = z.infer<typeof ListRulesQuerySchema>;

// ─── Alert Schemas ───────────────────────────────────────────────────

export const ListAlertsQuerySchema = z.object({
  tenantId: z.string().min(1).default('default'),
  severity: AlertSeverityEnum.optional(),
  status: AlertStatusEnum.optional(),
  ruleId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListAlertsQuery = z.infer<typeof ListAlertsQuerySchema>;

export const SuppressAlertSchema = z.object({
  durationMinutes: z.coerce.number().int().min(1).max(10080).default(60),
  reason: z.string().max(500).optional(),
});

export type SuppressAlertDto = z.infer<typeof SuppressAlertSchema>;

export const BulkAlertIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export type BulkAlertIdsDto = z.infer<typeof BulkAlertIdsSchema>;

// ─── Notification Channel Schemas ────────────────────────────────────

const EmailChannelConfig = z.object({
  recipients: z.array(z.string().email()).min(1).max(20),
  subject: z.string().max(200).optional(),
});

const SlackChannelConfig = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().min(1).max(100).optional(),
  username: z.string().max(100).optional(),
});

const WebhookChannelConfig = z.object({
  url: z.string().url(),
  method: z.enum(['POST', 'PUT']).default('POST'),
  headers: z.record(z.string()).optional(),
  secret: z.string().max(256).optional(),
});

export const ChannelConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email'), email: EmailChannelConfig }),
  z.object({ type: z.literal('slack'), slack: SlackChannelConfig }),
  z.object({ type: z.literal('webhook'), webhook: WebhookChannelConfig }),
]);

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(200),
  tenantId: z.string().min(1).default('default'),
  config: ChannelConfigSchema,
  enabled: z.boolean().default(true),
});

export type CreateChannelDto = z.infer<typeof CreateChannelSchema>;

export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: ChannelConfigSchema.optional(),
  enabled: z.boolean().optional(),
});

export type UpdateChannelDto = z.infer<typeof UpdateChannelSchema>;

export const ListChannelsQuerySchema = z.object({
  tenantId: z.string().min(1).default('default'),
  type: ChannelTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListChannelsQuery = z.infer<typeof ListChannelsQuerySchema>;

// ─── Escalation Policy Schemas ───────────────────────────────────────

export const EscalationStepSchema = z.object({
  delayMinutes: z.coerce.number().int().min(0).max(1440),
  channelIds: z.array(z.string().uuid()).min(1),
  notifyMessage: z.string().max(500).optional(),
});

export type EscalationStep = z.infer<typeof EscalationStepSchema>;

export const CreateEscalationSchema = z.object({
  name: z.string().min(1).max(200),
  tenantId: z.string().min(1).default('default'),
  steps: z.array(EscalationStepSchema).min(1).max(10),
  repeatAfterMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  enabled: z.boolean().default(true),
});

export type CreateEscalationDto = z.infer<typeof CreateEscalationSchema>;

export const UpdateEscalationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  steps: z.array(EscalationStepSchema).min(1).max(10).optional(),
  repeatAfterMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  enabled: z.boolean().optional(),
});

export type UpdateEscalationDto = z.infer<typeof UpdateEscalationSchema>;

export const ListEscalationsQuerySchema = z.object({
  tenantId: z.string().min(1).default('default'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListEscalationsQuery = z.infer<typeof ListEscalationsQuerySchema>;
