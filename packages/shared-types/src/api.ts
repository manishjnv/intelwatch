/**
 * @module @etip/shared-types/api
 * @description Standard API response envelopes, pagination types,
 * and request parameter schemas used across all services.
 */
import { z } from 'zod';

/**
 * Paginated list response envelope.
 * Used by all list endpoints: `{ data: T[], total, page, limit }`.
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
  });

/** TypeScript type for paginated responses */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** Single item response envelope: `{ data: T }` */
export interface SingleResponse<T> {
  data: T;
}

/** Error response envelope (from AppError) */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Standard pagination query parameters */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Sort direction */
export const SortDirectionSchema = z.enum(['asc', 'desc']).default('desc');
export type SortDirection = z.infer<typeof SortDirectionSchema>;

/** Generic sort + pagination query */
export const SortedPaginationQuerySchema = PaginationQuerySchema.extend({
  sortBy: z.string().default('createdAt'),
  sortDir: SortDirectionSchema,
});
export type SortedPaginationQuery = z.infer<typeof SortedPaginationQuerySchema>;

/** Date range filter (used across many endpoints) */
export const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

/** Standard tenant-scoped request context */
export interface RequestContext {
  tenantId: string;
  userId: string;
  roles: string[];
  sessionId: string;
}

/** Health check response */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
