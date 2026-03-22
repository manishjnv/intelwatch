/**
 * Haiku Triage Provider — Lightweight IOC classification via Claude Haiku.
 * Part of Differentiator A: AI cost transparency.
 *
 * Uses sanitizeLLMInput from @etip/shared-enrichment for prompt injection defense.
 * Returns null on any error (graceful degradation — pipeline continues without AI).
 */

import Anthropic from '@anthropic-ai/sdk';
import type pino from 'pino';
import { sanitizeLLMInput } from '@etip/shared-enrichment';
import type { VTResult, AbuseIPDBResult, HaikuTriageResult } from '../schema.js';

const SYSTEM_PROMPT = `You are a threat intelligence IOC classifier. Given an IOC and its external analysis results, provide a threat assessment.

Return ONLY valid JSON with no additional text:
{"risk_score": 0-100, "confidence": 0-100, "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO", "threat_category": "string", "reasoning": "string (max 500 chars)", "tags": ["string"]}

Rules:
- risk_score: composite threat risk (0 = benign, 100 = active threat)
- confidence: how certain you are in your assessment
- severity: CRITICAL (active exploitation), HIGH (known malicious), MEDIUM (suspicious), LOW (potentially unwanted), INFO (clean/benign)
- threat_category: one of c2_server, malware_distribution, phishing, cryptomining, apt_infrastructure, scanning, botnet, tor_exit, vpn_proxy, cdn, benign, unknown
- reasoning: concise human-readable justification citing specific evidence
- tags: relevant labels (e.g. actor names, malware families)`;

/** Pricing per 1M tokens — matches ingestion CostTracker */
const HAIKU_PRICING = { input: 0.25, output: 1.25 };

export class HaikuTriageProvider {
  private readonly client: Anthropic | null;

  constructor(
    private readonly apiKey: string,
    private readonly aiEnabled: boolean,
    private readonly logger: pino.Logger,
    private readonly model: string = 'claude-haiku-4-5-20251001',
  ) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /** True only when API key is configured AND AI is enabled */
  isEnabled(): boolean {
    return Boolean(this.apiKey) && this.aiEnabled;
  }

  /** Haiku can classify any IOC type */
  supports(_iocType: string): boolean {
    return true;
  }

  /** Classify an IOC via Haiku. Returns null when disabled or on any error. */
  async triage(
    iocType: string, normalizedValue: string,
    vtResult: VTResult | null, abuseResult: AbuseIPDBResult | null,
    confidence: number,
  ): Promise<HaikuTriageResult | null> {
    if (!this.isEnabled() || !this.client) return null;

    const startMs = Date.now();

    try {
      const userMessage = this.buildUserMessage(iocType, normalizedValue, vtResult, abuseResult, confidence);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      const durationMs = Date.now() - startMs;
      const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = this.parseResponse(rawText);

      if (!parsed) return null;

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const costUsd = this.calculateCost(inputTokens, outputTokens);

      return {
        riskScore: Math.min(100, Math.max(0, parsed.risk_score)),
        confidence: Math.min(100, Math.max(0, parsed.confidence)),
        severity: parsed.severity,
        threatCategory: parsed.threat_category ?? 'unknown',
        reasoning: (parsed.reasoning ?? '').slice(0, 500),
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        inputTokens,
        outputTokens,
        costUsd,
        durationMs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn({ error: msg, iocType, normalizedValue }, 'Haiku triage failed — continuing without AI');
      return null;
    }
  }

  private buildUserMessage(
    iocType: string, normalizedValue: string,
    vtResult: VTResult | null, abuseResult: AbuseIPDBResult | null,
    confidence: number,
  ): string {
    const sanitized = sanitizeLLMInput(normalizedValue);
    const parts: string[] = [
      `IOC Type: ${iocType}`,
      `Value: ${sanitized.sanitized}`,
      `Current confidence: ${confidence}/100`,
    ];

    if (vtResult) {
      parts.push(`\nVirusTotal: ${vtResult.malicious}/${vtResult.totalEngines} engines flagged malicious (detection rate: ${vtResult.detectionRate}%)${vtResult.tags.length > 0 ? `, tags: ${vtResult.tags.join(', ')}` : ''}`);
    }

    if (abuseResult) {
      parts.push(`\nAbuseIPDB: confidence ${abuseResult.abuseConfidenceScore}/100, ${abuseResult.totalReports} reports from ${abuseResult.numDistinctUsers} users, ISP: ${abuseResult.isp}, country: ${abuseResult.countryCode}${abuseResult.isTor ? ' (Tor exit node)' : ''}`);
    }

    if (!vtResult && !abuseResult) {
      parts.push('\nNo external reputation data available. Classify based on IOC characteristics only.');
    }

    return parts.join('\n');
  }

  private parseResponse(text: string): Record<string, unknown> | null {
    try {
      // Strip markdown code fences
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      return JSON.parse(cleaned);
    } catch {
      this.logger.warn({ text: text.slice(0, 200) }, 'Failed to parse Haiku triage response as JSON');
      return null;
    }
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * HAIKU_PRICING.input;
    const outputCost = (outputTokens / 1_000_000) * HAIKU_PRICING.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }
}
