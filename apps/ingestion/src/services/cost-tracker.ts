/**
 * Per-Article Per-Stage Cost Tracker
 * Tracks AI processing costs through the 5-stage pipeline with full transparency.
 * Supports budget alerting per tenant.
 *
 * Differentiator: No TI platform exposes per-article AI cost breakdown.
 * CISOs see exactly what they're paying for — builds trust and enables optimization.
 */

export type PipelineStage = 'triage' | 'extraction' | 'enrichment' | 'dedup_llm' | 'external_api';
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface StageRecord {
  stage: PipelineStage;
  model: ModelTier;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: Date;
}

export interface ArticleCost {
  articleId: string;
  stages: StageRecord[];
  totalTokens: number;
  totalCostUsd: number;
  externalApiCalls: number;
}

export interface BudgetAlert {
  tenantId: string;
  currentSpendUsd: number;
  dailyLimitUsd: number;
  percentUsed: number;
  isOverBudget: boolean;
}

// Pricing per 1M tokens (input / output) as of 2026
const MODEL_PRICING: Record<ModelTier, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.00, output: 15.00 },
  opus: { input: 15.00, output: 75.00 },
};

/** Prisma-compatible writer for ai_processing_costs table (fire-and-forget) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaLike = { aiProcessingCost?: { create: (args: any) => Promise<any> }; [key: string]: any };

export class CostTracker {
  private articleCosts: Map<string, StageRecord[]> = new Map();
  private tenantSpend: Map<string, { costUsd: number; resetAt: Date }> = new Map();
  private prisma: PrismaLike | null = null;

  /** Attach a Prisma client for dual-write to ai_processing_costs table */
  setPrisma(prisma: PrismaLike): void {
    this.prisma = prisma;
  }

  /** Calculate cost for a single stage */
  calculateStageCost(inputTokens: number, outputTokens: number, model: ModelTier): number {
    const pricing = MODEL_PRICING[model];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
  }

  /** Record a pipeline stage execution (in-memory + Postgres dual-write) */
  trackStage(
    articleId: string, stage: PipelineStage,
    inputTokens: number, outputTokens: number, model: ModelTier,
  ): StageRecord {
    const costUsd = this.calculateStageCost(inputTokens, outputTokens, model);
    const record: StageRecord = {
      stage, model, inputTokens, outputTokens, costUsd, timestamp: new Date(),
    };

    if (!this.articleCosts.has(articleId)) {
      this.articleCosts.set(articleId, []);
    }
    this.articleCosts.get(articleId)!.push(record);

    // Fire-and-forget Postgres write for Command Center cost analytics
    if (this.prisma?.aiProcessingCost) {
      this.prisma.aiProcessingCost.create({
        data: {
          itemId: articleId,
          itemType: 'article',
          subtask: stage,
          provider: 'anthropic',
          model: model === 'haiku' ? 'claude-haiku-4-5' : model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-opus-4-6',
          inputTokens,
          outputTokens,
          costUsd,
        },
      }).catch(() => { /* non-critical — Redis cache is primary */ });
    }

    return record;
  }

  /** Get full cost breakdown for an article */
  getArticleCost(articleId: string): ArticleCost {
    const stages = this.articleCosts.get(articleId) ?? [];
    let totalTokens = 0;
    let totalCostUsd = 0;
    let externalApiCalls = 0;

    for (const s of stages) {
      totalTokens += s.inputTokens + s.outputTokens;
      totalCostUsd += s.costUsd;
      if (s.stage === 'external_api') externalApiCalls++;
    }

    return {
      articleId, stages, totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      externalApiCalls,
    };
  }

  /** Track spend for a tenant (rolling 24h window) */
  addTenantSpend(tenantId: string, costUsd: number): void {
    const now = new Date();
    let record = this.tenantSpend.get(tenantId);

    if (!record || now.getTime() - record.resetAt.getTime() > 24 * 60 * 60 * 1000) {
      record = { costUsd: 0, resetAt: now };
      this.tenantSpend.set(tenantId, record);
    }

    record.costUsd += costUsd;
  }

  /** Get tenant's 24h spend */
  getTenantSpend(tenantId: string): number {
    const record = this.tenantSpend.get(tenantId);
    if (!record) return 0;

    const now = new Date();
    if (now.getTime() - record.resetAt.getTime() > 24 * 60 * 60 * 1000) {
      return 0; // expired window
    }
    return record.costUsd;
  }

  /** Check if tenant is over budget */
  checkBudgetAlert(tenantId: string, dailyLimitUsd: number): BudgetAlert {
    const currentSpend = this.getTenantSpend(tenantId);
    const percentUsed = dailyLimitUsd > 0 ? (currentSpend / dailyLimitUsd) * 100 : 0;

    return {
      tenantId,
      currentSpendUsd: Math.round(currentSpend * 1_000_000) / 1_000_000,
      dailyLimitUsd,
      percentUsed: Math.round(percentUsed * 100) / 100,
      isOverBudget: currentSpend >= dailyLimitUsd,
    };
  }

  /** Get model pricing info */
  static getPricing(): Record<ModelTier, { input: number; output: number }> {
    return { ...MODEL_PRICING };
  }
}
