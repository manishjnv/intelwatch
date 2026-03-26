/**
 * Feed Quota Store
 *
 * Manages per-plan feed quotas and per-tenant plan assignments.
 * Plans: free (default), starter, teams, enterprise.
 * No DB entry = Free tier. Enterprise maxFeeds=-1 (unlimited).
 */

import { AppError } from '@etip/shared-utils';

// ─── Types ────────────────────────────────────────────────────

export type BillingPlanId = 'free' | 'starter' | 'teams' | 'enterprise';

export interface FeedQuota {
  maxFeeds: number;            // -1 = unlimited
  minFetchInterval: string;    // cron expression (minimum allowed)
  retentionDays: number;       // -1 = unlimited
  defaultFeedNames: string[];  // feeds auto-seeded on plan assignment
}

export interface TenantPlanAssignment {
  tenantId: string;
  planId: BillingPlanId;
  assignedBy: string;   // userId or 'system'
  assignedAt: Date;
}

export interface PlanQuotaDefinition {
  planId: BillingPlanId;
  displayName: string;
  feedQuota: FeedQuota;
}

// ─── Default feed names by tier ───────────────────────────────

const FREE_TIER_FEEDS = [
  'The Hacker News',
  'CISA Advisories RSS',
  'NVD Recent CVEs',
];

const ALL_OSINT_FEEDS = [
  'AlienVault OTX',
  'Abuse.ch URLhaus',
  'CISA KEV',
  'Feodo Tracker',
  'MalwareBazaar Recent',
  'CISA Advisories RSS',
  'The Hacker News',
  'BleepingComputer',
  'US-CERT Alerts',
  'NVD Recent CVEs',
];

// ─── Plan quota definitions ───────────────────────────────────

const PLAN_QUOTAS: Record<BillingPlanId, PlanQuotaDefinition> = {
  free: {
    planId: 'free',
    displayName: 'Free',
    feedQuota: {
      maxFeeds: 3,
      minFetchInterval: '0 */4 * * *',
      retentionDays: 7,
      defaultFeedNames: FREE_TIER_FEEDS,
    },
  },
  starter: {
    planId: 'starter',
    displayName: 'Starter',
    feedQuota: {
      maxFeeds: 10,
      minFetchInterval: '0 */2 * * *',
      retentionDays: 30,
      defaultFeedNames: ALL_OSINT_FEEDS,
    },
  },
  teams: {
    planId: 'teams',
    displayName: 'Teams',
    feedQuota: {
      maxFeeds: 25,
      minFetchInterval: '*/30 * * * *',
      retentionDays: 90,
      defaultFeedNames: ALL_OSINT_FEEDS,
    },
  },
  enterprise: {
    planId: 'enterprise',
    displayName: 'Enterprise',
    feedQuota: {
      maxFeeds: -1,
      minFetchInterval: '*/15 * * * *',
      retentionDays: -1,
      defaultFeedNames: ALL_OSINT_FEEDS,
    },
  },
};

const VALID_PLAN_IDS: BillingPlanId[] = ['free', 'starter', 'teams', 'enterprise'];

// ─── Next-plan mapping for upgrade prompts ────────────────────

const NEXT_PLAN: Record<BillingPlanId, BillingPlanId | null> = {
  free: 'starter',
  starter: 'teams',
  teams: 'enterprise',
  enterprise: null,
};

// ─── Feed Quota Store ─────────────────────────────────────────

export class FeedQuotaStore {
  /** tenantId → plan assignment (no entry = Free) */
  private readonly assignments = new Map<string, TenantPlanAssignment>();

  // ── Plan quota CRUD ──────────────────────────────────────

  /** List all plan quota definitions. */
  listPlanQuotas(): PlanQuotaDefinition[] {
    return VALID_PLAN_IDS.map((id) => PLAN_QUOTAS[id]);
  }

  /** Get quota definition for a plan. */
  getPlanQuota(planId: BillingPlanId): PlanQuotaDefinition {
    const def = PLAN_QUOTAS[planId];
    if (!def) throw new AppError(404, `Unknown plan: ${planId}`, 'PLAN_NOT_FOUND');
    return def;
  }

  /** Get the next upgrade plan for a given plan. */
  getNextPlan(planId: BillingPlanId): BillingPlanId | null {
    return NEXT_PLAN[planId] ?? null;
  }

  /** Update feed quota for a plan (super_admin only). */
  updatePlanQuota(planId: BillingPlanId, updates: Partial<FeedQuota>): PlanQuotaDefinition {
    const def = this.getPlanQuota(planId);
    if (updates.maxFeeds !== undefined) def.feedQuota.maxFeeds = updates.maxFeeds;
    if (updates.minFetchInterval !== undefined) def.feedQuota.minFetchInterval = updates.minFetchInterval;
    if (updates.retentionDays !== undefined) def.feedQuota.retentionDays = updates.retentionDays;
    if (updates.defaultFeedNames !== undefined) def.feedQuota.defaultFeedNames = updates.defaultFeedNames;
    return def;
  }

  // ── Tenant plan assignment ──────────────────────────────

  /** Get a tenant's plan assignment. Returns Free if no assignment. */
  getTenantPlan(tenantId: string): TenantPlanAssignment {
    const existing = this.assignments.get(tenantId);
    if (existing) return existing;
    return { tenantId, planId: 'free', assignedBy: 'system', assignedAt: new Date() };
  }

  /** Get the effective feed quota for a tenant (based on their plan). */
  getTenantFeedQuota(tenantId: string): FeedQuota & { planId: BillingPlanId; displayName: string } {
    const assignment = this.getTenantPlan(tenantId);
    const def = PLAN_QUOTAS[assignment.planId];
    return { ...def.feedQuota, planId: assignment.planId, displayName: def.displayName };
  }

  /** Assign a plan to a tenant. Returns previous plan for side-effect handling. */
  assignPlan(
    tenantId: string,
    planId: BillingPlanId,
    assignedBy: string,
  ): { assignment: TenantPlanAssignment; previousPlanId: BillingPlanId } {
    if (!VALID_PLAN_IDS.includes(planId)) {
      throw new AppError(400, `Invalid plan: ${planId}`, 'INVALID_PLAN');
    }
    const previous = this.getTenantPlan(tenantId);
    const assignment: TenantPlanAssignment = {
      tenantId,
      planId,
      assignedBy,
      assignedAt: new Date(),
    };
    this.assignments.set(tenantId, assignment);
    return { assignment, previousPlanId: previous.planId };
  }

  /** List all tenant plan assignments (for admin). */
  listAllAssignments(): TenantPlanAssignment[] {
    return Array.from(this.assignments.values());
  }

  /** Check if a plan is an upgrade from another. */
  isUpgrade(fromPlan: BillingPlanId, toPlan: BillingPlanId): boolean {
    const order: Record<BillingPlanId, number> = { free: 0, starter: 1, teams: 2, enterprise: 3 };
    return order[toPlan] > order[fromPlan];
  }

  /** Validate plan ID string. */
  static isValidPlanId(id: string): id is BillingPlanId {
    return VALID_PLAN_IDS.includes(id as BillingPlanId);
  }
}
