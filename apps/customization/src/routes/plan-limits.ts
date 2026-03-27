/**
 * @module routes/plan-limits
 * @description Super-admin routes for managing global plan tier limits.
 * Controls feed quotas, AI access, retention, and token budgets per plan.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';

// ── Types ─────────────────────────────────────────────────────────

export type PlanId = 'free' | 'starter' | 'teams' | 'enterprise';

export interface PlanTierConfig {
  planId: PlanId;
  maxPrivateFeeds: number;
  maxGlobalSubs: number;
  minFetchInterval: string;
  retentionDays: number;
  aiEnabled: boolean;
  dailyTokenBudget: number;
}

const VALID_PLAN_IDS: PlanId[] = ['free', 'starter', 'teams', 'enterprise'];

// ── Default plan configs ──────────────────────────────────────────

const DEFAULT_PLANS: Record<PlanId, PlanTierConfig> = {
  free:       { planId: 'free',       maxPrivateFeeds: 3,  maxGlobalSubs: 5,  minFetchInterval: '4h',  retentionDays: 7,   aiEnabled: false, dailyTokenBudget: 0 },
  starter:    { planId: 'starter',    maxPrivateFeeds: 10, maxGlobalSubs: 20, minFetchInterval: '2h',  retentionDays: 30,  aiEnabled: true,  dailyTokenBudget: 10_000 },
  teams:      { planId: 'teams',      maxPrivateFeeds: 25, maxGlobalSubs: 50, minFetchInterval: '30m', retentionDays: 90,  aiEnabled: true,  dailyTokenBudget: 100_000 },
  enterprise: { planId: 'enterprise', maxPrivateFeeds: -1, maxGlobalSubs: -1, minFetchInterval: '15m', retentionDays: -1,  aiEnabled: true,  dailyTokenBudget: -1 },
};

// ── Plan Limits Store (in-memory, seeds from defaults) ────────────

export class PlanLimitsStore {
  private plans: Map<PlanId, PlanTierConfig> = new Map();

  getAll(): PlanTierConfig[] {
    if (this.plans.size === 0) this.seedDefaults();
    return Array.from(this.plans.values());
  }

  get(planId: PlanId): PlanTierConfig | undefined {
    if (this.plans.size === 0) this.seedDefaults();
    return this.plans.get(planId);
  }

  update(planId: PlanId, partial: Partial<Omit<PlanTierConfig, 'planId'>>): PlanTierConfig {
    if (this.plans.size === 0) this.seedDefaults();
    const existing = this.plans.get(planId);
    if (!existing) throw new AppError(404, `Plan not found: ${planId}`, 'NOT_FOUND');

    const updated: PlanTierConfig = { ...existing, ...partial, planId };
    this.plans.set(planId, updated);
    return updated;
  }

  private seedDefaults(): void {
    for (const [id, config] of Object.entries(DEFAULT_PLANS)) {
      this.plans.set(id as PlanId, { ...config });
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────

export interface PlanLimitsRouteDeps {
  planLimitsStore: PlanLimitsStore;
}

function assertAdmin(req: FastifyRequest): void {
  const role = req.headers['x-user-role'] as string | undefined;
  if (role !== 'super_admin') {
    throw new AppError(403, 'Forbidden: super_admin required', 'FORBIDDEN');
  }
}

export function planLimitsRoutes(deps: PlanLimitsRouteDeps) {
  const { planLimitsStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /plans — Returns all plan tier configurations. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      assertAdmin(req);
      const plans = planLimitsStore.getAll();
      return reply.send({ data: plans, total: plans.length });
    });

    /** PUT /plans/:planId — Update a plan's configuration. */
    app.put<{ Params: { planId: string }; Body: Partial<PlanTierConfig> }>(
      '/:planId',
      async (req, reply) => {
        assertAdmin(req);

        const { planId } = req.params;
        if (!VALID_PLAN_IDS.includes(planId as PlanId)) {
          throw new AppError(404, `Invalid planId: ${planId}. Must be one of: ${VALID_PLAN_IDS.join(', ')}`, 'NOT_FOUND');
        }

        const body = req.body as Partial<PlanTierConfig>;
        const updated = planLimitsStore.update(planId as PlanId, body);
        return reply.send({ data: updated });
      },
    );
  };
}
