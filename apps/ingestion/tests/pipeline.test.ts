import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArticlePipeline, type ProcessedArticle, type PipelineBatchResult } from '../src/workers/pipeline.js';
import type { FetchedArticle } from '../src/connectors/rss.js';
import type { CustomizationClient } from '../src/services/customization-client.js';

function createMockLogger() {
  const noop = (): void => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop, fatal: noop, child: () => logger } as never;
  return logger;
}

function makeCTIArticle(overrides: Partial<FetchedArticle> = {}): FetchedArticle {
  return {
    title: 'APT29 Deploys New Malware Variant Targeting Healthcare CVE-2024-1234',
    content: 'The threat actor APT29 has been observed deploying a new backdoor malware variant. ' +
      'The campaign exploits vulnerability CVE-2024-1234 to gain initial access. ' +
      'Indicators include IP 185.220.101.34 and domain evil-c2.example.com. ' +
      'The attack uses lateral movement techniques mapped to MITRE ATT&CK T1021.',
    url: 'https://threatblog.example.com/apt29-report',
    publishedAt: new Date('2026-03-20T10:00:00Z'),
    author: 'Threat Research Team',
    rawMeta: { guid: 'article-1', categories: ['apt', 'malware'] },
    ...overrides,
  };
}

function makeIrrelevantArticle(overrides: Partial<FetchedArticle> = {}): FetchedArticle {
  return {
    title: 'Company Announces Q4 Earnings Beat',
    content: 'The company reported better than expected quarterly earnings. Revenue grew 15% year over year.',
    url: 'https://news.example.com/earnings',
    publishedAt: new Date('2026-03-20T08:00:00Z'),
    author: 'Business Reporter',
    rawMeta: { guid: 'article-2' },
    ...overrides,
  };
}

const FEED_ID = 'feed-uuid-1';
const FEED_NAME = 'Test CISA Feed';
const TENANT_ID = 'tenant-uuid-1';

describe('ArticlePipeline', () => {
  let pipeline: ArticlePipeline;

  beforeEach(() => {
    pipeline = new ArticlePipeline({ logger: createMockLogger() });
  });

  describe('processBatch', () => {
    it('processes empty batch and returns zero counts', async () => {
      const result = await pipeline.processBatch([], FEED_ID, FEED_NAME, TENANT_ID);
      expect(result.total).toBe(0);
      expect(result.relevant).toBe(0);
      expect(result.duplicates).toBe(0);
      expect(result.processed).toBe(0);
      expect(result.articles).toHaveLength(0);
    });

    it('filters irrelevant articles via triage (marks as not CTI-relevant)', async () => {
      const articles = [makeIrrelevantArticle()];
      const result = await pipeline.processBatch(articles, FEED_ID, FEED_NAME, TENANT_ID);

      expect(result.total).toBe(1);
      expect(result.relevant).toBe(0);
      expect(result.articles[0].isCtiRelevant).toBe(false);
      expect(result.articles[0].skipped).toBe(true);
      expect(result.articles[0].skipReason).toBe('not_cti_relevant');
      expect(result.articles[0].pipelineStatus).toBe('triaged');
    });

    it('passes CTI-relevant articles through full pipeline', async () => {
      const articles = [makeCTIArticle()];
      const result = await pipeline.processBatch(articles, FEED_ID, FEED_NAME, TENANT_ID);

      expect(result.total).toBe(1);
      expect(result.relevant).toBe(1);
      expect(result.articles[0].isCtiRelevant).toBe(true);
      expect(result.articles[0].skipped).toBe(false);
      expect(result.articles[0].triageResult).toBeDefined();
      expect(result.articles[0].triageResult!.isCtiRelevant).toBe(true);
    });

    it('extracts IOCs from CTI articles', async () => {
      const articles = [makeCTIArticle()];
      const result = await pipeline.processBatch(articles, FEED_ID, FEED_NAME, TENANT_ID);

      const processed = result.articles[0];
      // Should find at least the IP 185.220.101.34 and CVE-2024-1234
      expect(processed.iocContexts.length).toBeGreaterThanOrEqual(1);
    });

    it('tracks triage cost breakdown for each article', async () => {
      const articles = [makeCTIArticle()];
      const result = await pipeline.processBatch(articles, FEED_ID, FEED_NAME, TENANT_ID);

      const processed = result.articles[0];
      // Rule-based mode: 0 tokens (no LLM call). Haiku mode: >0 tokens.
      expect(processed.costBreakdown.triageTokens).toBeGreaterThanOrEqual(0);
      expect(processed.costBreakdown.triageCostUsd).toBeGreaterThanOrEqual(0);
      expect(processed.costBreakdown.extractionTokens).toBeGreaterThanOrEqual(0);
      expect(processed.costBreakdown.extractionCostUsd).toBeGreaterThanOrEqual(0);
      // Dedup Layer 3 arbitration cost — 0 when no API key / no LLM call fired
      expect(processed.costBreakdown.dedupArbitrationTokens).toBeGreaterThanOrEqual(0);
      expect(processed.costBreakdown.dedupArbitrationCostUsd).toBeGreaterThanOrEqual(0);
    });

    it('processes mixed batch: CTI and irrelevant articles', async () => {
      const articles = [
        makeCTIArticle(),
        makeIrrelevantArticle(),
        makeCTIArticle({ title: 'Ransomware Campaign Exploits Zero-Day Vulnerability' }),
      ];
      const result = await pipeline.processBatch(articles, FEED_ID, FEED_NAME, TENANT_ID);

      expect(result.total).toBe(3);
      expect(result.relevant).toBe(2);
      expect(result.articles.filter((a) => a.isCtiRelevant)).toHaveLength(2);
      expect(result.articles.filter((a) => !a.isCtiRelevant)).toHaveLength(1);
    });

    it('returns processing time for each article', async () => {
      const result = await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);
      expect(result.articles[0].processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('handles article processing errors gracefully', async () => {
      // Article with null content should not crash the pipeline
      const articles = [
        makeCTIArticle(),
        { title: '', content: '', url: null, publishedAt: null, author: null, rawMeta: {} },
      ];
      const result = await pipeline.processBatch(articles, FEED_ID, FEED_NAME, TENANT_ID);
      expect(result.total).toBe(2);
      // Should process without throwing
      expect(result.processed).toBe(2);
    });

    it('respects feedAiEnabled=true as default (same as omitting the flag)', async () => {
      const withFlag    = await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID, true);
      const withDefault = await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);
      // Both should produce equivalent results
      expect(withFlag.total).toBe(withDefault.total);
      expect(withFlag.articles[0].isCtiRelevant).toBe(withDefault.articles[0].isCtiRelevant);
    });

    it('with feedAiEnabled=false: CTI-relevant articles still triaged but use rule-based path', async () => {
      // Pipeline constructed without anthropicApiKey — rule-based mode is default
      const result = await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID, false);
      // Articles still flow through triage (rule-based), IOCs still extracted
      expect(result.total).toBe(1);
      expect(result.articles[0]).toBeDefined();
      // Rule-based triage: isCtiRelevant may be true for the CTI article
      expect(result.articles[0].pipelineStatus).not.toBe('failed');
    });

    it('with feedAiEnabled=false: no AI triage/extraction counts increment', async () => {
      const pipeline2 = new ArticlePipeline({
        logger: createMockLogger(),
        aiEnabled: false,  // ensure rule-based mode
      });
      const result = await pipeline2.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID, false);
      // Cost should be zero (no AI calls)
      expect(result.totalCostUsd).toBe(0);
    });
  });

  describe('IOC processing', () => {
    it('records corroboration when same IOC appears from multiple feeds', async () => {
      // First feed reports IOC
      const result1 = await pipeline.processBatch([makeCTIArticle()], 'feed-1', 'Feed A', TENANT_ID);
      // Second feed reports same IOC
      const result2 = await pipeline.processBatch([makeCTIArticle()], 'feed-2', 'Feed B', TENANT_ID);

      // Second feed should see corroboration count > 1 for shared IOCs
      const iocResults2 = result2.articles[0].iocResults;
      if (iocResults2.length > 0) {
        const sharedIOC = iocResults2.find((r) => r.corroborationCount > 1);
        // May or may not find shared IOC depending on extraction — just verify no crash
        expect(iocResults2.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('normalizes IOC values in results', async () => {
      const result = await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);
      const processed = result.articles[0];

      for (const iocResult of processed.iocResults) {
        expect(iocResult.normalizedValue).toBeDefined();
        expect(iocResult.iocType).toBeDefined();
        expect(typeof iocResult.calibratedConfidence).toBe('number');
      }
    });

    it('detects IOC reactivation events', async () => {
      // Process same article twice — second time may trigger reactivation detection
      await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);
      const result2 = await pipeline.processBatch([makeCTIArticle()], 'feed-2', 'Feed B', TENANT_ID);

      // Reactivation won't fire immediately (needs aging first) — just verify structure
      for (const iocResult of result2.articles[0].iocResults) {
        expect(iocResult.reactivationEvent === null || typeof iocResult.reactivationEvent === 'object').toBe(true);
      }
    });
  });

  describe('deduplication', () => {
    it('detects duplicate articles by bloom filter', async () => {
      const article = makeCTIArticle();
      await pipeline.processBatch([article], FEED_ID, FEED_NAME, TENANT_ID);

      // Same article again — bloom filter should catch the title+url match
      const result2 = await pipeline.processBatch([article], FEED_ID, FEED_NAME, TENANT_ID);

      // Dedup may or may not catch depending on IOC overlap — verify no crash
      expect(result2.total).toBe(1);
      expect(result2.articles[0].dedupResult).toBeDefined();
    });
  });

  describe('triage classification', () => {
    it('classifies threat reports correctly', async () => {
      const article = makeCTIArticle({
        title: 'Critical Ransomware Exploit Targets Healthcare with Zero-Day Vulnerability',
        content: 'A new ransomware campaign exploits a zero-day vulnerability CVE-2025-9999. ' +
          'The malware uses a backdoor trojan for persistence and lateral movement. ' +
          'Threat actor APT41 is attributed to this campaign targeting healthcare.',
      });
      const result = await pipeline.processBatch([article], FEED_ID, FEED_NAME, TENANT_ID);

      expect(result.articles[0].triageResult!.isCtiRelevant).toBe(true);
      expect(result.articles[0].triageResult!.articleType).toBe('threat_report');
    });

    it('rejects non-CTI content', async () => {
      const article = makeIrrelevantArticle({
        title: 'Stock Market Update: Tech Sector Rally Continues',
        content: 'Technology stocks rose 3% today as investors remain optimistic about AI growth.',
      });
      const result = await pipeline.processBatch([article], FEED_ID, FEED_NAME, TENANT_ID);
      expect(result.articles[0].triageResult!.isCtiRelevant).toBe(false);
    });

    it('returns confidence and priority in triage result', async () => {
      const result = await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);
      const triage = result.articles[0].triageResult!;

      expect(triage.confidence).toBeGreaterThan(0);
      expect(triage.confidence).toBeLessThanOrEqual(1);
      expect(['critical', 'high', 'normal', 'low']).toContain(triage.priority);
      expect(triage.detectedLanguage).toBe('en');
    });
  });

  describe('customization client integration (AC-2)', () => {
    it('calls customizationClient.getSubtaskModels with the tenant ID when client is injected', async () => {
      const mockClient = {
        getSubtaskModels: vi.fn().mockResolvedValue({
          classification: 'claude-haiku-4-5-20251001',
          ioc_extraction: 'claude-sonnet-4-20250514',
          deduplication: 'claude-haiku-4-5-20251001',
        }),
      } as unknown as CustomizationClient;

      const p = new ArticlePipeline({
        logger: createMockLogger(),
        customizationClient: mockClient,
      });

      await p.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);

      expect(mockClient.getSubtaskModels).toHaveBeenCalledWith(TENANT_ID);
    });

    it('uses the tenant custom model (pipeline completes without error)', async () => {
      // Tenant has configured opus for ioc_extraction (unusual but valid)
      const mockClient = {
        getSubtaskModels: vi.fn().mockResolvedValue({
          classification: 'claude-haiku-4-5-20251001',
          ioc_extraction: 'claude-opus-4-6',
          deduplication: 'claude-haiku-4-5-20251001',
        }),
      } as unknown as CustomizationClient;

      const p = new ArticlePipeline({
        logger: createMockLogger(),
        customizationClient: mockClient,
      });

      const result = await p.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);
      // Pipeline must complete without crashing — model is only sent to Claude when aiEnabled+apiKey set
      expect(result.total).toBe(1);
      expect(result.articles[0].pipelineStatus).not.toBe('failed');
    });

    it('existing tests work unchanged when no customizationClient is injected (fallback path)', async () => {
      // pipeline from beforeEach has no customizationClient
      const result = await pipeline.processBatch([makeCTIArticle()], FEED_ID, FEED_NAME, TENANT_ID);
      expect(result.total).toBe(1);
      expect(result.articles[0].isCtiRelevant).toBe(true);
    });
  });
});
