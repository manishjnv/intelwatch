/**
 * Stage 1 CTI Triage with Per-Tenant Feedback Loop
 * Cheap Haiku classification (~$0.001/article) filters ~80% non-CTI content.
 * Analyst feedback (FP/escalation) is stored as few-shot examples,
 * making the triage model increasingly accurate per-tenant over time.
 *
 * Differentiator: No competing TI platform offers per-tenant adaptive triage.
 * Recorded Future/Mandiant use one-size-fits-all classifiers.
 */
import { sanitizeLLMInput } from '@etip/shared-enrichment';

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

const SYSTEM_PROMPT = `You are a CTI triage analyst. Classify if this article contains actionable threat intelligence (IOCs, TTPs, threat actors, vulnerabilities). Return JSON only:
{"is_cti_relevant": boolean, "confidence": number, "detected_language": string, "article_type": string, "estimated_ioc_count": number, "priority": string}`;

const MAX_FEEDBACK_PER_TENANT = 50;
const EXCERPT_LENGTH = 300;

export class TriageService {
  private feedbackStore: Map<string, FeedbackRecord[]> = new Map();

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
      originalResult, analystAction: action,
      timestamp: new Date(),
    });

    // Keep only most recent feedback per tenant
    if (records.length > MAX_FEEDBACK_PER_TENANT) {
      records.splice(0, records.length - MAX_FEEDBACK_PER_TENANT);
    }
  }

  /** Build few-shot examples from tenant feedback */
  buildFewShotExamples(tenantId: string, limit: number = 5): string {
    const records = this.feedbackStore.get(tenantId);
    if (!records || records.length === 0) return '';

    // Select diverse examples: mix of FP and confirmed
    const fps = records.filter((r) => r.analystAction === 'false_positive').slice(-2);
    const confirmed = records.filter((r) => r.analystAction === 'confirmed_relevant' || r.analystAction === 'escalated').slice(-3);
    const examples = [...fps, ...confirmed].slice(0, limit);

    if (examples.length === 0) return '';

    return examples.map((ex) => {
      const correctLabel = ex.analystAction === 'false_positive' ? false : true;
      return `Example: Title: "${ex.title}" Excerpt: "${ex.excerpt}" → is_cti_relevant: ${correctLabel}`;
    }).join('\n');
  }

  /** Build full triage prompt with system + few-shot + article */
  buildTriagePrompt(article: RawArticle, tenantId: string): TriagePrompt {
    const { sanitized } = sanitizeLLMInput(article.content);
    const excerpt = sanitized.slice(0, 500);
    const fewShot = this.buildFewShotExamples(tenantId);

    const userMessage = `Title: ${article.title}\nSource: ${article.source}\nExcerpt (500 chars): ${excerpt}`;

    return {
      system: SYSTEM_PROMPT,
      fewShot,
      userMessage,
    };
  }

  /** Parse LLM triage response into typed result */
  parseTriageResponse(rawJson: string): TriageResult {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse triage response as JSON: ${rawJson.slice(0, 100)}`);
    }
    return {
      isCtiRelevant: Boolean(parsed.is_cti_relevant),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      detectedLanguage: String(parsed.detected_language || 'en'),
      articleType: validateArticleType(parsed.article_type),
      estimatedIocCount: Math.max(0, Number(parsed.estimated_ioc_count) || 0),
      priority: validatePriority(parsed.priority),
    };
  }

  /** Get feedback count for a tenant */
  getFeedbackCount(tenantId: string): number {
    return this.feedbackStore.get(tenantId)?.length ?? 0;
  }

  /** Clear feedback for testing */
  clearFeedback(tenantId: string): void {
    this.feedbackStore.delete(tenantId);
  }
}

function validateArticleType(value: unknown): ArticleType {
  const valid: ArticleType[] = ['threat_report', 'vulnerability_advisory', 'news', 'blog', 'irrelevant'];
  return valid.includes(value as ArticleType) ? (value as ArticleType) : 'irrelevant';
}

function validatePriority(value: unknown): Priority {
  const valid: Priority[] = ['critical', 'high', 'normal', 'low'];
  return valid.includes(value as Priority) ? (value as Priority) : 'low';
}
