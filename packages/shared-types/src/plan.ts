/**
 * @module @etip/shared-types/plan
 * @description Zod schemas and types for the Plan Definition System (Phase A).
 * Used by api-gateway plan CRUD, seed scripts, and future quota enforcement.
 */
import { z } from 'zod';

// ── Feature Keys ───────────────────────────────────────────────────────
export const FEATURE_KEYS = [
  'ioc_management',
  'threat_actors',
  'malware_intel',
  'vulnerability_intel',
  'threat_hunting',
  'graph_exploration',
  'digital_risk_protection',
  'correlation_engine',
  'reports',
  'ai_enrichment',
  'feed_subscriptions',
  'users',
  'data_retention',
  'api_access',
  'ioc_storage',
  'alerts',
] as const;

export const FeatureKeySchema = z.enum(FEATURE_KEYS);
export type FeatureKey = z.infer<typeof FeatureKeySchema>;

// ── Plan Feature Limit Schema ──────────────────────────────────────────
export const PlanFeatureLimitSchema = z.object({
  featureKey: FeatureKeySchema,
  enabled: z.boolean().default(true),
  limitDaily: z.number().int().min(-1).default(-1),
  limitWeekly: z.number().int().min(-1).default(-1),
  limitMonthly: z.number().int().min(-1).default(-1),
  limitTotal: z.number().int().min(-1).default(-1),
});
export type PlanFeatureLimit = z.infer<typeof PlanFeatureLimitSchema>;

// ── Plan Definition Schema (create/update) ─────────────────────────────
export const PlanDefinitionCreateSchema = z.object({
  planId: z.string().min(1).max(30).regex(/^[a-z0-9_]+$/, 'planId must be lowercase alphanumeric with underscores'),
  name: z.string().min(1).max(100),
  description: z.string().max(2000).nullable().optional(),
  priceMonthlyInr: z.number().int().min(0).default(0),
  priceAnnualInr: z.number().int().min(0).default(0),
  isPublic: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  features: z.array(PlanFeatureLimitSchema).min(1),
});
export type PlanDefinitionCreate = z.infer<typeof PlanDefinitionCreateSchema>;

export const PlanDefinitionUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  priceMonthlyInr: z.number().int().min(0).optional(),
  priceAnnualInr: z.number().int().min(0).optional(),
  isPublic: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  features: z.array(PlanFeatureLimitSchema).optional(),
});
export type PlanDefinitionUpdate = z.infer<typeof PlanDefinitionUpdateSchema>;

// ── Tenant Feature Override Schema ─────────────────────────────────────
export const TenantFeatureOverrideCreateSchema = z.object({
  featureKey: FeatureKeySchema,
  limitDaily: z.number().int().min(-1).nullable().optional(),
  limitWeekly: z.number().int().min(-1).nullable().optional(),
  limitMonthly: z.number().int().min(-1).nullable().optional(),
  limitTotal: z.number().int().min(-1).nullable().optional(),
  reason: z.string().max(255).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type TenantFeatureOverrideCreate = z.infer<typeof TenantFeatureOverrideCreateSchema>;

export const TenantFeatureOverrideUpdateSchema = z.object({
  limitDaily: z.number().int().min(-1).nullable().optional(),
  limitWeekly: z.number().int().min(-1).nullable().optional(),
  limitMonthly: z.number().int().min(-1).nullable().optional(),
  limitTotal: z.number().int().min(-1).nullable().optional(),
  reason: z.string().max(255).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type TenantFeatureOverrideUpdate = z.infer<typeof TenantFeatureOverrideUpdateSchema>;

// ── Quota Enforcement Types (Phase B) ─────────────────────────────────

/** Merged limit for a single feature (plan default + override applied) */
export interface FeatureLimits {
  enabled: boolean;
  limitDaily: number;
  limitWeekly: number;
  limitMonthly: number;
  limitTotal: number;
}

/** Result of atomic check-and-increment */
export interface QuotaCheckResult {
  allowed: boolean;
  exceededPeriod?: 'daily' | 'weekly' | 'monthly' | 'total';
  limit?: number;
  used?: number;
  counters?: { daily: number; weekly: number; monthly: number; total: number };
}

/** Usage snapshot for a single feature */
export interface UsageSnapshot {
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
}

/** Quota threshold event payload */
export interface QuotaThresholdEvent {
  tenantId: string;
  featureKey: string;
  period: 'daily' | 'weekly' | 'monthly' | 'total';
  limit: number;
  used: number;
  percentage: number;
  plan: string;
  eventType: 'quota.warning.80' | 'quota.warning.90';
}
