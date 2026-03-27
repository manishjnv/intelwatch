/**
 * @module Catalog Schemas
 * @description Zod validation schemas for Global Feed Catalog API (DECISION-029).
 */
import { z } from 'zod';

export const CreateCatalogSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  feedType: z.enum(['rss', 'nvd', 'stix', 'rest', 'misp']),
  url: z.string().url(),
  schedule: z.string().optional(),
  minPlanTier: z.enum(['free', 'starter', 'teams', 'enterprise']).default('free'),
  sourceReliability: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).default('C'),
  infoCred: z.number().int().min(1).max(6).default(3),
  industries: z.array(z.string()).optional(),
});

export type CreateCatalogInput = z.infer<typeof CreateCatalogSchema>;

export const UpdateCatalogSchema = CreateCatalogSchema.partial();
export type UpdateCatalogInput = z.infer<typeof UpdateCatalogSchema>;

export const SubscribeSchema = z.object({
  globalFeedId: z.string().uuid(),
});

export const CatalogQuerySchema = z.object({
  feedType: z.string().optional(),
  minPlanTier: z.string().optional(),
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
