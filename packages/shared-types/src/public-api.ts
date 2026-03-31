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

export const WebhookCreateBodySchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(WebhookEventSchema).min(1),
});
export type WebhookCreateBody = z.infer<typeof WebhookCreateBodySchema>;

export const WebhookUpdateBodySchema = z.object({
  url: z.string().url().max(2048).optional(),
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
