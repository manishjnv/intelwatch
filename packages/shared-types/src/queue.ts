/**
 * @module @etip/shared-types/queue
 * @description BullMQ job payload types for every queue in the platform.
 * Queue names are in @etip/shared-utils — these are just the data shapes.
 */
import { z } from 'zod';
import { IocTypeSchema } from './ioc.js';
import { EntityTypeSchema } from './intel.js';

/** Payload for etip-feed-fetch queue */
export const FeedFetchPayloadSchema = z.object({
  feedId: z.string().uuid(),
  tenantId: z.string().min(1),
  feedUrl: z.string().url(),
  feedType: z.enum(['stix', 'misp', 'csv', 'json', 'rest']),
  scheduledAt: z.string().datetime(),
});
export type FeedFetchPayload = z.infer<typeof FeedFetchPayloadSchema>;

/** Payload for etip-feed-parse queue */
export const FeedParsePayloadSchema = z.object({
  feedId: z.string().uuid(),
  tenantId: z.string().min(1),
  feedType: z.enum(['stix', 'misp', 'csv', 'json', 'rest']),
  rawDataPath: z.string(),
  fetchedAt: z.string().datetime(),
});
export type FeedParsePayload = z.infer<typeof FeedParsePayloadSchema>;

/** Payload for etip-normalize queue */
export const NormalizePayloadSchema = z.object({
  tenantId: z.string().min(1),
  feedId: z.string().uuid(),
  feedName: z.string(),
  entityType: EntityTypeSchema,
  rawEntity: z.unknown(),
});
export type NormalizePayload = z.infer<typeof NormalizePayloadSchema>;

/** Payload for etip-deduplicate queue */
export const DeduplicatePayloadSchema = z.object({
  tenantId: z.string().min(1),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
  dedupeHash: z.string().length(64),
});
export type DeduplicatePayload = z.infer<typeof DeduplicatePayloadSchema>;

/** Payload for etip-enrich-realtime queue */
export const EnrichRealtimePayloadSchema = z.object({
  tenantId: z.string().min(1),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
  iocType: IocTypeSchema.optional(),
  value: z.string(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
export type EnrichRealtimePayload = z.infer<typeof EnrichRealtimePayloadSchema>;

/** Payload for etip-enrich-batch queue */
export const EnrichBatchPayloadSchema = z.object({
  tenantId: z.string().min(1),
  entityIds: z.array(z.string().uuid()).min(1),
  entityType: EntityTypeSchema,
});
export type EnrichBatchPayload = z.infer<typeof EnrichBatchPayloadSchema>;

/** Payload for etip-graph-sync queue */
export const GraphSyncPayloadSchema = z.object({
  tenantId: z.string().min(1),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
  operation: z.enum(['create', 'update', 'delete']),
});
export type GraphSyncPayload = z.infer<typeof GraphSyncPayloadSchema>;

/** Payload for etip-correlate queue */
export const CorrelatePayloadSchema = z.object({
  tenantId: z.string().min(1),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
  triggerEvent: z.string(),
});
export type CorrelatePayload = z.infer<typeof CorrelatePayloadSchema>;

/** Payload for etip-alert-evaluate queue */
export const AlertEvaluatePayloadSchema = z.object({
  tenantId: z.string().min(1),
  correlationId: z.string().uuid(),
  matchedRuleIds: z.array(z.string()),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});
export type AlertEvaluatePayload = z.infer<typeof AlertEvaluatePayloadSchema>;

/** Payload for etip-integration-push queue */
export const IntegrationPushPayloadSchema = z.object({
  tenantId: z.string().min(1),
  integrationId: z.string().uuid(),
  integrationType: z.enum(['siem', 'soar', 'ticketing', 'webhook', 'email']),
  payload: z.unknown(),
});
export type IntegrationPushPayload = z.infer<typeof IntegrationPushPayloadSchema>;

/** Payload for etip-archive queue */
export const ArchivePayloadSchema = z.object({
  tenantId: z.string().min(1),
  entityType: EntityTypeSchema,
  entityIds: z.array(z.string().uuid()),
  reason: z.enum(['age', 'manual', 'expired']),
});
export type ArchivePayload = z.infer<typeof ArchivePayloadSchema>;

/** Payload for etip-report-generate queue */
export const ReportGeneratePayloadSchema = z.object({
  tenantId: z.string().min(1),
  reportType: z.enum(['daily', 'weekly', 'monthly', 'custom', 'executive']),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  requestedBy: z.string().uuid(),
  format: z.enum(['pdf', 'html', 'json']).default('pdf'),
});
export type ReportGeneratePayload = z.infer<typeof ReportGeneratePayloadSchema>;
