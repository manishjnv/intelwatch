/**
 * #11 — AI-Assisted Pattern Detection
 * Uses Claude Sonnet to analyze entity clusters for hidden relationships
 * that rule-based correlation misses. Structured reasoning output with
 * chain-of-thought explanation. Budget-gated with daily USD limit.
 */
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type pino from 'pino';
import type {
  CorrelatedIOC, CorrelationResult, CampaignCluster,
  AIPatternDetection, AIAnalysisResult,
} from '../schemas/correlation.js';

// Sonnet pricing per 1M tokens (May 2025)
const SONNET_PRICING = { input: 3.00, output: 15.00 };

const SYSTEM_PROMPT = `You are an expert threat intelligence correlation analyst. You analyze clusters of Indicators of Compromise (IOCs) to discover hidden relationships that automated rule-based systems miss.

Given a set of IOCs with their attributes (type, value, ASN, CIDR, MITRE ATT&CK techniques, malware families, threat actors, source feeds, timestamps), plus any existing correlation results and campaign clusters:

1. Identify non-obvious patterns: shared infrastructure across different campaigns, TTP evolution chains, actor attribution signals, temporal coordination patterns.
2. For each pattern found, explain your reasoning step-by-step.
3. Assign a confidence score (0.0-1.0) based on evidence strength.
4. Suggest the most appropriate relationship type.

Return ONLY a valid JSON array (no markdown fences, no explanation outside JSON):
[{
  "pattern_description": "Human-readable description of the discovered pattern",
  "involved_entity_ids": ["id1", "id2"],
  "confidence": 0.85,
  "reasoning_steps": ["Step 1: observation", "Step 2: inference", "Step 3: conclusion"],
  "suggested_relationship_type": "INDICATES|HOSTED_ON|OBSERVED_IN|RESOLVES_TO"
}]

If no patterns are found, return an empty array: []`;

export class AIPatternDetectionService {
  private readonly client: Anthropic | null;
  private dailySpend = 0;
  private dailyResetAt: Date;

  constructor(
    private readonly apiKey: string,
    private readonly aiEnabled: boolean,
    private readonly logger: pino.Logger,
    private readonly model: string = 'claude-sonnet-4-20250514',
    private readonly maxTokens: number = 1024,
    private readonly dailyBudgetUsd: number = 5.0,
  ) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    this.dailyResetAt = this.nextMidnight();
  }

  /** True only when API key is configured AND AI is enabled. */
  isEnabled(): boolean {
    return Boolean(this.apiKey) && this.aiEnabled && this.client !== null;
  }

  /** Check if within daily budget. Resets at midnight UTC. */
  isWithinBudget(): boolean {
    this.resetDailyBudgetIfNeeded();
    return this.dailySpend < this.dailyBudgetUsd;
  }

  /** Get current spend stats. */
  getSpendStats(): { dailySpend: number; dailyBudget: number; percentUsed: number } {
    this.resetDailyBudgetIfNeeded();
    return {
      dailySpend: Math.round(this.dailySpend * 1_000_000) / 1_000_000,
      dailyBudget: this.dailyBudgetUsd,
      percentUsed: this.dailyBudgetUsd > 0
        ? Math.round((this.dailySpend / this.dailyBudgetUsd) * 10000) / 100
        : 0,
    };
  }

  /** Analyze entity clusters for hidden patterns using Claude Sonnet. */
  async analyze(
    iocs: CorrelatedIOC[],
    existingResults: CorrelationResult[],
    campaigns: CampaignCluster[],
  ): Promise<AIAnalysisResult | null> {
    if (!this.isEnabled() || !this.client) return null;
    if (!this.isWithinBudget()) {
      this.logger.warn('AI correlation budget exceeded, skipping analysis');
      return null;
    }
    if (iocs.length === 0) return null;

    const startMs = Date.now();

    try {
      const userMessage = this.buildUserMessage(iocs, existingResults, campaigns);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userMessage }],
      });

      const durationMs = Date.now() - startMs;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usage = response.usage as any;
      const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0);
      const cacheCreationTokens = Number(usage.cache_creation_input_tokens ?? 0);
      const costUsd = this.calculateCostWithCache(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

      this.dailySpend += costUsd;

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const patterns = this.parseResponse(text);

      return {
        patterns,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
        durationMs,
      };
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, 'AI pattern detection failed');
      return null;
    }
  }

  // ── Private ────────────────────────────────────────────────────

  private buildUserMessage(
    iocs: CorrelatedIOC[],
    existingResults: CorrelationResult[],
    campaigns: CampaignCluster[],
  ): string {
    const iocSummary = iocs.slice(0, 50).map((ioc) => ({
      id: ioc.id, type: ioc.iocType, value: ioc.normalizedValue,
      asn: ioc.asn, cidr: ioc.cidrPrefix, techniques: ioc.mitreAttack,
      malware: ioc.malwareFamilies, actors: ioc.threatActors,
      feeds: ioc.sourceFeedIds.length, confidence: ioc.confidence,
      firstSeen: ioc.firstSeen, lastSeen: ioc.lastSeen,
    }));

    const resultSummary = existingResults.slice(0, 20).map((r) => ({
      type: r.correlationType, confidence: r.confidence,
      entityCount: r.entities.length, severity: r.severity,
    }));

    const campaignSummary = campaigns.slice(0, 10).map((c) => ({
      name: c.name, entityCount: c.entityIds.length,
      avgConfidence: c.avgConfidence, maxSeverity: c.maxSeverity,
    }));

    return `Analyze these IOC clusters for hidden relationships:

IOCs (${iocs.length} total, showing up to 50):
${JSON.stringify(iocSummary, null, 2)}

Existing Correlations (${existingResults.length} total):
${JSON.stringify(resultSummary, null, 2)}

Campaign Clusters (${campaigns.length} total):
${JSON.stringify(campaignSummary, null, 2)}

Find patterns that rule-based correlation missed. Focus on:
- Cross-campaign infrastructure reuse
- TTP evolution or similarity chains
- Temporal coordination signals
- Actor attribution from combined indicators`;
  }

  private parseResponse(text: string): AIPatternDetection[] {
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: Record<string, unknown>) => ({
        id: randomUUID(),
        patternDescription: String(item.pattern_description ?? ''),
        involvedEntityIds: Array.isArray(item.involved_entity_ids) ? item.involved_entity_ids.map(String) : [],
        confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.5,
        reasoningSteps: Array.isArray(item.reasoning_steps) ? item.reasoning_steps.map(String) : [],
        suggestedRelationshipType: String(item.suggested_relationship_type ?? 'INDICATES'),
        detectedAt: new Date().toISOString(),
      }));
    } catch {
      this.logger.warn('Failed to parse AI response as JSON');
      return [];
    }
  }

  /** Calculate cost with cache-aware pricing (same formula as haiku-triage). */
  private calculateCostWithCache(
    inputTokens: number, outputTokens: number,
    cacheReadTokens: number, cacheCreationTokens: number,
  ): number {
    const regularInput = inputTokens - cacheReadTokens - cacheCreationTokens;
    const regularCost = (Math.max(0, regularInput) / 1_000_000) * SONNET_PRICING.input;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * SONNET_PRICING.input * 0.1;
    const cacheCreateCost = (cacheCreationTokens / 1_000_000) * SONNET_PRICING.input * 1.25;
    const outputCost = (outputTokens / 1_000_000) * SONNET_PRICING.output;
    return regularCost + cacheReadCost + cacheCreateCost + outputCost;
  }

  private resetDailyBudgetIfNeeded(): void {
    if (Date.now() >= this.dailyResetAt.getTime()) {
      this.dailySpend = 0;
      this.dailyResetAt = this.nextMidnight();
    }
  }

  private nextMidnight(): Date {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d;
  }
}
