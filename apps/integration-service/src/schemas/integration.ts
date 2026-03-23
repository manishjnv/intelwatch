import { z } from 'zod';

// ─── Integration Types ────────────────────────────────────────────

export const IntegrationTypeEnum = z.enum([
  'splunk_hec',
  'sentinel',
  'elastic_siem',
  'servicenow',
  'jira',
  'webhook',
]);
export type IntegrationType = z.infer<typeof IntegrationTypeEnum>;

export const TriggerEventEnum = z.enum([
  'alert.created',
  'alert.updated',
  'alert.closed',
  'ioc.created',
  'ioc.updated',
  'correlation.match',
  'drp.alert.created',
  'hunt.completed',
]);
export type TriggerEvent = z.infer<typeof TriggerEventEnum>;

// ─── Field Mapping ────────────────────────────────────────────────

export const FieldMappingSchema = z.object({
  sourceField: z.string().min(1),
  targetField: z.string().min(1),
  transform: z.enum(['none', 'uppercase', 'lowercase', 'iso_date', 'severity_map', 'json_stringify']).default('none'),
});
export type FieldMapping = z.infer<typeof FieldMappingSchema>;

// ─── SIEM Credentials ────────────────────────────────────────────

export const SplunkHecConfigSchema = z.object({
  type: z.literal('splunk_hec'),
  url: z.string().url(),
  token: z.string().min(1),
  index: z.string().default('main'),
  sourcetype: z.string().default('etip:alert'),
  verifySsl: z.boolean().default(true),
});

export const SentinelConfigSchema = z.object({
  type: z.literal('sentinel'),
  workspaceId: z.string().min(1),
  sharedKey: z.string().min(1),
  logType: z.string().default('ETIP_ThreatIntel'),
});

export const ElasticSiemConfigSchema = z.object({
  type: z.literal('elastic_siem'),
  url: z.string().url(),
  apiKey: z.string().min(1),
  indexPattern: z.string().default('etip-alerts-*'),
  verifySsl: z.boolean().default(true),
});

export const SiemConfigSchema = z.discriminatedUnion('type', [
  SplunkHecConfigSchema,
  SentinelConfigSchema,
  ElasticSiemConfigSchema,
]);
export type SiemConfig = z.infer<typeof SiemConfigSchema>;

// ─── Webhook Config ──────────────────────────────────────────────

export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(8).optional(),
  headers: z.record(z.string()).default({}),
  method: z.enum(['POST', 'PUT']).default('POST'),
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

// ─── Ticketing Config ────────────────────────────────────────────

export const ServiceNowConfigSchema = z.object({
  type: z.literal('servicenow'),
  instanceUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
  tableName: z.string().default('incident'),
});

export const JiraConfigSchema = z.object({
  type: z.literal('jira'),
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
  projectKey: z.string().min(1).max(10),
  issueType: z.string().default('Task'),
});

export const TicketingConfigSchema = z.discriminatedUnion('type', [
  ServiceNowConfigSchema,
  JiraConfigSchema,
]);
export type TicketingConfig = z.infer<typeof TicketingConfigSchema>;

// ─── Integration Entity ──────────────────────────────────────────

export const CreateIntegrationSchema = z.object({
  name: z.string().min(1).max(100),
  type: IntegrationTypeEnum,
  enabled: z.boolean().default(true),
  triggers: z.array(TriggerEventEnum).min(1),
  fieldMappings: z.array(FieldMappingSchema).default([]),
  credentials: z.record(z.unknown()).default({}),
  webhookConfig: WebhookConfigSchema.optional(),
  siemConfig: SiemConfigSchema.optional(),
  ticketingConfig: TicketingConfigSchema.optional(),
});
export type CreateIntegrationInput = z.infer<typeof CreateIntegrationSchema>;

export const UpdateIntegrationSchema = CreateIntegrationSchema.partial();
export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationSchema>;

export interface Integration {
  id: string;
  tenantId: string;
  name: string;
  type: IntegrationType;
  enabled: boolean;
  triggers: TriggerEvent[];
  fieldMappings: FieldMapping[];
  credentials: Record<string, unknown>;
  webhookConfig?: WebhookConfig;
  siemConfig?: SiemConfig;
  ticketingConfig?: TicketingConfig;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Integration Log ─────────────────────────────────────────────

export const LogStatusEnum = z.enum(['success', 'failure', 'retrying', 'dead_letter']);
export type LogStatus = z.infer<typeof LogStatusEnum>;

export interface IntegrationLog {
  id: string;
  integrationId: string;
  tenantId: string;
  event: TriggerEvent;
  status: LogStatus;
  statusCode: number | null;
  errorMessage: string | null;
  attempt: number;
  payload: Record<string, unknown>;
  responseBody: string | null;
  createdAt: string;
}

// ─── Webhook Delivery ────────────────────────────────────────────

export interface WebhookDelivery {
  id: string;
  integrationId: string;
  tenantId: string;
  event: TriggerEvent;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  status: LogStatus;
  lastError: string | null;
  createdAt: string;
}

// ─── STIX 2.1 Types ─────────────────────────────────────────────

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixObject[];
}

export interface StixObject {
  type: string;
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

export interface TaxiiCollection {
  id: string;
  title: string;
  description: string;
  canRead: boolean;
  canWrite: boolean;
  mediaTypes: string[];
}

// ─── Bulk Export ──────────────────────────────────────────────────

export const BulkExportFormatEnum = z.enum(['csv', 'json', 'stix']);
export type BulkExportFormat = z.infer<typeof BulkExportFormatEnum>;

export const BulkExportRequestSchema = z.object({
  format: BulkExportFormatEnum,
  entityType: z.enum(['iocs', 'alerts', 'correlations', 'actors', 'malware', 'vulnerabilities']),
  filters: z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    types: z.array(z.string()).optional(),
  }).default({}),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});
export type BulkExportRequest = z.infer<typeof BulkExportRequestSchema>;

// ─── Ticket ──────────────────────────────────────────────────────

export const CreateTicketSchema = z.object({
  integrationId: z.string().uuid(),
  alertId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  additionalFields: z.record(z.unknown()).default({}),
});
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export interface Ticket {
  id: string;
  integrationId: string;
  tenantId: string;
  externalId: string;
  externalUrl: string;
  alertId: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

// ─── P1 #6: Webhook Retry Config ────────────────────────────────

export const WebhookRetryConfigSchema = z.object({
  maxRetries: z.coerce.number().int().min(1).max(20).default(5),
  baseDelayMs: z.coerce.number().int().min(100).max(60000).default(2000),
  maxDelayMs: z.coerce.number().int().min(1000).max(300000).default(60000),
  jitterEnabled: z.boolean().default(true),
});
export type WebhookRetryConfig = z.infer<typeof WebhookRetryConfigSchema>;

export interface RetryState {
  integrationId: string;
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  lastRetryAt: string | null;
  dlqCount: number;
  config: WebhookRetryConfig;
}

// ─── P1 #7: Field Mapping Preset ────────────────────────────────

export const CreateFieldMappingPresetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  targetType: IntegrationTypeEnum,
  mappings: z.array(FieldMappingSchema).min(1),
});
export type CreateFieldMappingPresetInput = z.infer<typeof CreateFieldMappingPresetSchema>;

export const UpdateFieldMappingPresetSchema = CreateFieldMappingPresetSchema.partial();
export type UpdateFieldMappingPresetInput = z.infer<typeof UpdateFieldMappingPresetSchema>;

export interface FieldMappingPreset {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  targetType: IntegrationType;
  mappings: FieldMapping[];
  createdAt: string;
  updatedAt: string;
}

// ─── P1 #8: Ticket Template ─────────────────────────────────────

export const CreateTicketTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  targetType: z.enum(['servicenow', 'jira']),
  titleTemplate: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1).max(5000),
  priorityMapping: z.record(z.string()).default({}),
  additionalFields: z.record(z.string()).default({}),
});
export type CreateTicketTemplateInput = z.infer<typeof CreateTicketTemplateSchema>;

export const UpdateTicketTemplateSchema = CreateTicketTemplateSchema.partial();
export type UpdateTicketTemplateInput = z.infer<typeof UpdateTicketTemplateSchema>;

export interface TicketTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  targetType: 'servicenow' | 'jira';
  titleTemplate: string;
  bodyTemplate: string;
  priorityMapping: Record<string, string>;
  additionalFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// ─── P1 #9: TAXII Collection Input ─────────────────────────────

export const CreateTaxiiCollectionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
  mediaTypes: z.array(z.string()).default(['application/stix+json;version=2.1']),
  pollingIntervalMinutes: z.coerce.number().int().min(1).max(1440).default(60),
  entityFilter: z.object({
    entityType: z.enum(['iocs', 'alerts', 'correlations']).default('iocs'),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
    types: z.array(z.string()).optional(),
  }).default({}),
});
export type CreateTaxiiCollectionInput = z.infer<typeof CreateTaxiiCollectionSchema>;

export const UpdateTaxiiCollectionSchema = CreateTaxiiCollectionSchema.partial();
export type UpdateTaxiiCollectionInput = z.infer<typeof UpdateTaxiiCollectionSchema>;

export interface ManagedTaxiiCollection {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  canRead: boolean;
  canWrite: boolean;
  mediaTypes: string[];
  pollingIntervalMinutes: number;
  entityFilter: {
    entityType: string;
    severity?: string;
    types?: string[];
  };
  objectCount: number;
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxiiManifestEntry {
  id: string;
  dateAdded: string;
  version: string;
  mediaType: string;
}

// ─── P1 #10: Export Schedule ────────────────────────────────────

export const CreateExportScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  cronExpression: z.string().min(1).max(100),
  format: BulkExportFormatEnum,
  entityType: z.enum(['iocs', 'alerts', 'correlations', 'actors', 'malware', 'vulnerabilities']),
  filters: z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    types: z.array(z.string()).optional(),
  }).default({}),
  enabled: z.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});
export type CreateExportScheduleInput = z.infer<typeof CreateExportScheduleSchema>;

export const UpdateExportScheduleSchema = CreateExportScheduleSchema.partial();
export type UpdateExportScheduleInput = z.infer<typeof UpdateExportScheduleSchema>;

export interface ExportSchedule {
  id: string;
  tenantId: string;
  name: string;
  cronExpression: string;
  format: BulkExportFormat;
  entityType: string;
  filters: {
    severity?: string;
    dateFrom?: string;
    dateTo?: string;
    types?: string[];
  };
  enabled: boolean;
  limit: number;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'failure' | null;
  lastRunError: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Query Params ────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const IntegrationQuerySchema = PaginationSchema.extend({
  type: IntegrationTypeEnum.optional(),
  enabled: z.coerce.boolean().optional(),
});

// ─── P2 #11: Health Scoring ─────────────────────────────────────

export interface HealthScoreComponents {
  uptimeScore: number;       // 0-100 based on uptime %
  errorRateScore: number;    // 0-100 inverse of error rate
  latencyScore: number;      // 0-100 based on p95 latency
  syncAgeScore: number;      // 0-100 based on last successful sync recency
}

export interface HealthScore {
  integrationId: string;
  score: number;             // 0-100 composite
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: HealthScoreComponents;
  calculatedAt: string;
}

export interface HealthHistoryPoint {
  score: number;
  grade: string;
  timestamp: string;
}

// ─── P2 #12: Audit Trail ───────────────────────────────────────

export const AuditActionEnum = z.enum([
  'integration.created',
  'integration.updated',
  'integration.deleted',
  'integration.enabled',
  'integration.disabled',
  'config.changed',
  'credentials.rotated',
  'export.executed',
  'webhook.triggered',
  'rule.created',
  'rule.updated',
  'rule.deleted',
]);
export type AuditAction = z.infer<typeof AuditActionEnum>;

export interface AuditEntry {
  id: string;
  tenantId: string;
  integrationId: string | null;
  action: AuditAction;
  actor: string;
  details: Record<string, unknown>;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export const AuditQuerySchema = PaginationSchema.extend({
  integrationId: z.string().uuid().optional(),
  action: AuditActionEnum.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// ─── P2 #13: Rate Limit Tracking ───────────────────────────────

export interface RateLimitDataPoint {
  timestamp: string;
  requestsPerMinute: number;
  quotaRemaining: number;
  throttled: boolean;
}

export interface RateLimitDashboard {
  integrationId: string;
  currentRate: number;
  maxRate: number;
  quotaRemaining: number;
  throttleCount: number;
  timeSeries: RateLimitDataPoint[];
}

// ─── P2 #14: Credential Rotation ───────────────────────────────

export const RotateCredentialsSchema = z.object({
  newCredentials: z.record(z.unknown()),
  gracePeriodMinutes: z.coerce.number().int().min(0).max(1440).default(30),
});
export type RotateCredentialsInput = z.infer<typeof RotateCredentialsSchema>;

export interface CredentialRotationRecord {
  id: string;
  integrationId: string;
  tenantId: string;
  rotatedAt: string;
  gracePeriodMinutes: number;
  graceExpiresAt: string;
  oldCredentialsMasked: Record<string, string>;
  status: 'active' | 'grace_period' | 'expired';
}

// ─── P2 #15: Alert Routing Rule ────────────────────────────────

export const RoutingConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in']),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});
export type RoutingCondition = z.infer<typeof RoutingConditionSchema>;

export const RoutingActionSchema = z.object({
  type: z.enum(['route_to_siem', 'create_ticket', 'send_webhook', 'send_email']),
  integrationId: z.string().uuid(),
  config: z.record(z.unknown()).default({}),
});
export type RoutingAction = z.infer<typeof RoutingActionSchema>;

export const CreateRoutingRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  enabled: z.boolean().default(true),
  priority: z.coerce.number().int().min(1).max(1000).default(100),
  conditions: z.array(RoutingConditionSchema).min(1),
  conditionLogic: z.enum(['AND', 'OR']).default('AND'),
  actions: z.array(RoutingActionSchema).min(1),
  triggerEvents: z.array(TriggerEventEnum).min(1),
});
export type CreateRoutingRuleInput = z.infer<typeof CreateRoutingRuleSchema>;

export const UpdateRoutingRuleSchema = CreateRoutingRuleSchema.partial();
export type UpdateRoutingRuleInput = z.infer<typeof UpdateRoutingRuleSchema>;

export interface RoutingRule {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: RoutingCondition[];
  conditionLogic: 'AND' | 'OR';
  actions: RoutingAction[];
  triggerEvents: TriggerEvent[];
  matchCount: number;
  lastMatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DryRunResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditionResults: Array<{
    field: string;
    operator: string;
    expected: unknown;
    actual: unknown;
    passed: boolean;
  }>;
  actionsWouldExecute: RoutingAction[];
}
