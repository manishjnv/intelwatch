import { z } from 'zod';

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
  });

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SingleResponse<T> {
  data: T;
}

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const SortDirectionSchema = z.enum(['asc', 'desc']).default('desc');
export type SortDirection = z.infer<typeof SortDirectionSchema>;

export const SortedPaginationQuerySchema = PaginationQuerySchema.extend({
  sortBy: z.string().default('createdAt'),
  sortDir: SortDirectionSchema,
});
export type SortedPaginationQuery = z.infer<typeof SortedPaginationQuerySchema>;

export const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export interface RequestContext {
  tenantId: string;
  userId: string;
  roles: string[];
  sessionId: string;
}

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
