import { z } from 'zod';

// ── Plan IDs ───────────────────────────────────────────────────────
export const PlanIdSchema = z.enum(['free', 'starter', 'teams', 'enterprise']);
export type PlanId = z.infer<typeof PlanIdSchema>;

// ── Usage metric names ────────────────────────────────────────────
export const UsageMetricSchema = z.enum(['api_call', 'ioc_ingested', 'enrichment', 'storage_kb']);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

// ── Tenant plan assignment ─────────────────────────────────────────
export const SetTenantPlanSchema = z.object({
  planId: PlanIdSchema,
});

// ── Usage tracking ─────────────────────────────────────────────────
export const TrackUsageSchema = z.object({
  metric: UsageMetricSchema,
  count: z.number().int().min(1).max(1_000_000),
});

// ── Subscription creation ──────────────────────────────────────────
export const CreateSubscriptionSchema = z.object({
  planId: PlanIdSchema,
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email(),
  couponCode: z.string().optional(),
});

// ── Subscription cancel ────────────────────────────────────────────
export const CancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
});

// ── Checkout order creation ────────────────────────────────────────
export const CreateCheckoutSchema = z.object({
  planId: PlanIdSchema.refine((v) => v !== 'free', { message: 'Cannot checkout free plan' }),
  couponCode: z.string().optional(),
});

// ── Plan upgrade ───────────────────────────────────────────────────
export const UpgradePlanSchema = z.object({
  planId: PlanIdSchema,
  razorpaySubscriptionId: z.string().optional(),
  couponCode: z.string().optional(),
});

// ── Plan downgrade ─────────────────────────────────────────────────
export const DowngradePlanSchema = z.object({
  planId: PlanIdSchema,
});

// ── Upgrade preview query ──────────────────────────────────────────
export const UpgradePreviewQuerySchema = z.object({
  targetPlan: PlanIdSchema,
});

// ── Coupon creation (admin) ────────────────────────────────────────
export const CreateCouponSchema = z.object({
  code: z.string().min(3).max(50).regex(/^[A-Z0-9_-]+$/, 'Coupon code must be uppercase alphanumeric'),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().positive(),
  maxUses: z.number().int().min(1),
  expiresAt: z.string().datetime().transform((s) => new Date(s)),
  applicablePlans: z.array(PlanIdSchema).optional(),
});

// ── Coupon application ─────────────────────────────────────────────
export const ApplyCouponSchema = z.object({
  code: z.string().min(1),
});

// ── Invoice list query ─────────────────────────────────────────────
export const InvoiceListQuerySchema = z.object({
  status: z.enum(['pending', 'paid', 'cancelled', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Razorpay webhook body ──────────────────────────────────────────
export const RazorpayWebhookSchema = z.object({
  event: z.string().min(1),
  payload: z.record(z.unknown()),
});
