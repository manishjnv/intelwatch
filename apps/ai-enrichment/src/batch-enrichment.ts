/**
 * Batch Enrichment Service (#13) — Anthropic Batch API for 50% cost reduction.
 * Submits 10+ IOCs as a single batch request, polls for completion.
 * Gated by TI_BATCH_ENABLED env var.
 */

import type pino from 'pino';
import { AppError } from '@etip/shared-utils';
import { sanitizeLLMInput } from '@etip/shared-enrichment';
import type { EnrichmentCostTracker } from './cost-tracker.js';
import type { VTResult, AbuseIPDBResult } from './schema.js';

/** Anthropic client type — uses any to avoid SDK batch type issues */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicClient = any;

/** Single item for batch enrichment */
export interface BatchItem {
  customId: string;
  iocType: string;
  normalizedValue: string;
  vtResult: VTResult | null;
  abuseResult: AbuseIPDBResult | null;
  confidence: number;
}

/** Batch submission status */
export interface BatchSubmission {
  batchId: string;
  itemCount: number;
  submittedAt: string;
  status: 'submitted' | 'processing' | 'ended' | 'failed';
}

/** Single batch result entry */
export interface BatchResultEntry {
  customId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

const BATCH_SYSTEM_PROMPT = `You are a threat intelligence IOC classifier. Return ONLY valid JSON:
{"risk_score":0-100,"confidence":0-100,"severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","threat_category":"string","reasoning":"string","tags":[],"stix_labels":[],"is_false_positive":false,"false_positive_reason":null}`;

/** Batch enrichment via Anthropic Batch API */
export class BatchEnrichmentService {
  constructor(
    private readonly client: AnthropicClient | null,
    private readonly model: string,
    private readonly costTracker: EnrichmentCostTracker,
    private readonly logger: pino.Logger,
    private readonly minBatchSize: number = 10,
  ) {}

  /** Whether batch API is available */
  isEnabled(): boolean {
    return this.client !== null;
  }

  /** Submit a batch of IOCs to the Anthropic Batch API */
  async submitBatch(items: BatchItem[], tenantId: string): Promise<BatchSubmission> {
    if (!this.client) {
      throw new AppError(503, 'Batch enrichment not enabled', 'BATCH_NOT_ENABLED');
    }
    if (items.length < this.minBatchSize) {
      throw new AppError(400,
        `Batch requires minimum ${this.minBatchSize} items, got ${items.length}`,
        'BATCH_TOO_SMALL');
    }

    const requests = items.map((item) => ({
      custom_id: item.customId,
      params: {
        model: this.model,
        max_tokens: 512,
        system: BATCH_SYSTEM_PROMPT,
        messages: [{ role: 'user' as const, content: this.buildPrompt(item) }],
      },
    }));

    const batch = await this.client.batches.create({ requests });

    this.logger.info(
      { batchId: batch.id, itemCount: items.length, tenantId },
      'Batch submitted to Anthropic',
    );

    return {
      batchId: batch.id,
      itemCount: items.length,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
    };
  }

  /** Check status of a submitted batch */
  async checkStatus(batchId: string): Promise<BatchSubmission> {
    if (!this.client) {
      throw new AppError(503, 'Batch enrichment not enabled', 'BATCH_NOT_ENABLED');
    }

    const batch = await this.client.batches.retrieve(batchId);
    const status = batch.processing_status === 'ended' ? 'ended'
      : batch.processing_status === 'in_progress' ? 'processing'
        : 'submitted';

    return {
      batchId: batch.id,
      itemCount: batch.request_counts?.total ?? 0,
      submittedAt: batch.created_at ?? new Date().toISOString(),
      status,
    };
  }

  /** Process results from a completed batch */
  async processResults(batchId: string): Promise<BatchResultEntry[]> {
    if (!this.client) {
      throw new AppError(503, 'Batch enrichment not enabled', 'BATCH_NOT_ENABLED');
    }

    const results: BatchResultEntry[] = [];
    const stream = await this.client.batches.results(batchId);

    for await (const entry of stream) {
      if (entry.result?.type === 'succeeded') {
        const msg = entry.result.message;
        const text = msg?.content?.[0]?.type === 'text' ? msg.content[0].text : '';
        try {
          const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          results.push({ customId: entry.custom_id, success: true, result: parsed });

          // Track batch cost — Haiku pricing (50% discount handled externally)
          const tokens = msg?.usage ?? { input_tokens: 0, output_tokens: 0 };
          this.costTracker.trackProvider(
            entry.custom_id, 'batch', 'haiku_triage',
            tokens.input_tokens, tokens.output_tokens, 'haiku', 0,
          );
        } catch {
          results.push({ customId: entry.custom_id, success: false, error: 'JSON parse error' });
        }
      } else {
        results.push({
          customId: entry.custom_id,
          success: false,
          error: entry.result?.type ?? 'unknown_error',
        });
      }
    }

    this.logger.info(
      { batchId, total: results.length, succeeded: results.filter(r => r.success).length },
      'Batch results processed',
    );
    return results;
  }

  /** Build user prompt for a single batch item */
  private buildPrompt(item: BatchItem): string {
    const sanitized = sanitizeLLMInput(item.normalizedValue);
    const parts: string[] = [
      `IOC Type: ${item.iocType}`,
      `Value: ${sanitized.sanitized}`,
      `Confidence: ${item.confidence}/100`,
    ];

    if (item.vtResult) {
      parts.push(`VirusTotal: ${item.vtResult.malicious}/${item.vtResult.totalEngines} malicious (${item.vtResult.detectionRate}%)`);
    }
    if (item.abuseResult) {
      parts.push(`AbuseIPDB: confidence ${item.abuseResult.abuseConfidenceScore}/100, ${item.abuseResult.totalReports} reports`);
    }

    return parts.join('\n');
  }
}
