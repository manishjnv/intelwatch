import { z } from 'zod';
import { IocDocumentSchema, IocIndexJobSchema } from '@etip/shared-utils';
import type { IocDocument, IocIndexJob } from '@etip/shared-utils';

// ── IOC document stored in Elasticsearch (shared contract, DECISION-033) ────
// Re-exported under the old local names so existing imports keep working.

export { IocDocumentSchema, IocIndexJobSchema };
export type { IocDocument, IocIndexJob };

// ── Search query params ──────────────────────────────────────────────────────

export const SearchQueryParamsSchema = z.object({
  tenantId: z.string().min(1),
  q: z.string().optional(),
  type: z.string().optional(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  tlp: z.enum(['WHITE', 'GREEN', 'AMBER', 'RED']).optional(),
  enriched: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  // ponytail: same accept-string-default-false pattern as `enriched` above —
  // z.coerce.boolean() would turn the string "false" into `true`.
  includeInactive: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type SearchQueryParams = z.infer<typeof SearchQueryParamsSchema>;

// ── Reindex request body ──────────────────────────────────────────────────────

export const ReindexBodySchema = z.object({
  tenantId: z.string().min(1),
  iocs: z.array(IocDocumentSchema).default([]),
});

export type ReindexBody = z.infer<typeof ReindexBodySchema>;

// ── Search result ─────────────────────────────────────────────────────────────

export interface AggregationBucket {
  key: string;
  count: number;
}

export interface IocAggregations {
  by_type: AggregationBucket[];
  by_severity: AggregationBucket[];
  by_tlp: AggregationBucket[];
}

export interface IocSearchResult {
  total: number;
  page: number;
  limit: number;
  data: IocDocument[];
  aggregations: IocAggregations;
}

// ── Reindex result ────────────────────────────────────────────────────────────

export interface ReindexResult {
  indexed: number;
  failed: number;
}

// ── Migration result ──────────────────────────────────────────────────────────

export interface MigrationResult {
  tenantId: string;
  totalMigrated: number;
  perCategory: Record<string, number>;
  sourceIndex: string;
  status: 'completed' | 'skipped';
  message?: string;
}
