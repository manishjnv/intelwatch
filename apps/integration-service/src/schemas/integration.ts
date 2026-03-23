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

// ─── Query Params ────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const IntegrationQuerySchema = PaginationSchema.extend({
  type: IntegrationTypeEnum.optional(),
  enabled: z.coerce.boolean().optional(),
});
