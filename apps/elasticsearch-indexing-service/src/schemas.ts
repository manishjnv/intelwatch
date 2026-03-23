import { z } from 'zod';

// ── IOC document stored in Elasticsearch ────────────────────────────────────

export const IocDocumentSchema = z.object({
  iocId: z.string().min(1),
  value: z.string().min(1),
  type: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().int().min(0).max(100),
  tags: z.array(z.string()).default([]),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  tenantId: z.string().min(1),
  sourceId: z.string().optional(),
  enriched: z.boolean().default(false),
  tlp: z.enum(['WHITE', 'GREEN', 'AMBER', 'RED']).default('WHITE'),
  campaignIds: z.array(z.string()).optional(),
  actorIds: z.array(z.string()).optional(),
});

export type IocDocument = z.infer<typeof IocDocumentSchema>;

// ── Search query params ──────────────────────────────────────────────────────

export const SearchQueryParamsSchema = z.object({
  tenantId: z.string().min(1),
  q: z.string().optional(),
  type: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tlp: z.enum(['WHITE', 'GREEN', 'AMBER', 'RED']).optional(),
  enriched: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
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

// ── BullMQ job payload ────────────────────────────────────────────────────────

export const IocIndexJobSchema = z.object({
  iocId: z.string().min(1),
  tenantId: z.string().min(1),
  action: z.enum(['index', 'update', 'delete']),
  payload: z.record(z.unknown()).optional(),
});

export type IocIndexJob = z.infer<typeof IocIndexJobSchema>;

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
