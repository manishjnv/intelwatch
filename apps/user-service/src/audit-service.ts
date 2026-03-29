/**
 * @module audit-service
 * @description Audit log query service + integrity verification (I-15).
 * SOC 2 CC7.2 / ISO 27001 A.12.4.2 compliance.
 */
import { sha256 } from '@etip/shared-utils';
import {
  findAuditLogsByTenant, findAllAuditLogs, findAuditLogsChronological,
  type AuditLogFilters,
} from './repository.js';
import { fetchFromS3 } from './audit-replication.js';

const GENESIS_HASH = '0'.repeat(64);

export interface IntegrityViolation {
  auditLogId: string;
  expected: string;
  actual: string | null;
}

export interface IntegrityResult {
  status: 'VERIFIED' | 'INTEGRITY_VIOLATION';
  entriesChecked: number;
  timeMs: number;
  violations: IntegrityViolation[];
  s3SampleVerified?: number;
}

export class AuditService {
  /** Query audit logs for a specific tenant (tenant_admin view) */
  async queryTenantAuditLogs(tenantId: string, filters: AuditLogFilters = {}) {
    return findAuditLogsByTenant(tenantId, filters);
  }

  /** Query all audit logs cross-tenant (super_admin view) */
  async queryAllAuditLogs(filters: AuditLogFilters = {}) {
    return findAllAuditLogs(filters);
  }

  /** Verify hash chain integrity — recompute from genesis and compare */
  async verifyIntegrity(tenantId?: string): Promise<IntegrityResult> {
    const start = Date.now();
    const entries = await findAuditLogsChronological(tenantId);
    const violations: IntegrityViolation[] = [];

    let previousHash = GENESIS_HASH;

    for (const entry of entries) {
      // Skip legacy entries without hashChain (pre-I-15)
      if (!entry.hashChain) continue;

      const computed = sha256(previousHash + JSON.stringify({
        action: entry.action,
        userId: entry.userId ?? undefined,
        tenantId: entry.tenantId,
        entityType: entry.entityType,
        entityId: entry.entityId ?? undefined,
        changes: entry.changes ?? undefined,
        timestamp: entry.createdAt.toISOString(),
      }));

      if (computed !== entry.hashChain) {
        violations.push({
          auditLogId: entry.id,
          expected: computed,
          actual: entry.hashChain,
        });
      }

      previousHash = entry.hashChain;
    }

    // S3 spot-check: verify up to 10 random replicated entries
    let s3SampleVerified: number | undefined;
    const replicated = entries.filter((e) => e.externalRef);
    if (replicated.length > 0) {
      const sampleSize = Math.min(10, replicated.length);
      const samples = replicated.sort(() => Math.random() - 0.5).slice(0, sampleSize);
      let verified = 0;
      for (const sample of samples) {
        try {
          const s3Copy = await fetchFromS3(sample.externalRef!);
          if (s3Copy && s3Copy.hashChain === sample.hashChain) verified++;
        } catch {
          // S3 fetch failure — don't count as verified
        }
      }
      s3SampleVerified = verified;
    }

    return {
      status: violations.length === 0 ? 'VERIFIED' : 'INTEGRITY_VIOLATION',
      entriesChecked: entries.filter((e) => e.hashChain).length,
      timeMs: Date.now() - start,
      violations,
      s3SampleVerified,
    };
  }
}
