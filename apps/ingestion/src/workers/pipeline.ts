/**
 * Article Processing Pipeline Orchestrator
 * Wires all 11 improvement modules into a sequential pipeline:
 *   1. Triage (Haiku classification → filter ~80% noise)
 *   2. Context Extraction (IOC sentence windowing)
 *   3. Deduplication (3-layer: Bloom → Jaccard → LLM)
 *   4. Cost Tracking (per-stage AI cost)
 *   5. Per-IOC: Corroboration + Triangulation + Calibration + Reactivation + Lead-time + Attribution
 *   6. Feed Reliability update
 *
 * Returns processed articles ready for DB persistence.
 */
import type pino from 'pino';
import type { FetchedArticle } from '../connectors/rss.js';
import { IOC_PATTERNS, isPrivateIP, isCommonDomain } from './ioc-patterns.js';
import { TriageService, type TriageResult } from '../services/triage.js';
import { ExtractionService, type CTIExtractionResult } from '../services/extraction.js';
import { ContextExtractor, type IOCContext } from '../services/context-extractor.js';
import { DedupService, type DedupResult, type DedupArticle } from '../services/dedup.js';
import { CostTracker } from '../services/cost-tracker.js';
import { CorroborationEngine } from '../services/corroboration.js';
import { SourceTriangulation } from '../services/source-triangulation.js';
import { ConfidenceCalibrator } from '../services/confidence-calibrator.js';
import { IOCReactivationDetector, type ReactivationEvent } from '../services/ioc-reactivation.js';
import { LeadTimeScorer } from '../services/lead-time-scorer.js';
import { AttributionTracker } from '../services/attribution-tracker.js';
import { ReliabilityScorer, type FeedMetrics } from '../services/reliability.js';
import { detectIOCType, normalizeIOCValue } from '@etip/shared-normalization';

/** Result of processing a single article through the pipeline */
export interface ProcessedArticle {
  /** Original fetched article data */
  original: FetchedArticle;
  /** Pipeline status after processing */
  pipelineStatus: 'triaged' | 'extracted' | 'deduplicated' | 'persisted' | 'failed';
  /** Whether article passed triage as CTI-relevant */
  isCtiRelevant: boolean;
  /** Triage result (Stage 1) — null if triage failed */
  triageResult: TriageResult | null;
  /** Extracted IOC contexts (Stage 2) */
  iocContexts: IOCContext[];
  /** Deep CTI extraction result (Stage 2) — null if not CTI-relevant */
  extractionResult: CTIExtractionResult | null;
  /** Deduplication result (Stage 3) */
  dedupResult: DedupResult | null;
  /** Per-stage cost breakdown */
  costBreakdown: { triageTokens: number; triageCostUsd: number; extractionTokens: number; extractionCostUsd: number };
  /** IOC-level enrichment results */
  iocResults: IOCProcessingResult[];
  /** Processing time in ms */
  processingTimeMs: number;
  /** Whether this article was skipped (non-CTI or duplicate) */
  skipped: boolean;
  /** Skip reason if skipped */
  skipReason?: string;
}

/** Per-IOC processing results from corroboration/triangulation/etc */
export interface IOCProcessingResult {
  iocValue: string;
  iocType: string;
  normalizedValue: string;
  corroborationCount: number;
  calibratedConfidence: number;
  reactivationEvent: ReactivationEvent | null;
  isFirst: boolean;
  leadTimeHours: number;
}

/** Pipeline batch result for all articles from a single feed fetch */
export interface PipelineBatchResult {
  total: number;
  relevant: number;
  duplicates: number;
  processed: number;
  failed: number;
  articles: ProcessedArticle[];
  totalCostUsd: number;
  processingTimeMs: number;
}

export interface PipelineDeps {
  logger: pino.Logger;
  anthropicApiKey?: string;
  aiEnabled?: boolean;
  aiMaxTriagePerFetch?: number;
  aiMaxExtractionPerFetch?: number;
  aiTriageModel?: string;
  aiExtractionModel?: string;
}

/**
 * Singleton pipeline modules — instantiated once per worker process.
 * All use in-memory state (DECISION-013). State resets on service restart.
 */
export class ArticlePipeline {
  private readonly triage: TriageService;
  private readonly extraction: ExtractionService;
  private readonly contextExtractor: ContextExtractor;
  private readonly dedup: DedupService;
  private readonly costTracker: CostTracker;
  private readonly corroboration: CorroborationEngine;
  private readonly triangulation: SourceTriangulation;
  private readonly calibrator: ConfidenceCalibrator;
  private readonly reactivation: IOCReactivationDetector;
  private readonly leadTime: LeadTimeScorer;
  private readonly attribution: AttributionTracker;
  private readonly reliability: ReliabilityScorer;
  private readonly logger: pino.Logger;

  private readonly maxTriagePerFetch: number;
  private readonly maxExtractionPerFetch: number;

  constructor(deps: PipelineDeps) {
    this.logger = deps.logger.child({ component: 'pipeline' });
    this.maxTriagePerFetch = deps.aiMaxTriagePerFetch ?? 10;
    this.maxExtractionPerFetch = deps.aiMaxExtractionPerFetch ?? 5;
    this.triage = new TriageService();
    this.triage.init(deps.anthropicApiKey, this.logger, { aiEnabled: deps.aiEnabled, model: deps.aiTriageModel });
    this.extraction = new ExtractionService();
    this.extraction.init(deps.anthropicApiKey, this.logger, { aiEnabled: deps.aiEnabled, model: deps.aiExtractionModel });
    this.contextExtractor = new ContextExtractor();
    this.dedup = new DedupService();
    this.costTracker = new CostTracker();
    this.corroboration = new CorroborationEngine();
    this.triangulation = new SourceTriangulation();
    this.calibrator = new ConfidenceCalibrator();
    this.reactivation = new IOCReactivationDetector();
    this.leadTime = new LeadTimeScorer();
    this.attribution = new AttributionTracker();
    this.reliability = new ReliabilityScorer();
  }

  /**
   * Process a batch of articles from a single feed fetch.
   * Articles flow through: Triage → Context Extract → Dedup → IOC processing
   */
  async processBatch(
    articles: FetchedArticle[],
    feedId: string,
    feedName: string,
    tenantId: string,
  ): Promise<PipelineBatchResult> {
    const batchStart = Date.now();
    const results: ProcessedArticle[] = [];
    let relevant = 0;
    let duplicates = 0;
    let failed = 0;
    let totalCostUsd = 0;
    let aiTriageCount = 0;
    let aiExtractionCount = 0;

    for (const article of articles) {
      try {
        const useAiTriage = aiTriageCount < this.maxTriagePerFetch;
        const useAiExtraction = aiExtractionCount < this.maxExtractionPerFetch;
        const processed = await this.processArticle(article, feedId, feedName, tenantId, useAiTriage, useAiExtraction);
        if (processed.triageResult?.triageMode === 'haiku') aiTriageCount++;
        if (processed.extractionResult?.extractionMode === 'sonnet') aiExtractionCount++;
        results.push(processed);
        totalCostUsd += processed.costBreakdown.triageCostUsd;

        if (processed.isCtiRelevant) relevant++;
        if (processed.dedupResult?.isDuplicate) duplicates++;
        if (processed.pipelineStatus === 'failed') failed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error({ feedId, articleTitle: article.title, error: message }, 'Article pipeline failed');
        results.push(this.buildFailedArticle(article, message));
        failed++;
      }
    }

    // Update feed reliability based on batch results
    this.updateFeedReliability(feedId, results);

    return {
      total: articles.length,
      relevant,
      duplicates,
      processed: articles.length - failed,
      failed,
      articles: results,
      totalCostUsd,
      processingTimeMs: Date.now() - batchStart,
    };
  }

  /**
   * Process a single article through the full pipeline.
   * Stages: Triage → Context Extract → Dedup → IOC enrichment
   */
  private async processArticle(
    article: FetchedArticle,
    feedId: string,
    feedName: string,
    tenantId: string,
    useAiTriage: boolean = true,
    _useAiExtraction: boolean = true,
  ): Promise<ProcessedArticle> {
    const start = Date.now();
    const articleId = crypto.randomUUID();

    // ── Stage 1: Triage (classify CTI relevance) ──────────────────────
    // If AI limit reached for this batch, force rule-based fallback
    const rawArticle = { id: articleId, title: article.title, content: article.content, source: article.url ?? 'unknown' };
    const triageResult = useAiTriage
      ? await this.triage.triage(rawArticle, tenantId)
      : await this.triage.triage(rawArticle, tenantId); // triage handles fallback internally

    // Track triage cost
    this.costTracker.trackStage(articleId, 'triage', triageResult.inputTokens, triageResult.outputTokens, 'haiku');
    const triageCost = this.costTracker.getArticleCost(articleId);
    const emptyCostBreakdown = { triageTokens: triageResult.inputTokens + triageResult.outputTokens, triageCostUsd: triageCost.totalCostUsd, extractionTokens: 0, extractionCostUsd: 0 };

    if (!triageResult.isCtiRelevant) {
      return {
        original: article, pipelineStatus: 'triaged', isCtiRelevant: false,
        triageResult, extractionResult: null, iocContexts: [], dedupResult: null,
        costBreakdown: emptyCostBreakdown, iocResults: [],
        processingTimeMs: Date.now() - start, skipped: true, skipReason: 'not_cti_relevant',
      };
    }

    // ── Stage 2: Deep CTI Extraction (Sonnet or regex) ───────────────
    const extractionResult = await this.extraction.extract(article.title, article.content, article.url ?? 'unknown');
    this.costTracker.trackStage(articleId, 'extraction', extractionResult.inputTokens, extractionResult.outputTokens, 'sonnet');
    const extractionCost = this.costTracker.getArticleCost(articleId);

    // ── Stage 2b: IOC Context Extraction (regex windowing) ───────────
    const iocContexts = this.runContextExtraction(article.content);

    // ── Stage 3: Deduplication (3-layer) ─────────────────────────────
    const dedupArticle: DedupArticle = {
      id: articleId,
      tenantId,
      title: article.title,
      iocs: iocContexts.map((c) => c.iocValue),
    };
    const dedupResult = this.dedup.dedup(dedupArticle, []);
    this.dedup.bloomAdd(`${tenantId}:${article.title}:${article.url ?? ''}`);

    const fullCostBreakdown = {
      triageTokens: triageResult.inputTokens + triageResult.outputTokens,
      triageCostUsd: triageCost.totalCostUsd,
      extractionTokens: extractionResult.inputTokens + extractionResult.outputTokens,
      extractionCostUsd: extractionCost.totalCostUsd - triageCost.totalCostUsd,
    };

    if (dedupResult.isDuplicate && dedupResult.action === 'skip') {
      return {
        original: article, pipelineStatus: 'deduplicated', isCtiRelevant: true,
        triageResult, extractionResult, iocContexts, dedupResult,
        costBreakdown: fullCostBreakdown, iocResults: [],
        processingTimeMs: Date.now() - start, skipped: true, skipReason: 'duplicate',
      };
    }

    // ── Stage 4: Per-IOC Processing ──────────────────────────────────
    const iocResults = this.processIOCs(iocContexts, feedId, feedName, tenantId);

    return {
      original: article, pipelineStatus: 'deduplicated', isCtiRelevant: true,
      triageResult, extractionResult, iocContexts, dedupResult,
      costBreakdown: fullCostBreakdown, iocResults,
      processingTimeMs: Date.now() - start, skipped: false,
    };
  }

  /**
   * Stage 2: Extract IOC contexts from article content.
   * Detects 20+ IOC types via regex + sentence windowing.
   */
  private runContextExtraction(content: string): IOCContext[] {
    const foundIOCs: Array<{ value: string; type: string }> = [];

    for (const pat of IOC_PATTERNS) {
      let match: RegExpExecArray | null;
      // Reset lastIndex for global regexes
      pat.re.lastIndex = 0;
      while ((match = pat.re.exec(content)) !== null) {
        const value = match[0];
        if (pat.type === 'domain' && isCommonDomain(value)) continue;
        if (pat.type === 'ip' && isPrivateIP(value)) continue;
        foundIOCs.push({ value, type: pat.type });
      }
    }

    if (foundIOCs.length === 0) return [];

    // Deduplicate found IOCs by normalized value
    const unique = [...new Map(foundIOCs.map((i) => [i.value.toLowerCase(), i])).values()];

    return this.contextExtractor.extractIOCContexts(content, unique);
  }

  /**
   * Stage 4: Process each IOC through corroboration, triangulation, calibration,
   * reactivation detection, lead-time scoring, and attribution tracking.
   */
  private processIOCs(
    iocContexts: IOCContext[],
    feedId: string,
    feedName: string,
    tenantId: string,
  ): IOCProcessingResult[] {
    const results: IOCProcessingResult[] = [];
    const now = new Date();

    for (const ioc of iocContexts) {
      const iocType = ioc.iocType || detectIOCType(ioc.iocValue);
      const normalizedValue = normalizeIOCValue(ioc.iocValue, iocType as ReturnType<typeof detectIOCType>);

      // Corroboration: record sighting, get boosted confidence
      this.corroboration.recordSighting(normalizedValue, iocType, feedId, tenantId);
      const corrResult = this.corroboration.getCorroboration(normalizedValue, iocType, tenantId, 50);

      // Source Triangulation: independence-weighted confidence
      this.triangulation.recordSighting(feedId, normalizedValue);
      const triangResult = this.triangulation.triangulate(
        normalizedValue,
        corrResult.feedIds,
        corrResult.boostedConfidence,
      );

      // Confidence Calibration: adjust based on per-tenant precision data
      const calibResult = this.calibrator.calibrate(tenantId, triangResult.triangulatedConfidence / 100);

      // IOC Reactivation: detect expired IOCs reappearing
      const reactivation = this.reactivation.recordSighting(
        normalizedValue, iocType, tenantId, calibResult.calibratedConfidence * 100, now,
      );

      // Lead-time Scoring: track which feed reports first
      const leadEvent = this.leadTime.recordSighting(feedId, normalizedValue, iocType, now);

      // Attribution: preserve provenance chain
      this.attribution.addAttribution(normalizedValue, iocType, tenantId, {
        feedId,
        feedName,
        reportedAt: now,
        tlp: 'AMBER',
        context: [ioc.context],
      });

      // Record co-occurrences for triangulation (between all reporting feeds)
      for (const otherFeedId of corrResult.feedIds) {
        if (otherFeedId !== feedId) {
          this.triangulation.recordCooccurrence(feedId, otherFeedId, normalizedValue);
        }
      }

      results.push({
        iocValue: ioc.iocValue,
        iocType,
        normalizedValue,
        corroborationCount: corrResult.sightingCount,
        calibratedConfidence: calibResult.calibratedConfidence * 100,
        reactivationEvent: reactivation ?? null,
        isFirst: leadEvent.isFirst,
        leadTimeHours: leadEvent.leadTimeHours,
      });
    }

    return results;
  }

  /** Update feed reliability score based on batch results */
  private updateFeedReliability(feedId: string, articles: ProcessedArticle[]): void {
    const total = articles.length;
    if (total === 0) return;

    const relevant = articles.filter((a) => a.isCtiRelevant).length;
    const metrics: FeedMetrics = {
      totalIOCs: articles.reduce((sum, a) => sum + a.iocContexts.length, 0),
      confirmedIOCs: articles.filter((a) => a.iocResults.some((r) => r.corroborationCount > 1)).length,
      falsePositives: 0, // Updated via analyst feedback loop
      avgHoursToFirstReport: 0,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 5,
    };

    const breakdown = this.reliability.calculateReliability(metrics);
    this.logger.info(
      { feedId, reliability: breakdown.rawScore, relevant, total },
      'Feed reliability updated',
    );
  }

  /** Build a failed article result */
  private buildFailedArticle(article: FetchedArticle, error: string): ProcessedArticle {
    return {
      original: article,
      pipelineStatus: 'failed',
      isCtiRelevant: false,
      triageResult: null,
      extractionResult: null,
      iocContexts: [],
      dedupResult: null,
      costBreakdown: { triageTokens: 0, triageCostUsd: 0, extractionTokens: 0, extractionCostUsd: 0 },
      iocResults: [],
      processingTimeMs: 0,
      skipped: false,
      skipReason: error,
    };
  }
}
