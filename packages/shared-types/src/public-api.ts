/**
 * @module @etip/shared-types/public-api
 * @description Types and Zod schemas for the Public API (client-facing IOC & feed consumption).
 * Used by api-gateway public routes and webhook delivery worker.
 */
import { z } from 'zod';

// ── Public IOC DTO ────────────────────────────────────────────────────
export const PublicIocDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  value: z.string(),
  severity: z.string(),
  tlp: z.string(),
  confidence: z.number().int().min(0).max(100),
  lifecycle: z.string(),
  tags: z.array(z.string()),
  mitreAttack: z.array(z.string()),
  malwareFamilies: z.array(z.string()),
  threatActors: z.array(z.string()),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicIocDto = z.infer<typeof PublicIocDtoSchema>;

// ── Public Feed DTO ───────────────────────────────────────────────────
export const PublicFeedDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  feedType: z.string(),
  status: z.string(),
  lastFetchAt: z.string().datetime().nullable(),
  feedReliability: z.number().int().min(0).max(100),
  totalItemsIngested: z.number().int(),
});
export type PublicFeedDto = z.infer<typeof PublicFeedDtoSchema>;

// ── Public Article DTO ────────────────────────────────────────────────
export const PublicArticleDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  url: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  author: z.string().nullable(),
  isCtiRelevant: z.boolean(),
  articleType: z.string(),
  iocsExtracted: z.number().int(),
});
export type PublicArticleDto = z.infer<typeof PublicArticleDtoSchema>;

// ── Cursor-Based Pagination ───────────────────────────────────────────
export const CursorPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
  sort: z.enum(['lastSeen', 'firstSeen', 'confidence', 'severity', 'createdAt']).default('lastSeen'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

export interface CursorPaginationMeta {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: CursorPaginationMeta;
}

// ── IOC Filter Params ─────────────────────────────────────────────────
export const PublicIocFilterSchema = z.object({
  iocType: z.string().optional(),
  severity: z.string().optional(),
  lifecycle: z.string().optional(),
  tlp: z.enum(['white', 'green', 'amber']).optional(), // RED never exposed
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  maxConfidence: z.coerce.number().int().min(0).max(100).optional(),
  tags: z.string().optional(), // comma-separated
  threatActors: z.string().optional(), // comma-separated
  malwareFamilies: z.string().optional(), // comma-separated
  firstSeenFrom: z.string().datetime().optional(),
  firstSeenTo: z.string().datetime().optional(),
  lastSeenFrom: z.string().datetime().optional(),
  lastSeenTo: z.string().datetime().optional(),
});
export type PublicIocFilter = z.infer<typeof PublicIocFilterSchema>;

// ── IOC Search ────────────────────────────────────────────────────────
export const PublicIocSearchBodySchema = z.object({
  query: z.string().min(1).max(1000),
  exact: z.boolean().default(false),
  iocType: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PublicIocSearchBody = z.infer<typeof PublicIocSearchBodySchema>;

// ── IOC Export ────────────────────────────────────────────────────────
export const PublicIocExportBodySchema = z.object({
  format: z.enum(['json', 'csv', 'stix']),
  filters: PublicIocFilterSchema.optional(),
  limit: z.number().int().min(1).max(10000).default(1000),
});
export type PublicIocExportBody = z.infer<typeof PublicIocExportBodySchema>;

// ── Webhook Subscription ──────────────────────────────────────────────
export const WEBHOOK_EVENTS = [
  'ioc.created',
  'ioc.updated',
  'ioc.expired',
  'alert.fired',
] as const;
export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/**
 * Validate a webhook URL: must be HTTPS and must not resolve to private/loopback IPs (SSRF prevention).
 */
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/0\./,
  /^https?:\/\/169\.254\./,              // link-local
  /^https?:\/\/\[::1\]/,                 // IPv6 loopback
  /^https?:\/\/\[fd[0-9a-f]{2}:/i,      // IPv6 ULA
  /^https?:\/\/\[fe80:/i,               // IPv6 link-local
];

const safeWebhookUrl = z.string().url().max(2048).refine(
  (url) => url.startsWith('https://'),
  { message: 'Webhook URL must use HTTPS' },
).refine(
  (url) => !PRIVATE_IP_PATTERNS.some((re) => re.test(url)),
  { message: 'Webhook URL must not point to private/internal networks' },
);

export const WebhookCreateBodySchema = z.object({
  url: safeWebhookUrl,
  events: z.array(WebhookEventSchema).min(1),
});
export type WebhookCreateBody = z.infer<typeof WebhookCreateBodySchema>;

export const WebhookUpdateBodySchema = z.object({
  url: safeWebhookUrl.optional(),
  events: z.array(WebhookEventSchema).min(1).optional(),
  active: z.boolean().optional(),
});
export type WebhookUpdateBody = z.infer<typeof WebhookUpdateBodySchema>;

export interface PublicWebhookDto {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failCount: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  createdAt: string;
}

// ── Webhook Delivery Payload ──────────────────────────────────────────
export interface WebhookDeliveryPayload {
  subscriptionId: string;
  tenantId: string;
  url: string;
  secret: string;
  event: string;
  data: Record<string, unknown>;
}

// ── Public API Usage Response ─────────────────────────────────────────
export interface PublicApiUsageDto {
  plan: string;
  rateLimitPerMinute: number;
  quotas: {
    daily: { limit: number; used: number; remaining: number };
    monthly: { limit: number; used: number; remaining: number };
  };
  webhooks: { limit: number; used: number };
}

// ── Bulk IOC Lookup ──────────────────────────────────────────────────
export const BulkIocLookupBodySchema = z.object({
  values: z.array(z.string().min(1).max(1000)).min(1).max(100),
  iocType: z.string().optional(),
});
export type BulkIocLookupBody = z.infer<typeof BulkIocLookupBodySchema>;

// ── IOC Stats Response ───────────────────────────────────────────────
export interface PublicIocStatsDto {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byTlp: Record<string, number>;
  byLifecycle: Record<string, number>;
  lastUpdated: string | null;
}

// ── Enrichment Metadata (opt-in via ?include=enrichment) ────────────
export const PublicIocEnrichmentDtoSchema = z.object({
  status: z.enum(['enriched', 'partial', 'pending', 'failed', 'skipped']),
  externalRiskScore: z.number().nullable(),
  sources: z.array(z.string()),
  geolocation: z.object({
    countryCode: z.string(),
    isp: z.string(),
    isTor: z.boolean(),
  }).nullable().optional(),
  aiSummary: z.string().nullable().optional(),
});
export type PublicIocEnrichmentDto = z.infer<typeof PublicIocEnrichmentDtoSchema>;

/** Extended IOC DTO with optional enrichment metadata. */
export const PublicIocWithEnrichmentDtoSchema = PublicIocDtoSchema.extend({
  enrichment: PublicIocEnrichmentDtoSchema.optional(),
});
export type PublicIocWithEnrichmentDto = z.infer<typeof PublicIocWithEnrichmentDtoSchema>;

// ── API Key Rotation ────────────────────────────────────────────────
export const ApiKeyRotateResponseSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  prefix: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  graceExpiresAt: z.string().datetime(),
  message: z.string(),
});
export type ApiKeyRotateResponse = z.infer<typeof ApiKeyRotateResponseSchema>;

/**
 * Default per-minute burst limit when the DB plan limit cannot be resolved.
 * All real limits (including per-minute burst) are DB-driven via the plan
 * definition system. The super admin controls every tier equally.
 *
 * Per-minute burst: api_access.limitWeekly  (repurposed — "requests per minute")
 * Daily quota:      api_access.limitDaily
 * Monthly quota:    api_access.limitMonthly
 * Webhook cap:      api_access.limitTotal
 *
 * -1 in any field = unlimited.
 */
export const PUBLIC_API_BURST_FALLBACK = 10;
