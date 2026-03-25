/**
 * Stage 1 CTI Triage with Per-Tenant Feedback Loop
 * Cheap Haiku classification (~$0.001/article) filters ~80% non-CTI content.
 * Analyst feedback (FP/escalation) is stored as few-shot examples,
 * making the triage model increasingly accurate per-tenant over time.
 *
 * Differentiator: No competing TI platform offers per-tenant adaptive triage.
 * Recorded Future/Mandiant use one-size-fits-all classifiers.
 *
 * Dual-mode: calls Claude Haiku when API key is set, falls back to
 * rule-based keyword matching when no key is available (dev/test).
 */
import Anthropic from '@anthropic-ai/sdk';
import { sanitizeLLMInput } from '@etip/shared-enrichment';
import type pino from 'pino';

export type ArticleType = 'threat_report' | 'vulnerability_advisory' | 'news' | 'blog' | 'irrelevant';
export type Priority = 'critical' | 'high' | 'normal' | 'low';
export type AnalystAction = 'confirmed_relevant' | 'false_positive' | 'escalated' | 'downgraded';

export interface RawArticle {
  id: string;
  title: string;
  content: string;
  source: string;
  url?: string;
}

export interface TriageResult {
  isCtiRelevant: boolean;
  confidence: number;        // 0-1
  detectedLanguage: string;
  articleType: ArticleType;
  estimatedIocCount: number;
  priority: Priority;
  triageMode: 'haiku' | 'rule_based';
  inputTokens: number;
  outputTokens: number;
}

export interface FeedbackRecord {
  articleId: string;
  tenantId: string;
  title: string;
  excerpt: string;
  originalResult: TriageResult;
  analystAction: AnalystAction;
  timestamp: Date;
}

export interface TriagePrompt {
  system: string;
  fewShot: string;
  userMessage: string;
}

const SYSTEM_PROMPT = `You are a CTI triage analyst. Classify if this article contains actionable cyber threat intelligence (IOCs, TTPs, threat actors, vulnerabilities, malware, campaigns, exploits).

Return ONLY valid JSON (no markdown, no explanation):
{"is_cti_relevant": boolean, "confidence": number, "detected_language": "en", "article_type": "threat_report|vulnerability_advisory|news|blog|irrelevant", "estimated_ioc_count": number, "priority": "critical|high|normal|low"}

Rules:
- confidence is 0.0-1.0 (how sure you are about is_cti_relevant)
- article_type: threat_report (APT/campaign/malware analysis), vulnerability_advisory (CVE/patch/exploit), news (general security news), blog (opinion/overview), irrelevant (not CTI)
- priority: critical (active exploitation/0-day), high (new threat/campaign), normal (routine advisory), low (background noise)
- estimated_ioc_count: how many IOCs (IPs, hashes, domains, CVEs, emails) you see in the excerpt`;

const DEFAULT_HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_FEEDBACK_PER_TENANT = 50;
const EXCERPT_LENGTH = 300;

const CTI_KEYWORDS = [
  'malware', 'ransomware', 'phishing', 'vulnerability', 'cve-', 'exploit',
  'threat actor', 'apt', 'campaign', 'ioc', 'indicator', 'c2', 'command and control',
  'backdoor', 'trojan', 'botnet', 'zero-day', 'attack', 'breach', 'compromise',
  'ttps', 'mitre', 'att&ck', 'lateral movement', 'exfiltration', 'persistence',
  'cobalt strike', 'beacon', 'implant', 'loader', 'dropper', 'stealer',
];

export class TriageService {
  private feedbackStore: Map<string, FeedbackRecord[]> = new Map();
  private client: Anthropic | null = null;
  private logger: pino.Logger | null = null;
  private model: string = DEFAULT_HAIKU_MODEL;
  private aiEnabled: boolean = false;

  /**
   * Override the active model without reinitializing the Anthropic client.
   * Call before triage() to apply a per-tenant model from the customization service.
   */
  setModel(model: string): void {
    this.model = model;
  }

  /** Initialize with optional API key + logger. If no key or AI disabled, falls back to rule-based. */
  init(apiKey?: string, logger?: pino.Logger, opts?: { aiEnabled?: boolean; model?: string }): void {
    this.logger = logger ?? null;
    this.aiEnabled = opts?.aiEnabled ?? false;
    this.model = opts?.model ?? DEFAULT_HAIKU_MODEL;
    if (apiKey && this.aiEnabled) {
      this.client = new Anthropic({ apiKey });
      this.logger?.info({ model: this.model }, 'Triage: Claude Haiku mode (AI enabled)');
    } else {
      this.client = null;
      this.logger?.info('Triage: Rule-based mode (AI disabled or no API key)');
    }
  }

  /** Whether Haiku mode is active */
  get isHaikuMode(): boolean { return this.client !== null && this.aiEnabled; }

  /**
   * Triage an article — returns classification result.
   * Uses Claude Haiku when API key is set, rule-based fallback otherwise.
   */
  async triage(article: RawArticle, tenantId: string): Promise<TriageResult> {
    if (this.client) {
      return this.triageWithHaiku(article, tenantId);
    }
    return this.triageRuleBased(article);
  }

  /** Claude Haiku triage — ~$0.001/article */
  private async triageWithHaiku(article: RawArticle, tenantId: string): Promise<TriageResult> {
    const prompt = this.buildTriagePrompt(article, tenantId);

    const messages: Anthropic.MessageParam[] = [];
    if (prompt.fewShot) {
      messages.push({ role: 'user', content: `Here are examples of previous triage decisions:\n${prompt.fewShot}` });
      messages.push({ role: 'assistant', content: 'Understood. I will use these examples to inform my triage.' });
    }
    messages.push({ role: 'user', content: prompt.userMessage });

    try {
      const response = await this.client!.messages.create({
        model: this.model,
        max_tokens: 256,
        system: prompt.system,
        messages,
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const result = this.parseTriageResponse(text);
      result.triageMode = 'haiku';
      result.inputTokens = response.usage.input_tokens;
      result.outputTokens = response.usage.output_tokens;

      this.logger?.debug(
        { articleTitle: article.title, relevant: result.isCtiRelevant, confidence: result.confidence, tokens: result.inputTokens + result.outputTokens },
        'Haiku triage complete',
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.warn({ error: message, articleTitle: article.title }, 'Haiku triage failed — falling back to rule-based');
      return this.triageRuleBased(article);
    }
  }

  /** Rule-based triage fallback — keyword matching */
  private triageRuleBased(article: RawArticle): TriageResult {
    const content = `${article.title} ${article.content}`.toLowerCase();
    const matchCount = CTI_KEYWORDS.filter((kw) => content.includes(kw)).length;
    const isCtiRelevant = matchCount >= 2;
    const confidence = Math.min(1, matchCount * 0.12);

    const articleType = matchCount >= 4 ? 'threat_report' as const
      : matchCount >= 2 ? 'vulnerability_advisory' as const
      : matchCount >= 1 ? 'news' as const
      : 'irrelevant' as const;

    const priority = matchCount >= 5 ? 'critical' as const
      : matchCount >= 3 ? 'high' as const
      : matchCount >= 2 ? 'normal' as const
      : 'low' as const;

    return {
      isCtiRelevant, confidence, detectedLanguage: 'en',
      articleType, estimatedIocCount: matchCount, priority,
      triageMode: 'rule_based', inputTokens: 0, outputTokens: 0,
    };
  }

  /** Record analyst feedback for an article */
  recordFeedback(
    articleId: string, tenantId: string, title: string,
    excerpt: string, originalResult: TriageResult, action: AnalystAction,
  ): void {
    if (!this.feedbackStore.has(tenantId)) {
      this.feedbackStore.set(tenantId, []);
    }
    const records = this.feedbackStore.get(tenantId)!;
    records.push({
      articleId, tenantId, title,
      excerpt: excerpt.slice(0, EXCERPT_LENGTH),
      originalResult, analystAction: action, timestamp: new Date(),
    });
    if (records.length > MAX_FEEDBACK_PER_TENANT) {
      records.splice(0, records.length - MAX_FEEDBACK_PER_TENANT);
    }
  }

  /** Build few-shot examples from tenant feedback */
  buildFewShotExamples(tenantId: string, limit: number = 5): string {
    const records = this.feedbackStore.get(tenantId);
    if (!records || records.length === 0) return '';
    const fps = records.filter((r) => r.analystAction === 'false_positive').slice(-2);
    const confirmed = records.filter((r) => r.analystAction === 'confirmed_relevant' || r.analystAction === 'escalated').slice(-3);
    const examples = [...fps, ...confirmed].slice(0, limit);
    if (examples.length === 0) return '';
    return examples.map((ex) => {
      const correctLabel = ex.analystAction !== 'false_positive';
      return `Example: Title: "${ex.title}" Excerpt: "${ex.excerpt}" → is_cti_relevant: ${correctLabel}`;
    }).join('\n');
  }

  /** Build full triage prompt with system + few-shot + article */
  buildTriagePrompt(article: RawArticle, tenantId: string): TriagePrompt {
    const { sanitized } = sanitizeLLMInput(article.content);
    const excerpt = sanitized.slice(0, 500);
    const fewShot = this.buildFewShotExamples(tenantId);
    const userMessage = `Title: ${article.title}\nSource: ${article.source}\nExcerpt (500 chars): ${excerpt}`;
    return { system: SYSTEM_PROMPT, fewShot, userMessage };
  }

  /** Parse LLM triage response into typed result */
  parseTriageResponse(rawJson: string): TriageResult {
    // Strip markdown code fences if Claude wraps them
    const cleaned = rawJson.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse triage response as JSON: ${rawJson.slice(0, 200)}`);
    }
    return {
      isCtiRelevant: Boolean(parsed.is_cti_relevant),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      detectedLanguage: String(parsed.detected_language || 'en'),
      articleType: validateArticleType(parsed.article_type),
      estimatedIocCount: Math.max(0, Number(parsed.estimated_ioc_count) || 0),
      priority: validatePriority(parsed.priority),
      triageMode: 'haiku', inputTokens: 0, outputTokens: 0,
    };
  }

  getFeedbackCount(tenantId: string): number { return this.feedbackStore.get(tenantId)?.length ?? 0; }
  clearFeedback(tenantId: string): void { this.feedbackStore.delete(tenantId); }
}

function validateArticleType(value: unknown): ArticleType {
  const valid: ArticleType[] = ['threat_report', 'vulnerability_advisory', 'news', 'blog', 'irrelevant'];
  return valid.includes(value as ArticleType) ? (value as ArticleType) : 'irrelevant';
}

function validatePriority(value: unknown): Priority {
  const valid: Priority[] = ['critical', 'high', 'normal', 'low'];
  return valid.includes(value as Priority) ? (value as Priority) : 'low';
}
