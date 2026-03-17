export const DEFAULT_RETENTION_DAYS: Record<string, number> = {
  ioc_data: 365, enrichment_cache: 180, feed_raw_data: 60, audit_logs: 2555,
  user_sessions: 90, api_request_logs: 30, investigation_data: 730, alert_history: 365,
};

export const DATA_CLASSIFICATIONS = ['TLP:WHITE','TLP:GREEN','TLP:AMBER','TLP:RED','PII','SENSITIVE'] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export interface DeletionRequest {
  tenantId: string; requestedBy: string;
  scope: 'user_data' | 'tenant_full' | 'specific_records';
  targetUserId?: string; targetRecordIds?: string[];
  reason: string; gdprArticle?: '17' | '21';
}

export interface DeletionCertificate {
  requestId: string; tenantId: string; deletedAt: string;
  recordsDeleted: number; tablesAffected: string[];
  retainedForLegal: string[]; verifiedBy: string;
}
