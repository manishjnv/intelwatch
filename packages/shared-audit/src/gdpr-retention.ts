/**
 * @module @etip/shared-audit/gdpr-retention
 * @description GDPR data retention policy constants and types.
 * Full implementation (deletion engine) is Phase 5+.
 *
 * @see SKILL_SECURITY.md §17
 */

/** Per-data-category retention periods (days). Configurable per tenant. */
export const DEFAULT_RETENTION_DAYS: Record<string, number> = {
  ioc_data: 365,
  enrichment_cache: 180,
  feed_raw_data: 60,
  audit_logs: 2555,
  user_sessions: 90,
  api_request_logs: 30,
  investigation_data: 730,
  alert_history: 365,
};

/** Data classification labels (TLP-aligned). */
export const DATA_CLASSIFICATIONS = [
  'TLP:WHITE',
  'TLP:GREEN',
  'TLP:AMBER',
  'TLP:RED',
  'PII',
  'SENSITIVE',
] as const;

export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

/** GDPR right-to-deletion request shape. */
export interface DeletionRequest {
  tenantId: string;
  requestedBy: string;
  scope: 'user_data' | 'tenant_full' | 'specific_records';
  targetUserId?: string;
  targetRecordIds?: string[];
  reason: string;
  gdprArticle?: '17' | '21';
}

/** Certificate issued after GDPR deletion completes. */
export interface DeletionCertificate {
  requestId: string;
  tenantId: string;
  deletedAt: string;
  recordsDeleted: number;
  tablesAffected: string[];
  retainedForLegal: string[];
  verifiedBy: string;
}
