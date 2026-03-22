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

const SYSTEM_PROMPT = `You are a threat intelligence IOC classifier. Given an IOC and its external analysis results, provide a structured threat assessment.

Return ONLY valid JSON with no additional text:
{
  "risk_score": 0-100,
  "confidence": 0-100,
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
  "threat_category": "string",
  "reasoning": "string (max 500 chars)",
  "tags": ["string"],
  "score_justification": "string explaining why this score, citing data points (max 500 chars)",
  "evidence_sources": [{"provider": "string", "data_point": "string", "interpretation": "string"}],
  "uncertainty_factors": ["string describing what could change this assessment"],
  "mitre_techniques": [{"technique_id": "T1234 or T1234.567", "name": "technique name", "tactic": "tactic name"}],
  "is_false_positive": false,
  "false_positive_reason": "string or null — reason if suspected FP",
  "malware_families": ["string — known malware families detected"],
  "attributed_actors": ["string — threat actor names/groups"],
  "recommended_actions": [{"action": "string", "priority": "immediate|short_term|long_term"}]
}

Rules:
- risk_score: composite threat risk (0 = benign, 100 = active threat)
- confidence: how certain you are in your assessment
- severity: CRITICAL (active exploitation), HIGH (known malicious), MEDIUM (suspicious), LOW (potentially unwanted), INFO (clean/benign)
- threat_category: one of c2_server, malware_distribution, phishing, cryptomining, apt_infrastructure, scanning, botnet, tor_exit, vpn_proxy, cdn, benign, unknown
- reasoning: concise human-readable justification citing specific evidence
- tags: relevant labels
- score_justification: explain WHY you assigned this score, citing specific data points from VT/AbuseIPDB
- evidence_sources: list each data point that influenced your assessment with provider name and interpretation
- uncertainty_factors: what information is missing or uncertain that could change the assessment
- mitre_techniques: map IOC behavior to MITRE ATT&CK techniques (e.g. C2 IP → T1071.001, phishing domain → T1566.002). Use valid technique IDs only.
- is_false_positive: set true if IOC matches known FP patterns: CDN IPs (Cloudflare, Akamai, Fastly), shared hosting, sinkholed domains, security researcher infrastructure, Google/Microsoft/Amazon IPs
- false_positive_reason: explain why this is a suspected false positive (null if not FP)
- malware_families: extract known malware families (e.g. Emotet, Cobalt Strike, QakBot) from VT tags or behavioral analysis
- attributed_actors: extract threat actor names (e.g. APT28, Lazarus, FIN7) from evidence
- recommended_actions: 1-5 actionable steps for SOC analysts. Priority: immediate (block now), short_term (investigate), long_term (monitor). Tailor to IOC type.`;

/** Pricing per 1M tokens — matches ingestion CostTracker */
const HAIKU_PRICING = { input: 0.25, output: 1.25 };

/** MITRE ATT&CK technique ID regex: T1234 or T1234.567 */
const MITRE_REGEX = /^T\d{4}(\.\d{3})?$/;

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
        max_tokens: 512,
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

      // #3 FP: override severity to INFO when false positive detected
      const isFP = parsed.is_false_positive === true;
      const severity = isFP ? 'INFO' as const : this.parseSeverity(parsed.severity);

      return {
        riskScore: Math.min(100, Math.max(0, Number(parsed.risk_score) || 0)),
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
        severity,
        threatCategory: String(parsed.threat_category ?? 'unknown').slice(0, 50),
        reasoning: String(parsed.reasoning ?? '').slice(0, 500),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
        inputTokens,
        outputTokens,
        costUsd,
        durationMs,
        // #1 Structured Evidence Chain
        scoreJustification: String(parsed.score_justification ?? '').slice(0, 500),
        evidenceSources: this.parseEvidenceSources(parsed.evidence_sources),
        uncertaintyFactors: this.parseStringArray(parsed.uncertainty_factors, 200),
        // #2 MITRE ATT&CK
        mitreTechniques: this.parseMitreTechniques(parsed.mitre_techniques),
        // #3 False Positive Detection
        isFalsePositive: isFP,
        falsePositiveReason: isFP ? String(parsed.false_positive_reason ?? '').slice(0, 300) || null : null,
        // #7 Malware Family + Threat Actor Extraction
        malwareFamilies: this.parseStringArray(parsed.malware_families, 100),
        attributedActors: this.parseStringArray(parsed.attributed_actors, 100),
        // #8 Recommended Actions
        recommendedActions: this.parseRecommendedActions(parsed.recommended_actions),
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

  private parseSeverity(raw: unknown): HaikuTriageResult['severity'] {
    const valid = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
    const s = String(raw ?? '').toUpperCase();
    return valid.includes(s as typeof valid[number]) ? (s as typeof valid[number]) : 'MEDIUM';
  }

  private parseStringArray(raw: unknown, maxLen: number): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === 'string' && v.length > 0).map(s => s.slice(0, maxLen));
  }

  private parseEvidenceSources(raw: unknown): HaikuTriageResult['evidenceSources'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
      .map(v => ({
        provider: String(v.provider ?? '').slice(0, 50),
        dataPoint: String(v.data_point ?? '').slice(0, 200),
        interpretation: String(v.interpretation ?? '').slice(0, 200),
      }))
      .slice(0, 10);
  }

  private parseMitreTechniques(raw: unknown): HaikuTriageResult['mitreTechniques'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
      .filter(v => MITRE_REGEX.test(String(v.technique_id ?? '')))
      .map(v => ({
        techniqueId: String(v.technique_id),
        name: String(v.name ?? '').slice(0, 100),
        tactic: String(v.tactic ?? '').slice(0, 50),
      }))
      .slice(0, 10);
  }

  private parseRecommendedActions(raw: unknown): HaikuTriageResult['recommendedActions'] {
    const validPriorities = ['immediate', 'short_term', 'long_term'] as const;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
      .map(v => {
        const p = String(v.priority ?? 'short_term');
        return {
          action: String(v.action ?? '').slice(0, 200),
          priority: validPriorities.includes(p as typeof validPriorities[number])
            ? (p as typeof validPriorities[number])
            : 'short_term' as const,
        };
      })
      .filter(a => a.action.length > 0)
      .slice(0, 5);
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * HAIKU_PRICING.input;
    const outputCost = (outputTokens / 1_000_000) * HAIKU_PRICING.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }
}
