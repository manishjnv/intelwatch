/**
 * Tenant AI Budget Gate — decides whether Haiku triage may run for a tenant,
 * based on their plan (aiEnabled + dailyTokenBudget) and a Redis-backed daily
 * token/USD counter. This is separate from EnrichmentCostTracker's in-memory
 * 24h-rolling USD check (kept as a belt-and-braces second gate in service.ts).
 */
import type { Redis } from 'ioredis';
import type pino from 'pino';
import type { PrismaClient } from '@prisma/client';

export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise';

export interface PlanAiConfig {
  aiEnabled: boolean;
  /** -1 = unlimited tokens (still subject to global USD cap) */
  dailyTokenBudget: number;
}

/**
 * ponytail: mirrors apps/customization plan-limits DEFAULT_PLANS aiEnabled +
 * dailyTokenBudget. Runtime super-admin edits there don't propagate here —
 * replace with a service call when plan limits are persisted to a shared store.
 * Note: customization's PlanId is free|starter|teams|enterprise; Prisma's Plan
 * enum (this service's source of truth for Tenant.plan) is free|starter|pro|enterprise.
 * "pro" is mapped to customization's "teams" tier values.
 */
export const PLAN_AI_DEFAULTS: Record<PlanId, PlanAiConfig> = {
  free: { aiEnabled: false, dailyTokenBudget: 0 },
  starter: { aiEnabled: true, dailyTokenBudget: 10_000 },
  pro: { aiEnabled: true, dailyTokenBudget: 100_000 },
  enterprise: { aiEnabled: true, dailyTokenBudget: -1 },
};

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

interface CacheEntry {
  config: PlanAiConfig;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const REDIS_TTL_SECONDS = 48 * 60 * 60; // 48h — covers UTC day boundary drift

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export class TenantBudgetService {
  private planCache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: Pick<PrismaClient, 'tenant'> | null,
    private readonly redis: Redis | null,
    private readonly globalDailyBudgetUsd: number,
    private readonly logger: pino.Logger,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async resolvePlanConfig(tenantId: string): Promise<PlanAiConfig | null> {
    const cached = this.planCache.get(tenantId);
    if (cached && this.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.config;
    }

    if (!this.prisma) return null;
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
      if (!tenant) return null;
      const config = PLAN_AI_DEFAULTS[tenant.plan as PlanId] ?? null;
      if (config) this.planCache.set(tenantId, { config, fetchedAt: this.now() });
      return config;
    } catch (err) {
      this.logger.warn({ error: (err as Error).message, tenantId }, 'Tenant plan lookup failed — falling back to global budget');
      return null;
    }
  }

  /** Check whether Haiku may run for this tenant right now. Fails closed on Redis errors. */
  async checkBudget(tenantId: string): Promise<BudgetCheckResult> {
    const planConfig = await this.resolvePlanConfig(tenantId);

    if (planConfig && !planConfig.aiEnabled) {
      return { allowed: false, reason: 'plan-ai-disabled' };
    }

    // Unlimited token budget (enterprise, or unknown plan) still respects the global USD cap.
    if (this.globalDailyBudgetUsd <= 0 && (!planConfig || planConfig.dailyTokenBudget < 0)) {
      return { allowed: true };
    }

    if (!this.redis) return { allowed: true };

    try {
      const dateKey = todayUtcKey();
      const [tokensRaw, usdRaw] = await Promise.all([
        this.redis.get(`enrichment:budget:${tenantId}:${dateKey}:tokens`),
        this.redis.get(`enrichment:budget:${tenantId}:${dateKey}:usd`),
      ]);
      const tokensUsed = Number(tokensRaw ?? 0);
      const usdUsed = Number(usdRaw ?? 0);

      if (planConfig && planConfig.dailyTokenBudget >= 0 && tokensUsed >= planConfig.dailyTokenBudget) {
        return { allowed: false, reason: 'plan-token-budget-exceeded' };
      }
      if (this.globalDailyBudgetUsd > 0 && usdUsed >= this.globalDailyBudgetUsd) {
        return { allowed: false, reason: 'global-usd-budget-exceeded' };
      }
      return { allowed: true };
    } catch (err) {
      this.logger.warn({ error: (err as Error).message, tenantId }, 'Redis budget check failed — failing closed (skipping Haiku)');
      return { allowed: false, reason: 'redis-error' };
    }
  }

  /**
   * Record actual token/USD usage after a Haiku call.
   * ponytail: check-then-increment — concurrent workers can overshoot by up to
   * TI_ENRICHMENT_CONCURRENCY calls; use a Lua reserve script if exactness matters.
   */
  async recordUsage(tenantId: string, tokens: number, costUsd: number): Promise<void> {
    if (!this.redis) return;
    try {
      const dateKey = todayUtcKey();
      const tokenKey = `enrichment:budget:${tenantId}:${dateKey}:tokens`;
      const usdKey = `enrichment:budget:${tenantId}:${dateKey}:usd`;
      // Sequential awaits (not Promise.all) — keeps every rejection inside this try/catch,
      // including a synchronous "not a function" from a partial test/mock redis client.
      await this.redis.incrby(tokenKey, Math.round(tokens));
      await this.redis.expire(tokenKey, REDIS_TTL_SECONDS);
      await this.redis.incrbyfloat(usdKey, costUsd);
      await this.redis.expire(usdKey, REDIS_TTL_SECONDS);
    } catch (err) {
      this.logger.warn({ error: (err as Error).message, tenantId }, 'Failed to record tenant AI budget usage — continuing');
    }
  }
}
