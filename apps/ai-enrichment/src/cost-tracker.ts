/**
 * Per-IOC Per-Provider Cost Tracker
 * Tracks enrichment costs with full provider breakdown for cost transparency.
 * Differentiator A: "301 IOCs enriched for $0.12" — no competitor exposes this.
 *
 * Follows ingestion CostTracker pattern (apps/ingestion/src/services/cost-tracker.ts).
 * In-memory per DECISION-013. State lost on restart — acceptable for Phase 2.
 */

export type EnrichmentProvider = 'virustotal' | 'abuseipdb' | 'haiku_triage' | 'ipinfo';
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface ProviderCostRecord {
  provider: EnrichmentProvider;
  model: ModelTier | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  timestamp: string;
}

export interface IOCCost {
  iocId: string;
  providers: ProviderCostRecord[];
  totalTokens: number;
  totalCostUsd: number;
  providerCount: number;
}

export interface AggregateStats {
  headline: string;
  totalIOCsEnriched: number;
  totalCostUsd: number;
  totalTokens: number;
  byProvider: Record<string, { count: number; costUsd: number; tokens: number }>;
  byIOCType: Record<string, { count: number; costUsd: number }>;
  since: string;
}

export interface BudgetAlert {
  tenantId: string;
  currentSpendUsd: number;
  dailyLimitUsd: number;
  percentUsed: number;
  isOverBudget: boolean;
}

/** Pricing per 1M tokens (input / output) as of 2026 — matches ingestion CostTracker */
const MODEL_PRICING: Record<ModelTier, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.00, output: 15.00 },
  opus: { input: 15.00, output: 75.00 },
};

/** Prisma-compatible writer for ai_processing_costs table (fire-and-forget) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaLike = { aiProcessingCost?: { create: (args: any) => Promise<any> }; [key: string]: any };

export class EnrichmentCostTracker {
  private iocCosts: Map<string, ProviderCostRecord[]> = new Map();
  private iocTypes: Map<string, string> = new Map();
  private tenantSpend: Map<string, { costUsd: number; resetAt: Date }> = new Map();
  private readonly startedAt: Date;
  private prisma: PrismaLike | null = null;

  /** Attach a Prisma client for dual-write to ai_processing_costs table */
  setPrisma(prisma: PrismaLike): void {
    this.prisma = prisma;
  }

  constructor() {
    this.startedAt = new Date();
  }

  /** Calculate cost for AI tokens. Returns 0 for non-AI providers (pass model=null). */
  calculateCost(inputTokens: number, outputTokens: number, model: ModelTier): number {
    const pricing = MODEL_PRICING[model];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }

  /** Record a single provider call for an IOC */
  trackProvider(
    iocId: string, iocType: string, provider: EnrichmentProvider,
    inputTokens: number, outputTokens: number, model: ModelTier | null, durationMs: number,
  ): ProviderCostRecord {
    const costUsd = model ? this.calculateCost(inputTokens, outputTokens, model) : 0;
    const record: ProviderCostRecord = {
      provider, model, inputTokens, outputTokens, costUsd, durationMs,
      timestamp: new Date().toISOString(),
    };

    if (!this.iocCosts.has(iocId)) {
      this.iocCosts.set(iocId, []);
    }
    this.iocCosts.get(iocId)!.push(record);
    this.iocTypes.set(iocId, iocType);

    // Fire-and-forget Postgres write for Command Center cost analytics
    if (this.prisma?.aiProcessingCost && model && costUsd > 0) {
      this.prisma.aiProcessingCost.create({
        data: {
          itemId: iocId,
          itemType: 'ioc',
          subtask: provider === 'haiku_triage' ? 'triage' : provider,
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

  /** Get cost breakdown for a single IOC */
  getIOCCost(iocId: string): IOCCost {
    const providers = this.iocCosts.get(iocId) ?? [];
    let totalTokens = 0;
    let totalCostUsd = 0;

    for (const p of providers) {
      totalTokens += p.inputTokens + p.outputTokens;
      totalCostUsd += p.costUsd;
    }

    return {
      iocId, providers, totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      providerCount: providers.length,
    };
  }

  /** Get aggregate stats — the differentiator headline endpoint data */
  getAggregateStats(): AggregateStats {
    const byProvider: Record<string, { count: number; costUsd: number; tokens: number }> = {};
    const byIOCType: Record<string, { count: number; costUsd: number }> = {};
    let totalTokens = 0;
    let totalCostUsd = 0;

    for (const [iocId, records] of this.iocCosts.entries()) {
      const iocType = this.iocTypes.get(iocId) ?? 'unknown';
      let iocCost = 0;

      for (const r of records) {
        if (!byProvider[r.provider]) {
          byProvider[r.provider] = { count: 0, costUsd: 0, tokens: 0 };
        }
        const bp = byProvider[r.provider]!;
        bp.count++;
        bp.costUsd += r.costUsd;
        bp.tokens += r.inputTokens + r.outputTokens;
        totalTokens += r.inputTokens + r.outputTokens;
        iocCost += r.costUsd;
      }

      if (!byIOCType[iocType]) {
        byIOCType[iocType] = { count: 0, costUsd: 0 };
      }
      byIOCType[iocType].count++;
      byIOCType[iocType].costUsd += iocCost;
      totalCostUsd += iocCost;
    }

    totalCostUsd = Math.round(totalCostUsd * 1_000_000) / 1_000_000;
    const count = this.iocCosts.size;
    const headline = `${count} IOC${count !== 1 ? 's' : ''} enriched for $${totalCostUsd.toFixed(2)}`;

    return { headline, totalIOCsEnriched: count, totalCostUsd, totalTokens, byProvider, byIOCType, since: this.startedAt.toISOString() };
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

    if (Date.now() - record.resetAt.getTime() > 24 * 60 * 60 * 1000) {
      return 0;
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
    return { haiku: { ...MODEL_PRICING.haiku }, sonnet: { ...MODEL_PRICING.sonnet }, opus: { ...MODEL_PRICING.opus } };
  }
}
