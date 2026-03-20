import { describe, it, expect, beforeEach } from 'vitest';
import { TriageService, type TriageResult } from '../src/services/triage.js';

let triage: TriageService;
const TENANT = 'tenant-1';

beforeEach(() => { triage = new TriageService(); });

const mockTriageResult: TriageResult = {
  isCtiRelevant: true, confidence: 0.85, detectedLanguage: 'en',
  articleType: 'threat_report', estimatedIocCount: 5, priority: 'high',
};

describe('TriageService.recordFeedback', () => {
  it('stores feedback for a tenant', () => {
    triage.recordFeedback('a1', TENANT, 'APT29 Report', 'excerpt...', mockTriageResult, 'confirmed_relevant');
    expect(triage.getFeedbackCount(TENANT)).toBe(1);
  });

  it('caps at MAX_FEEDBACK_PER_TENANT', () => {
    for (let i = 0; i < 55; i++) {
      triage.recordFeedback(`a${i}`, TENANT, `Article ${i}`, 'excerpt', mockTriageResult, 'confirmed_relevant');
    }
    expect(triage.getFeedbackCount(TENANT)).toBe(50);
  });

  it('isolates feedback per tenant', () => {
    triage.recordFeedback('a1', 'tenant-a', 'Title', 'excerpt', mockTriageResult, 'false_positive');
    triage.recordFeedback('a2', 'tenant-b', 'Title', 'excerpt', mockTriageResult, 'confirmed_relevant');
    expect(triage.getFeedbackCount('tenant-a')).toBe(1);
    expect(triage.getFeedbackCount('tenant-b')).toBe(1);
  });
});

describe('TriageService.buildFewShotExamples', () => {
  it('returns empty string for tenant with no feedback', () => {
    expect(triage.buildFewShotExamples(TENANT)).toBe('');
  });

  it('builds examples from feedback history', () => {
    triage.recordFeedback('a1', TENANT, 'APT Report', 'excerpt1', mockTriageResult, 'confirmed_relevant');
    triage.recordFeedback('a2', TENANT, 'Marketing Spam', 'excerpt2',
      { ...mockTriageResult, isCtiRelevant: false }, 'false_positive');

    const examples = triage.buildFewShotExamples(TENANT);
    expect(examples).toContain('Marketing Spam');
    expect(examples).toContain('is_cti_relevant: false');
    expect(examples).toContain('APT Report');
    expect(examples).toContain('is_cti_relevant: true');
  });
});

describe('TriageService.buildTriagePrompt', () => {
  it('builds prompt with system, few-shot, and article', () => {
    triage.recordFeedback('a1', TENANT, 'FP Article', 'spam', mockTriageResult, 'false_positive');

    const article = { id: 'new-1', title: 'New Threat Report', content: 'Some CTI content here.', source: 'blog.threat.com' };
    const prompt = triage.buildTriagePrompt(article, TENANT);

    expect(prompt.system).toContain('CTI triage analyst');
    expect(prompt.fewShot).toContain('FP Article');
    expect(prompt.userMessage).toContain('New Threat Report');
    expect(prompt.userMessage).toContain('blog.threat.com');
  });

  it('works without feedback (empty few-shot)', () => {
    const article = { id: 'new-1', title: 'Report', content: 'Content.', source: 'src' };
    const prompt = triage.buildTriagePrompt(article, 'empty-tenant');
    expect(prompt.fewShot).toBe('');
  });
});

describe('TriageService.parseTriageResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      is_cti_relevant: true, confidence: 0.92, detected_language: 'en',
      article_type: 'threat_report', estimated_ioc_count: 8, priority: 'critical',
    });
    const result = triage.parseTriageResponse(json);

    expect(result.isCtiRelevant).toBe(true);
    expect(result.confidence).toBe(0.92);
    expect(result.articleType).toBe('threat_report');
    expect(result.priority).toBe('critical');
  });

  it('defaults invalid article_type to irrelevant', () => {
    const json = JSON.stringify({
      is_cti_relevant: false, confidence: 0.1, detected_language: 'en',
      article_type: 'INVALID', estimated_ioc_count: 0, priority: 'low',
    });
    const result = triage.parseTriageResponse(json);
    expect(result.articleType).toBe('irrelevant');
  });

  it('clamps confidence to 0-1', () => {
    const json = JSON.stringify({
      is_cti_relevant: true, confidence: 1.5, detected_language: 'en',
      article_type: 'news', estimated_ioc_count: 2, priority: 'normal',
    });
    const result = triage.parseTriageResponse(json);
    expect(result.confidence).toBe(1);
  });
});
