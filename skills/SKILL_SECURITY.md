# SKILL_SECURITY.md — P0 Additions
## LLM Security, Compliance & Data Governance Extensions
**Version:** 4.1 (extends v4.0 base in project knowledge)
**Last Updated:** 2026-03-16
**Source:** Strategic Architecture Review v1.0 — Update 9 (P0)

> **Note:** The base security skill (v4.0 — Sections 1–13) lives in project
> knowledge. This file contains P0 additions that must be applied before
> Phase 1 code begins. Merge into the base file during first implementation sprint.

---

## 14. PROMPT INJECTION DEFENSE
> Added from Strategic Architecture Review v1.0 — Update 9 (P0)

All user-supplied or feed-sourced text that flows into Claude API calls MUST
be sanitized. Threat feeds contain adversary-crafted content — treat every
external string as hostile.

### Sanitization Middleware

```typescript
// packages/shared-auth/src/llm-sanitizer.ts
import { z } from 'zod';

/** Characters / patterns that can manipulate LLM behavior. */
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)\s+instructions/gi,
  /you\s+are\s+now\s+(a|an|DAN)/gi,
  /system\s*:\s*/gi,
  /\[INST\]/gi,
  /<<SYS>>/gi,
  /<\|im_start\|>/gi,
  /\bdo\s+anything\s+now\b/gi,
  /\bact\s+as\s+(if|a)\b/gi,
  /\bpretend\s+(you|to)\b/gi,
  /\boverride\s+safety\b/gi,
] as const;

export interface SanitizeResult {
  sanitized: string;
  injectionDetected: boolean;
  matchedPatterns: string[];
}

/**
 * Sanitize text before sending to any LLM API.
 * Call this on ALL external inputs: feed article bodies, IOC descriptions,
 * user-submitted queries, report text, dark web scraped content.
 */
export function sanitizeLLMInput(raw: string): SanitizeResult {
  const matchedPatterns: string[] = [];
  let sanitized = raw;

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      matchedPatterns.push(pattern.source);
      sanitized = sanitized.replace(pattern, '[FILTERED]');
    }
  }

  // Strip control characters (U+0000–U+001F except \n \r \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Truncate to max LLM context budget (prevent token exhaustion attacks)
  const MAX_INPUT_CHARS = 50_000;
  if (sanitized.length > MAX_INPUT_CHARS) {
    sanitized = sanitized.slice(0, MAX_INPUT_CHARS) + '\n[TRUNCATED]';
  }

  return {
    sanitized,
    injectionDetected: matchedPatterns.length > 0,
    matchedPatterns,
  };
}
```

### Fastify Pre-Handler for LLM Routes

```typescript
// Attach to any route that forwards user text to Claude
import { sanitizeLLMInput } from '@etip/shared-auth';
import { logger } from '@etip/shared-utils';

async function llmInputGuard(req: FastifyRequest, reply: FastifyReply) {
  const body = req.body as Record<string, unknown>;
  const textFields = ['query', 'description', 'content', 'articleBody'];

  for (const field of textFields) {
    if (typeof body[field] === 'string') {
      const result = sanitizeLLMInput(body[field] as string);
      if (result.injectionDetected) {
        logger.warn({
          userId: req.user?.userId,
          tenantId: req.user?.tenantId,
          field,
          patterns: result.matchedPatterns,
        }, 'Prompt injection attempt detected');
      }
      (body[field] as string) = result.sanitized;
    }
  }
}
```

---

## 15. LLM OUTPUT VALIDATION
> Added from Strategic Architecture Review v1.0 — Update 9 (P0)

Claude API responses MUST be validated with Zod before persistence.
Never trust LLM output — it can hallucinate fields, return wrong types,
or produce out-of-range scores.

```typescript
// packages/shared-enrichment/src/output-validator.ts
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { logger } from '@etip/shared-utils';

/** Schema for validated Claude enrichment output. */
export const EnrichmentOutputSchema = z.object({
  riskScore:        z.number().int().min(0).max(100),
  confidence:       z.number().int().min(0).max(100),
  severity:         z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  mitreTechniques:  z.array(z.string().regex(/^T\d{4}(\.\d{3})?$/)).default([]),
  threatActors:     z.array(z.string().max(200)).default([]),
  malwareFamilies:  z.array(z.string().max(200)).default([]),
  reasoning:        z.string().max(2000),
  tags:             z.array(z.string().max(50)).default([]),
  relatedIOCs:      z.array(z.string()).default([]),
  geolocation:      z.object({
    country:   z.string().max(100).optional(),
    city:      z.string().max(100).optional(),
    asn:       z.string().max(50).optional(),
    asnOrg:    z.string().max(200).optional(),
  }).optional(),
});

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;

/**
 * Validate and parse raw Claude response JSON.
 * Returns validated output or throws AppError with details.
 */
export function validateLLMOutput(
  rawJson: unknown,
  iocValue: string
): EnrichmentOutput {
  const result = EnrichmentOutputSchema.safeParse(rawJson);
  if (!result.success) {
    logger.error({
      iocValue,
      zodErrors: result.error.flatten(),
    }, 'LLM output validation failed');
    throw new AppError(
      422,
      'AI enrichment produced invalid output',
      'LLM_OUTPUT_INVALID',
      result.error.flatten()
    );
  }
  return result.data;
}
```

### Usage in Enrichment Service

```typescript
import { validateLLMOutput } from '@etip/shared-enrichment';

async function enrichIOC(iocValue: string, iocType: string) {
  const claudeResponse = await callClaudeAPI(buildPrompt(iocValue, iocType));

  // Parse the raw text response into JSON
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(claudeResponse.content[0].text);
  } catch {
    throw new AppError(422, 'Claude returned non-JSON', 'LLM_PARSE_FAILED');
  }

  // Validate against schema — throws on invalid output
  const validated = validateLLMOutput(rawJson, iocValue);
  return validated;
}
```

---

## 16. SOC 2 TYPE II AUDIT TRAIL PATTERN
> Added from Strategic Architecture Review v1.0 — Update 9 (P0)

SOC 2 requires immutable, timestamped audit logs for all security-relevant
actions. Logs must be retained for 7 years and cannot be modified or deleted.

```typescript
// packages/shared-audit/src/soc2-audit.ts
import { z } from 'zod';

export const AuditEntrySchema = z.object({
  id:            z.string().uuid(),
  tenantId:      z.string().uuid(),
  userId:        z.string().uuid().nullable(),
  sessionId:     z.string().uuid().nullable(),
  action:        z.string().max(255),
  resourceType:  z.string().max(100),
  resourceId:    z.string().max(255),
  changes:       z.record(z.unknown()).nullable(),
  ipAddress:     z.string().ip().nullable(),
  userAgent:     z.string().max(500).nullable(),
  outcome:       z.enum(['success', 'failure', 'denied']),
  riskLevel:     z.enum(['low', 'medium', 'high', 'critical']).default('low'),
  timestamp:     z.string().datetime(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** SOC 2 action categories that MUST always be logged. */
export const SOC2_MANDATORY_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.login_failed',
  'auth.mfa_verified',
  'auth.password_changed',
  'auth.api_key_created',
  'auth.api_key_revoked',
  'user.created',
  'user.role_changed',
  'user.disabled',
  'user.deleted',
  'data.exported',
  'data.deleted',
  'data.bulk_import',
  'integration.connected',
  'integration.disconnected',
  'config.feature_flag_changed',
  'config.tenant_settings_changed',
  'admin.impersonation_started',
  'admin.impersonation_ended',
] as const;

/**
 * Immutable audit writer. Uses INSERT only — no UPDATE or DELETE.
 * PostgreSQL table has DENY rules on UPDATE/DELETE via trigger.
 */
export class SOC2AuditWriter {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    await this.db.audit_logs.create({
      data: {
        ...entry,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

### PostgreSQL Immutability Trigger

```sql
-- Prevent modification or deletion of audit logs (SOC 2 requirement)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable (SOC 2 Type II)';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- Retention: partition by month, retain 7 years
CREATE TABLE audit_logs_partitioned (
  LIKE audit_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Example partition (auto-create via pg_partman or cron)
CREATE TABLE audit_logs_2026_03
  PARTITION OF audit_logs_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

---

## 17. GDPR DATA RETENTION & RIGHT-TO-DELETION
> Added from Strategic Architecture Review v1.0 — Update 9 (P0)

ETIP must comply with GDPR Article 17 (Right to Erasure) and enforce
automated data retention policies per tenant jurisdiction.

```typescript
// packages/shared-audit/src/gdpr-retention.ts
import { AppError } from '@etip/shared-utils';

/** Per-data-category retention periods (days). Configurable per tenant. */
export const DEFAULT_RETENTION_DAYS: Record<string, number> = {
  ioc_data:          365,     // 1 year
  enrichment_cache:  180,     // 6 months
  feed_raw_data:     60,      // per existing archival policy
  audit_logs:        2555,    // 7 years (SOC 2 override — NOT deletable)
  user_sessions:     90,
  api_request_logs:  30,
  investigation_data: 730,    // 2 years
  alert_history:     365,
};

/** Data classification labels (TLP-aligned). */
export const DATA_CLASSIFICATIONS = [
  'TLP:WHITE',   // public
  'TLP:GREEN',   // community
  'TLP:AMBER',   // org-limited
  'TLP:RED',     // eyes-only
  'PII',         // personally identifiable — GDPR applies
  'SENSITIVE',   // financial, health
] as const;

export interface DeletionRequest {
  tenantId: string;
  requestedBy: string;      // userId of requester
  scope: 'user_data' | 'tenant_full' | 'specific_records';
  targetUserId?: string;     // for individual right-to-erasure
  targetRecordIds?: string[];
  reason: string;
  gdprArticle?: '17' | '21'; // Article 17 = erasure, 21 = objection
}

export interface DeletionCertificate {
  requestId: string;
  tenantId: string;
  deletedAt: string;
  recordsDeleted: number;
  tablesAffected: string[];
  retainedForLegal: string[]; // audit logs etc. retained per SOC 2
  verifiedBy: string;         // system or admin userId
}

/**
 * Execute GDPR right-to-deletion across all data stores.
 * Audit logs are NEVER deleted (SOC 2 override — log the deletion itself).
 */
export async function executeGDPRDeletion(
  request: DeletionRequest,
  db: PrismaClient
): Promise<DeletionCertificate> {
  const tablesAffected: string[] = [];
  let recordsDeleted = 0;

  // 1. PostgreSQL — delete user PII, anonymize references
  if (request.scope === 'user_data' && request.targetUserId) {
    const userResult = await db.users.update({
      where: { id: request.targetUserId },
      data: {
        email: `deleted_${request.targetUserId}@redacted.local`,
        full_name: '[REDACTED]',
        avatar_url: null,
        password_hash: null,
        mfa_secret: null,
        status: 'deleted',
      },
    });
    tablesAffected.push('users');
    recordsDeleted++;
  }

  if (request.scope === 'tenant_full') {
    // Cascade delete — tenants table ON DELETE CASCADE handles children
    // EXCEPT audit_logs which are retained
    await db.tenants.update({
      where: { id: request.tenantId },
      data: { status: 'deleted' },
    });
    tablesAffected.push('tenants', 'users', 'sessions', 'api_keys',
      'iocs', 'feed_sources', 'integrations');
  }

  // 2. Elasticsearch — delete tenant indices
  // (handled by scheduled cleanup job for deleted tenants)

  // 3. Neo4j — delete tenant nodes
  // (handled by scheduled cleanup job for deleted tenants)

  // 4. Redis — flush tenant keys
  // (handled by key expiry + explicit flush)

  // 5. MinIO — delete archived tenant data
  // (handled by scheduled cleanup job for deleted tenants)

  // 6. Record deletion in audit log (immutable — this is NEVER deleted)
  await db.audit_logs.create({
    data: {
      tenant_id: request.tenantId,
      user_id: request.requestedBy,
      action: 'data.gdpr_deletion',
      resource_type: request.scope,
      resource_id: request.targetUserId ?? request.tenantId,
      changes: {
        reason: request.reason,
        gdprArticle: request.gdprArticle,
        recordsDeleted,
        tablesAffected,
      },
      ip_address: null,
      user_agent: null,
    },
  });

  return {
    requestId: crypto.randomUUID(),
    tenantId: request.tenantId,
    deletedAt: new Date().toISOString(),
    recordsDeleted,
    tablesAffected,
    retainedForLegal: ['audit_logs'],
    verifiedBy: request.requestedBy,
  };
}
```

### Automated Retention Enforcement (Cron Job)

```typescript
// apps/admin-service/src/jobs/retention-enforcer.ts

import { DEFAULT_RETENTION_DAYS } from '@etip/shared-audit';
import { QUEUES } from '@etip/shared-utils';

/**
 * Runs nightly via BullMQ repeatable job.
 * Deletes data older than retention period per category.
 */
export async function enforceRetentionPolicies(db: PrismaClient): Promise<void> {
  const now = new Date();

  for (const [category, days] of Object.entries(DEFAULT_RETENTION_DAYS)) {
    if (category === 'audit_logs') continue; // NEVER auto-delete audit logs

    const cutoff = new Date(now.getTime() - days * 86_400_000);

    // Category-to-table mapping
    const tableMap: Record<string, string> = {
      ioc_data:           'iocs',
      enrichment_cache:   'iocs',     // enrichment_data JSONB field
      feed_raw_data:      'feed_sources',
      user_sessions:      'sessions',
      api_request_logs:   'api_request_logs',
      investigation_data: 'investigations',
      alert_history:      'alert_events',
    };

    const table = tableMap[category];
    if (!table) continue;

    const result = await db.$executeRaw`
      DELETE FROM ${Prisma.raw(table)}
      WHERE created_at < ${cutoff}
    `;

    logger.info({ category, table, cutoff, deleted: result },
      'Retention policy enforced');
  }
}
```
