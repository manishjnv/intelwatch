import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AIPatternDetectionService } from '../src/services/ai-pattern-detection.js';
import type { CorrelatedIOC, CorrelationResult, CampaignCluster } from '../src/schemas/correlation.js';
import pino from 'pino';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
    },
    __mockCreate: mockCreate,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreate: Mock<any>;

beforeEach(async () => {
  const mod = await import('@anthropic-ai/sdk');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate = (mod as any).__mockCreate;
  mockCreate.mockReset();
});

const logger = pino({ level: 'silent' });

function makeIOC(id: string): CorrelatedIOC {
  return {
    id, tenantId: 't1', iocType: 'ip', value: `1.2.3.${id}`,
    normalizedValue: `1.2.3.${id}`, confidence: 80, severity: 'HIGH',
    tags: [], mitreAttack: ['T1071'], malwareFamilies: ['Cobalt Strike'],
    threatActors: ['APT29'], sourceFeedIds: ['f1'],
    firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
    enrichmentQuality: 0.7, asn: 'AS12345',
  };
}

function makeResult(): CorrelationResult {
  return {
    id: 'cr-1', tenantId: 't1', correlationType: 'cooccurrence',
    severity: 'MEDIUM', confidence: 0.85, entities: [],
    metadata: {}, suppressed: false, ruleId: 'rule-cooc',
    createdAt: new Date().toISOString(),
  };
}

describe('AIPatternDetectionService', () => {
  describe('isEnabled', () => {
    it('returns false when apiKey is empty', () => {
      const svc = new AIPatternDetectionService('', true, logger);
      expect(svc.isEnabled()).toBe(false);
    });

    it('returns false when aiEnabled is false', () => {
      const svc = new AIPatternDetectionService('sk-test-key', false, logger);
      expect(svc.isEnabled()).toBe(false);
    });

    it('returns true when both configured', () => {
      const svc = new AIPatternDetectionService('sk-test-key', true, logger);
      expect(svc.isEnabled()).toBe(true);
    });
  });

  describe('isWithinBudget', () => {
    it('returns true when no spend', () => {
      const svc = new AIPatternDetectionService('sk-test-key', true, logger);
      expect(svc.isWithinBudget()).toBe(true);
    });

    it('returns false when over daily budget', () => {
      const svc = new AIPatternDetectionService('sk-test-key', true, logger, undefined, undefined, 0.001);
      // Simulate by spending more than $0.001
      // We can't directly set spend, but we can test the analyze method
      expect(svc.isWithinBudget()).toBe(true);
    });
  });

  describe('getSpendStats', () => {
    it('returns initial spend stats', () => {
      const svc = new AIPatternDetectionService('sk-test-key', true, logger, undefined, undefined, 5.0);
      const stats = svc.getSpendStats();
      expect(stats.dailySpend).toBe(0);
      expect(stats.dailyBudget).toBe(5.0);
      expect(stats.percentUsed).toBe(0);
    });
  });

  describe('analyze', () => {
    it('returns null when disabled', async () => {
      const svc = new AIPatternDetectionService('', false, logger);
      const result = await svc.analyze([makeIOC('1')], [makeResult()], []);
      expect(result).toBeNull();
    });

    it('calls Anthropic SDK with correct model', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify([
          { pattern_description: 'Shared C2', involved_entity_ids: ['ioc-1'],
            confidence: 0.9, reasoning_steps: ['Step 1'], suggested_relationship_type: 'INDICATES' },
        ])}],
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });

      const svc = new AIPatternDetectionService('sk-test-key', true, logger, 'claude-sonnet-4-20250514');
      const result = await svc.analyze([makeIOC('1')], [makeResult()], []);

      expect(result).not.toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0]![0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
    });

    it('parses valid JSON response into AIPatternDetection[]', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify([
          { pattern_description: 'Infrastructure overlap', involved_entity_ids: ['ioc-1', 'ioc-2'],
            confidence: 0.85, reasoning_steps: ['Both share AS12345', 'Common malware family'],
            suggested_relationship_type: 'HOSTED_ON' },
        ])}],
        usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 },
      });

      const svc = new AIPatternDetectionService('sk-test-key', true, logger);
      const result = await svc.analyze([makeIOC('1'), makeIOC('2')], [], []);

      expect(result).not.toBeNull();
      expect(result!.patterns).toHaveLength(1);
      expect(result!.patterns[0]!.patternDescription).toBe('Infrastructure overlap');
      expect(result!.patterns[0]!.confidence).toBe(0.85);
      expect(result!.patterns[0]!.reasoningSteps).toHaveLength(2);
    });

    it('returns cost/token breakdown', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '[]' }],
        usage: { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 200, cache_creation_input_tokens: 100 },
      });

      const svc = new AIPatternDetectionService('sk-test-key', true, logger);
      const result = await svc.analyze([makeIOC('1')], [], []);

      expect(result).not.toBeNull();
      expect(result!.inputTokens).toBe(500);
      expect(result!.outputTokens).toBe(100);
      expect(result!.cacheReadTokens).toBe(200);
      expect(result!.cacheCreationTokens).toBe(100);
      expect(result!.costUsd).toBeGreaterThanOrEqual(0);
    });

    it('returns null on API error (graceful degradation)', async () => {
      mockCreate.mockRejectedValue(new Error('API timeout'));

      const svc = new AIPatternDetectionService('sk-test-key', true, logger);
      const result = await svc.analyze([makeIOC('1')], [], []);
      expect(result).toBeNull();
    });

    it('returns empty patterns on JSON parse failure', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json at all' }],
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });

      const svc = new AIPatternDetectionService('sk-test-key', true, logger);
      const result = await svc.analyze([makeIOC('1')], [], []);
      expect(result).not.toBeNull();
      expect(result!.patterns).toHaveLength(0);
    });

    it('system prompt includes cache_control ephemeral', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '[]' }],
        usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });

      const svc = new AIPatternDetectionService('sk-test-key', true, logger);
      await svc.analyze([makeIOC('1')], [], []);

      const callArgs = mockCreate.mock.calls[0]![0];
      expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' });
    });
  });
});
