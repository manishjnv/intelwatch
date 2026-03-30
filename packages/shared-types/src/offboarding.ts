/**
 * @module @etip/shared-types/offboarding
 * @description Types for org offboarding (I-19), data retention (I-20), and ownership transfer (I-21).
 */
import { z } from 'zod';

// ── I-19: Offboarding Lifecycle ──────────────────────────────────────

export const OFFBOARDING_STATUSES = ['active', 'offboarding', 'archived', 'purged'] as const;
export const OffboardingStatusSchema = z.enum(OFFBOARDING_STATUSES);
export type OffboardingStatus = z.infer<typeof OffboardingStatusSchema>;

export const OffboardTenantResponseSchema = z.object({
  tenantId: z.string().uuid(),
  offboardingStatus: OffboardingStatusSchema,
  offboardedAt: z.string().datetime(),
  offboardedBy: z.string(),
  purgeScheduledAt: z.string().datetime(),
  message: z.string(),
});
export type OffboardTenantResponse = z.infer<typeof OffboardTenantResponseSchema>;

export const CancelOffboardResponseSchema = z.object({
  tenantId: z.string().uuid(),
  offboardingStatus: z.literal('active'),
  message: z.string(),
});
export type CancelOffboardResponse = z.infer<typeof CancelOffboardResponseSchema>;

export const OffboardStatusResponseSchema = z.object({
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  offboardingStatus: OffboardingStatusSchema,
  offboardedAt: z.string().datetime().nullable(),
  offboardedBy: z.string().nullable(),
  purgeScheduledAt: z.string().datetime().nullable(),
  archivePath: z.string().nullable(),
  archiveHash: z.string().nullable(),
});
export type OffboardStatusResponse = z.infer<typeof OffboardStatusResponseSchema>;

export const OffboardingPipelineItemSchema = z.object({
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  offboardingStatus: OffboardingStatusSchema,
  offboardedAt: z.string().datetime(),
  purgeScheduledAt: z.string().datetime(),
  daysUntilPurge: z.number(),
});
export type OffboardingPipelineItem = z.infer<typeof OffboardingPipelineItemSchema>;

/** BullMQ job payload for offboarding archive/purge. */
export const OffboardingJobPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  stage: z.enum(['archive', 'purge']),
  purgeScheduledAt: z.string().datetime(),
});
export type OffboardingJobPayload = z.infer<typeof OffboardingJobPayloadSchema>;

// ── I-20: Data Retention ─────────────────────────────────────────────

export const RetentionRecordsAtRiskSchema = z.object({
  iocs: z.number(),
  threatActors: z.number(),
  malwareProfiles: z.number(),
  vulnerabilityProfiles: z.number(),
  articles: z.number(),
});
export type RetentionRecordsAtRisk = z.infer<typeof RetentionRecordsAtRiskSchema>;

export const TenantRetentionInfoSchema = z.object({
  retentionDays: z.number(),
  plan: z.string(),
  cutoffDate: z.string(),
  recordsAtRisk: RetentionRecordsAtRiskSchema,
  nextRunAt: z.string().datetime(),
  upgradeForMore: z.object({
    plan: z.string(),
    retentionDays: z.number(),
    upgradeUrl: z.string(),
  }).nullable(),
});
export type TenantRetentionInfo = z.infer<typeof TenantRetentionInfoSchema>;

export const RetentionRunSummarySchema = z.object({
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  retentionDays: z.number(),
  cutoffDate: z.string(),
  recordsArchived: RetentionRecordsAtRiskSchema,
  runAt: z.string().datetime(),
});
export type RetentionRunSummary = z.infer<typeof RetentionRunSummarySchema>;

export const RetentionStatusResponseSchema = z.object({
  tenants: z.array(RetentionRunSummarySchema),
  lastRunAt: z.string().datetime().nullable(),
  nextRunAt: z.string().datetime(),
});
export type RetentionStatusResponse = z.infer<typeof RetentionStatusResponseSchema>;

/** BullMQ job payload for data retention enforcement. */
export const RetentionJobPayloadSchema = z.object({
  triggeredAt: z.string().datetime(),
  manual: z.boolean().default(false),
});
export type RetentionJobPayload = z.infer<typeof RetentionJobPayloadSchema>;

/** 410 GONE response for archived data. */
export const DataArchivedErrorSchema = z.object({
  code: z.literal('DATA_ARCHIVED'),
  message: z.string(),
  archivedAt: z.string().datetime(),
  retentionDays: z.number(),
  currentPlan: z.string(),
  upgradeUrl: z.string(),
  restoreOption: z.string(),
});
export type DataArchivedError = z.infer<typeof DataArchivedErrorSchema>;

// ── I-21: Ownership Transfer ─────────────────────────────────────────

export const TRANSFERABLE_RESOURCE_TYPES = [
  'investigations', 'reports', 'alert_rules', 'saved_hunts',
] as const;
export const TransferableResourceTypeSchema = z.enum(TRANSFERABLE_RESOURCE_TYPES);
export type TransferableResourceType = z.infer<typeof TransferableResourceTypeSchema>;

export const TransferOwnershipInputSchema = z.object({
  targetUserId: z.string().uuid(),
  resourceTypes: z.array(TransferableResourceTypeSchema).optional(),
});
export type TransferOwnershipInput = z.infer<typeof TransferOwnershipInputSchema>;

export const TransferSummarySchema = z.object({
  investigations: z.number(),
  reports: z.number(),
  alertRules: z.number(),
  savedHunts: z.number(),
});
export type TransferSummary = z.infer<typeof TransferSummarySchema>;

export const TransferOwnershipResponseSchema = z.object({
  transferred: TransferSummarySchema,
  from: z.object({ userId: z.string().uuid(), email: z.string() }),
  to: z.object({ userId: z.string().uuid(), email: z.string() }),
});
export type TransferOwnershipResponse = z.infer<typeof TransferOwnershipResponseSchema>;

export const UserDisableResponseSchema = z.object({
  message: z.string(),
  userId: z.string().uuid(),
  ownershipTransferred: z.object({
    to: z.object({ userId: z.string().uuid(), email: z.string() }),
    investigations: z.number(),
    reports: z.number(),
    alertRules: z.number(),
    savedHunts: z.number(),
  }).nullable(),
  sessionsTerminated: z.number(),
  apiKeysRevoked: z.number(),
});
export type UserDisableResponse = z.infer<typeof UserDisableResponseSchema>;
