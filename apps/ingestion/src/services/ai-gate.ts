/**
 * AI Gate — Runtime control for AI usage without container restart.
 *
 * Checks tenant.settings.aiEnabled (DB) before making LLM calls.
 * Falls back to TI_AI_ENABLED env var if DB check fails.
 *
 * Admin can toggle AI per-tenant via:
 *   UPDATE tenants SET settings = jsonb_set(settings, '{aiEnabled}', 'false') WHERE id = '...';
 * Or future admin API: PUT /api/v1/admin/tenants/:id/settings { aiEnabled: false }
 *
 * Also enforces:
 *   - Per-tenant daily budget (aiCreditsUsed vs aiCreditsMonthly)
 *   - Global env-level master switch (TI_AI_ENABLED)
 */
import type { PrismaClient } from '@prisma/client';
import type pino from 'pino';

export interface AIGateResult {
  allowed: boolean;
  reason: string;
  mode: 'haiku' | 'sonnet' | 'disabled';
}

interface TenantSettings {
  aiEnabled?: boolean;
  aiTriageModel?: string;
  aiExtractionModel?: string;
  aiDailyBudgetUsd?: number;
}

/** Cache tenant AI settings for 60s to avoid DB hit per article */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { settings: TenantSettings; fetchedAt: number }>();

export class AIGate {
  constructor(
    private readonly db: PrismaClient,
    private readonly envAiEnabled: boolean,
    private readonly logger?: pino.Logger,
  ) {}

  /**
   * Check if AI calls are allowed for this tenant right now.
   * Priority: env master switch → DB tenant settings → budget check
   */
  async check(tenantId: string, stage: 'triage' | 'extraction'): Promise<AIGateResult> {
    // 1. Global env master switch
    if (!this.envAiEnabled) {
      return { allowed: false, reason: 'TI_AI_ENABLED=false (global switch off)', mode: 'disabled' };
    }

    // 2. Per-tenant DB settings (cached 60s)
    const settings = await this.getTenantSettings(tenantId);
    if (settings.aiEnabled === false) {
      return { allowed: false, reason: 'tenant.settings.aiEnabled=false (admin disabled)', mode: 'disabled' };
    }

    // 3. Budget check
    const budgetOk = await this.checkBudget(tenantId, settings);
    if (!budgetOk) {
      return { allowed: false, reason: 'tenant AI budget exhausted for this month', mode: 'disabled' };
    }

    return {
      allowed: true,
      reason: 'ok',
      mode: stage === 'triage' ? 'haiku' : 'sonnet',
    };
  }

  /** Increment AI credits used for a tenant */
  async recordUsage(tenantId: string, costUsd: number): Promise<void> {
    // Convert USD to credits (1 credit = $0.01)
    const credits = Math.ceil(costUsd * 100);
    if (credits <= 0) return;

    try {
      await this.db.tenant.update({
        where: { id: tenantId },
        data: { aiCreditsUsed: { increment: credits } },
      });
    } catch (err) {
      this.logger?.warn({ tenantId, credits, error: (err as Error).message }, 'Failed to record AI usage');
    }
  }

  private async getTenantSettings(tenantId: string): Promise<TenantSettings> {
    const cached = cache.get(tenantId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.settings;
    }

    try {
      const tenant = await this.db.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true, aiCreditsMonthly: true, aiCreditsUsed: true },
      });

      const raw = (tenant?.settings ?? {}) as Record<string, unknown>;
      const settings: TenantSettings = {
        aiEnabled: typeof raw.aiEnabled === 'boolean' ? raw.aiEnabled : undefined,
        aiTriageModel: typeof raw.aiTriageModel === 'string' ? raw.aiTriageModel : undefined,
        aiExtractionModel: typeof raw.aiExtractionModel === 'string' ? raw.aiExtractionModel : undefined,
        aiDailyBudgetUsd: typeof raw.aiDailyBudgetUsd === 'number' ? raw.aiDailyBudgetUsd : undefined,
      };

      cache.set(tenantId, { settings, fetchedAt: Date.now() });
      return settings;
    } catch (err) {
      this.logger?.warn({ tenantId, error: (err as Error).message }, 'Failed to fetch tenant AI settings — using env defaults');
      return {};
    }
  }

  private async checkBudget(tenantId: string, _settings: TenantSettings): Promise<boolean> {
    try {
      const tenant = await this.db.tenant.findUnique({
        where: { id: tenantId },
        select: { aiCreditsMonthly: true, aiCreditsUsed: true },
      });
      if (!tenant) return false;
      return tenant.aiCreditsUsed < tenant.aiCreditsMonthly;
    } catch {
      return true; // Allow on DB error — fail open
    }
  }

  /** Clear cache (for testing) */
  clearCache(): void {
    cache.clear();
  }
}
