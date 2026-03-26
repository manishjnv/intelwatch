import { AppError } from '@etip/shared-utils';
import type { PlanId } from '../schemas/billing.js';
import type { SubscriptionRepo } from '../repository.js';

export type { PlanId };

/** Feature flags per plan tier. */
export interface PlanFeatures {
  api_access: boolean;
  graph_visualization: boolean;
  dark_web_monitoring: boolean;
  correlation_engine: boolean;
  threat_hunting: boolean;
  advanced_export: boolean;
  sso_saml: boolean;
  custom_integrations: boolean;
  ai_enrichment: boolean;
  custom_ai_keys: boolean;
}

/** Resource limits per plan tier. -1 = unlimited. */
export interface PlanLimits {
  iocQueriesPerDay: number;
  iocStorageK: number;       // in thousands (10 = 10,000 IOCs)
  maxFeeds: number;
  maxUsers: number;
  maxIntegrations: number;
  enrichmentsPerDay: number;
}

/** A billing plan definition. */
export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceInr: number;        // monthly, 0 = free
  priceUsd: number;        // monthly, 0 = free
  razorpayPlanId: string;  // Razorpay plan id (set in production)
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
  description: string;
  popular: boolean;
}

/** Per-tenant plan subscription state. */
export interface TenantPlanState {
  tenantId: string;
  planId: PlanId;
  previousPlanId?: PlanId;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled';
  scheduledPlanId?: PlanId;          // downgrade to apply at period end
  scheduledPlanEffectiveAt?: Date;
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  trialEndsAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  updatedAt: Date;
}

/** Feature comparison entry for the compare-plans endpoint. */
export interface FeatureComparisonEntry {
  key: keyof PlanFeatures;
  label: string;
  availability: Record<PlanId, boolean>;
}

/** Canonical plan definitions — all 4 ETIP tiers. */
export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceInr: 0,
    priceUsd: 0,
    razorpayPlanId: '',
    trialDays: 0,
    description: 'For individual analysts and evaluation.',
    popular: false,
    limits: {
      iocQueriesPerDay: 100,
      iocStorageK: 10,
      maxFeeds: 3,
      maxUsers: 2,
      maxIntegrations: 0,
      enrichmentsPerDay: 10,
    },
    features: {
      api_access: false,
      graph_visualization: false,
      dark_web_monitoring: false,
      correlation_engine: false,
      threat_hunting: false,
      advanced_export: false,
      sso_saml: false,
      custom_integrations: false,
      ai_enrichment: false,
      custom_ai_keys: false,
    },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceInr: 4999,
    priceUsd: 59,
    razorpayPlanId: process.env['TI_RAZORPAY_PLAN_STARTER'] ?? 'plan_starter',
    trialDays: 14,
    description: 'For small security teams (up to 10 users).',
    popular: false,
    limits: {
      iocQueriesPerDay: 5000,
      iocStorageK: 500,
      maxFeeds: 20,
      maxUsers: 10,
      maxIntegrations: 3,
      enrichmentsPerDay: 500,
    },
    features: {
      api_access: true,
      graph_visualization: false,
      dark_web_monitoring: false,
      correlation_engine: true,
      threat_hunting: false,
      advanced_export: true,
      sso_saml: false,
      custom_integrations: false,
      ai_enrichment: true,
      custom_ai_keys: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Professional',
    priceInr: 14999,
    priceUsd: 179,
    razorpayPlanId: process.env['TI_RAZORPAY_PLAN_PRO'] ?? 'plan_pro',
    trialDays: 14,
    description: 'For professional SOC teams (up to 50 users).',
    popular: true,
    limits: {
      iocQueriesPerDay: 50000,
      iocStorageK: 5000,
      maxFeeds: -1,
      maxUsers: 50,
      maxIntegrations: -1,
      enrichmentsPerDay: 5000,
    },
    features: {
      api_access: true,
      graph_visualization: true,
      dark_web_monitoring: true,
      correlation_engine: true,
      threat_hunting: true,
      advanced_export: true,
      sso_saml: true,
      custom_integrations: true,
      ai_enrichment: true,
      custom_ai_keys: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceInr: 0, // custom pricing
    priceUsd: 0,
    razorpayPlanId: process.env['TI_RAZORPAY_PLAN_ENTERPRISE'] ?? 'plan_enterprise',
    trialDays: 30,
    description: 'Unlimited everything with custom pricing and SLA.',
    popular: false,
    limits: {
      iocQueriesPerDay: -1,
      iocStorageK: -1,
      maxFeeds: -1,
      maxUsers: -1,
      maxIntegrations: -1,
      enrichmentsPerDay: -1,
    },
    features: {
      api_access: true,
      graph_visualization: true,
      dark_web_monitoring: true,
      correlation_engine: true,
      threat_hunting: true,
      advanced_export: true,
      sso_saml: true,
      custom_integrations: true,
      ai_enrichment: true,
      custom_ai_keys: true,
    },
  },
};

/** Store for plan definitions and per-tenant plan state.
 *  Supports dual-mode: Prisma-backed (production) or in-memory (tests/fallback).
 */
export class PlanStore {
  private readonly tenantPlans = new Map<string, TenantPlanState>();
  private readonly repo?: SubscriptionRepo;

  constructor(repo?: SubscriptionRepo) {
    this.repo = repo;
  }

  /** Get the definition for a plan by id. Throws NOT_FOUND for unknown ids. */
  getPlanById(planId: PlanId): PlanDefinition {
    const plan = PLAN_DEFINITIONS[planId];
    if (!plan) throw new AppError(404, `Plan not found: ${planId}`, 'NOT_FOUND');
    return plan;
  }

  /** List all 4 plan definitions in tier order. */
  listPlans(): PlanDefinition[] {
    return (['free', 'starter', 'pro', 'enterprise'] as PlanId[]).map((id) => PLAN_DEFINITIONS[id]);
  }

  /** Get or initialise the plan state for a tenant (defaults to free). */
  async getTenantPlan(tenantId: string): Promise<TenantPlanState> {
    if (this.repo) {
      const existing = await this.repo.getTenantPlan(tenantId);
      if (existing) return existing;
      // Auto-create free plan
      return this.repo.upsertTenantPlan({
        tenantId,
        planId: 'free',
        status: 'active',
        updatedAt: new Date(),
      });
    }
    if (!this.tenantPlans.has(tenantId)) {
      this.tenantPlans.set(tenantId, {
        tenantId,
        planId: 'free',
        status: 'active',
        updatedAt: new Date(),
      });
    }
    return this.tenantPlans.get(tenantId)!;
  }

  /** Assign a plan to a tenant. Throws NOT_FOUND for invalid plan ids. */
  async setTenantPlan(tenantId: string, planId: PlanId): Promise<TenantPlanState> {
    this.getPlanById(planId); // validates
    const existing = await this.getTenantPlan(tenantId);
    const updated: TenantPlanState = {
      ...existing,
      previousPlanId: existing.planId,
      planId,
      status: 'active',
      updatedAt: new Date(),
    };
    if (this.repo) return this.repo.upsertTenantPlan(updated);
    this.tenantPlans.set(tenantId, updated);
    return updated;
  }

  /** Update Razorpay subscription metadata for a tenant. */
  async setRazorpayIds(tenantId: string, customerId: string, subscriptionId?: string): Promise<TenantPlanState> {
    const state = await this.getTenantPlan(tenantId);
    const updated: TenantPlanState = {
      ...state,
      razorpayCustomerId: customerId,
      razorpaySubscriptionId: subscriptionId ?? state.razorpaySubscriptionId,
      updatedAt: new Date(),
    };
    if (this.repo) return this.repo.upsertTenantPlan(updated);
    this.tenantPlans.set(tenantId, updated);
    return updated;
  }

  /** Schedule a downgrade to take effect at period end. */
  async scheduleDowngrade(tenantId: string, planId: PlanId, effectiveAt: Date): Promise<TenantPlanState> {
    const state = await this.getTenantPlan(tenantId);
    const updated: TenantPlanState = {
      ...state,
      scheduledPlanId: planId,
      scheduledPlanEffectiveAt: effectiveAt,
      updatedAt: new Date(),
    };
    if (this.repo) return this.repo.upsertTenantPlan(updated);
    this.tenantPlans.set(tenantId, updated);
    return updated;
  }

  /** Check if a feature is allowed for a tenant's current plan. */
  async isFeatureAllowed(tenantId: string, feature: keyof PlanFeatures): Promise<boolean> {
    const state = await this.getTenantPlan(tenantId);
    const plan = PLAN_DEFINITIONS[state.planId];
    return plan?.features[feature] ?? false;
  }

  /** Get all tenant plan states (for admin dashboard). */
  async getAllTenantPlans(): Promise<TenantPlanState[]> {
    if (this.repo) return this.repo.getAllTenantPlans();
    return Array.from(this.tenantPlans.values());
  }

  /** Return feature comparison matrix across all plans. */
  comparePlans(): { plans: PlanDefinition[]; features: FeatureComparisonEntry[] } {
    const plans = this.listPlans();
    const featureKeys: { key: keyof PlanFeatures; label: string }[] = [
      { key: 'api_access', label: 'API Access' },
      { key: 'graph_visualization', label: 'Threat Graph Visualization' },
      { key: 'dark_web_monitoring', label: 'Dark Web Monitoring' },
      { key: 'correlation_engine', label: 'Correlation Engine' },
      { key: 'threat_hunting', label: 'Threat Hunting' },
      { key: 'advanced_export', label: 'Advanced Export (STIX, CSV, PDF)' },
      { key: 'sso_saml', label: 'SSO / SAML 2.0' },
      { key: 'custom_integrations', label: 'Custom Integrations' },
      { key: 'ai_enrichment', label: 'AI Enrichment' },
      { key: 'custom_ai_keys', label: 'Bring Your Own AI Key (BYOK)' },
    ];

    const features: FeatureComparisonEntry[] = featureKeys.map(({ key, label }) => ({
      key,
      label,
      availability: {
        free: PLAN_DEFINITIONS.free.features[key],
        starter: PLAN_DEFINITIONS.starter.features[key],
        pro: PLAN_DEFINITIONS.pro.features[key],
        enterprise: PLAN_DEFINITIONS.enterprise.features[key],
      },
    }));

    return { plans, features };
  }
}
