import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HaikuTriageProvider } from '../src/providers/haiku-triage.js';
import type { VTResult, AbuseIPDBResult } from '../src/schema.js';
import pino from 'pino';

const createMock = vi.fn();

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

// Mock shared-enrichment sanitizer
vi.mock('@etip/shared-enrichment', () => ({
  sanitizeLLMInput: vi.fn((text: string) => ({
    sanitized: text,
    injectionDetected: false,
    matchedPatterns: [],
  })),
}));

const logger = pino({ level: 'silent' });

function mockAIResponse(json: Record<string, unknown>, inputTokens = 120, outputTokens = 80) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const VALID_TRIAGE_RESPONSE = {
  risk_score: 75,
  confidence: 80,
  severity: 'HIGH',
  threat_category: 'c2_server',
  reasoning: 'Known C2 infrastructure based on VT detections and abuse reports.',
  tags: ['apt28', 'cobalt_strike'],
};

const VT_RESULT: VTResult = {
  malicious: 15, suspicious: 2, harmless: 50, undetected: 3,
  totalEngines: 70, detectionRate: 21, tags: ['trojan'], lastAnalysisDate: '2026-03-20',
};

const ABUSE_RESULT: AbuseIPDBResult = {
  abuseConfidenceScore: 85, totalReports: 42, numDistinctUsers: 12,
  lastReportedAt: '2026-03-20', isp: 'Evil Hosting', countryCode: 'RU',
  usageType: 'Data Center/Web Hosting/Transit', isWhitelisted: false, isTor: false,
};

describe('HaikuTriageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue(mockAIResponse(VALID_TRIAGE_RESPONSE));
  });

  // --- isEnabled ---

  describe('isEnabled', () => {
    it('returns true when API key present and aiEnabled=true', () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      expect(provider.isEnabled()).toBe(true);
    });

    it('returns false when API key empty', () => {
      const provider = new HaikuTriageProvider('', true, logger);
      expect(provider.isEnabled()).toBe(false);
    });

    it('returns false when aiEnabled=false even with API key', () => {
      const provider = new HaikuTriageProvider('sk-ant-key', false, logger);
      expect(provider.isEnabled()).toBe(false);
    });

    it('returns false when both are missing', () => {
      const provider = new HaikuTriageProvider('', false, logger);
      expect(provider.isEnabled()).toBe(false);
    });
  });

  // --- supports ---

  describe('supports', () => {
    it('returns true for all known IOC types', () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      for (const type of ['ip', 'ipv6', 'domain', 'fqdn', 'url', 'email', 'hash_sha256', 'hash_md5', 'cve']) {
        expect(provider.supports(type)).toBe(true);
      }
    });

    it('returns true for unknown IOC types', () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      expect(provider.supports('custom_type')).toBe(true);
    });
  });

  // --- triage ---

  describe('triage', () => {
    it('returns null when disabled', async () => {
      const provider = new HaikuTriageProvider('', false, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);
      expect(result).toBeNull();
      expect(createMock).not.toHaveBeenCalled();
    });

    it('calls Anthropic SDK with correct model and max_tokens', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger, 'claude-haiku-4-5-20251001');
      await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);

      expect(createMock).toHaveBeenCalledOnce();
      const callArgs = createMock.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-haiku-4-5-20251001');
      expect(callArgs.max_tokens).toBe(256);
    });

    it('includes VT results in prompt when available', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      await provider.triage('ip', '185.220.101.34', VT_RESULT, null, 50);

      const callArgs = createMock.mock.calls[0][0];
      const userMsg = callArgs.messages[0].content;
      expect(userMsg).toContain('VirusTotal');
      expect(userMsg).toContain('21'); // detectionRate
    });

    it('includes AbuseIPDB results in prompt when available', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      await provider.triage('ip', '185.220.101.34', null, ABUSE_RESULT, 50);

      const callArgs = createMock.mock.calls[0][0];
      const userMsg = callArgs.messages[0].content;
      expect(userMsg).toContain('AbuseIPDB');
      expect(userMsg).toContain('85'); // abuseConfidenceScore
    });

    it('parses valid JSON response into HaikuTriageResult', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);

      expect(result).not.toBeNull();
      expect(result!.riskScore).toBe(75);
      expect(result!.confidence).toBe(80);
      expect(result!.severity).toBe('HIGH');
      expect(result!.threatCategory).toBe('c2_server');
      expect(result!.tags).toEqual(['apt28', 'cobalt_strike']);
    });

    it('strips markdown code fences from response', async () => {
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n' + JSON.stringify(VALID_TRIAGE_RESPONSE) + '\n```' }],
        usage: { input_tokens: 120, output_tokens: 80 },
      });

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);
      expect(result).not.toBeNull();
      expect(result!.riskScore).toBe(75);
    });

    it('returns correct inputTokens/outputTokens from usage', async () => {
      createMock.mockResolvedValue(mockAIResponse(VALID_TRIAGE_RESPONSE, 200, 150));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.inputTokens).toBe(200);
      expect(result!.outputTokens).toBe(150);
    });

    it('calculates costUsd from token counts', async () => {
      createMock.mockResolvedValue(mockAIResponse(VALID_TRIAGE_RESPONSE, 500, 100));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);
      // 500 input @ $0.25/MTok + 100 output @ $1.25/MTok = 0.000125 + 0.000125 = 0.00025
      expect(result!.costUsd).toBe(0.00025);
    });

    it('records durationMs', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns null on Anthropic SDK error (graceful degradation)', async () => {
      createMock.mockRejectedValue(new Error('API timeout'));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);
      expect(result).toBeNull();
    });

    it('returns null on JSON parse failure (graceful degradation)', async () => {
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: 'This is not valid JSON' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);
      expect(result).toBeNull();
    });
  });

  // --- prompt construction ---

  describe('prompt construction', () => {
    it('system prompt instructs JSON-only output', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      await provider.triage('ip', '185.220.101.34', VT_RESULT, ABUSE_RESULT, 50);

      const callArgs = createMock.mock.calls[0][0];
      expect(callArgs.system).toContain('JSON');
      expect(callArgs.system).toContain('risk_score');
    });

    it('user message includes IOC type and value', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      await provider.triage('domain', 'evil.com', null, null, 50);

      const userMsg = createMock.mock.calls[0][0].messages[0].content;
      expect(userMsg).toContain('domain');
      expect(userMsg).toContain('evil.com');
    });

    it('user message includes VT detection rate when available', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      await provider.triage('ip', '1.2.3.4', VT_RESULT, null, 50);

      const userMsg = createMock.mock.calls[0][0].messages[0].content;
      expect(userMsg).toContain('21');
      expect(userMsg).toContain('70');
    });

    it('user message includes AbuseIPDB confidence when available', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      await provider.triage('ip', '1.2.3.4', null, ABUSE_RESULT, 50);

      const userMsg = createMock.mock.calls[0][0].messages[0].content;
      expect(userMsg).toContain('85');
      expect(userMsg).toContain('42'); // totalReports
    });
  });

  // --- response validation ---

  describe('response validation', () => {
    it('clamps riskScore to 0-100 range', async () => {
      createMock.mockResolvedValue(mockAIResponse({ ...VALID_TRIAGE_RESPONSE, risk_score: 150 }));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.riskScore).toBeLessThanOrEqual(100);
    });

    it('clamps confidence to 0-100 range', async () => {
      createMock.mockResolvedValue(mockAIResponse({ ...VALID_TRIAGE_RESPONSE, confidence: -10 }));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.confidence).toBeGreaterThanOrEqual(0);
    });

    it('defaults tags to empty array when missing', async () => {
      const noTags = { ...VALID_TRIAGE_RESPONSE };
      delete (noTags as Record<string, unknown>).tags;
      createMock.mockResolvedValue(mockAIResponse(noTags));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.tags).toEqual([]);
    });
  });
});
