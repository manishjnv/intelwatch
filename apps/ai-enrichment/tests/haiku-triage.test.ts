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
      expect(callArgs.max_tokens).toBe(512);
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

  // ===== Session 22: New structured output fields (#1,#2,#3,#7,#8) =====

  describe('structured evidence chain (#1)', () => {
    it('parses score_justification from response', async () => {
      const response = { ...VALID_TRIAGE_RESPONSE, score_justification: 'High VT detection rate combined with abuse reports' };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.scoreJustification).toBe('High VT detection rate combined with abuse reports');
    });

    it('parses evidence_sources from response', async () => {
      const response = {
        ...VALID_TRIAGE_RESPONSE,
        evidence_sources: [
          { provider: 'VirusTotal', data_point: '15/70 detections', interpretation: 'Moderate malicious activity' },
          { provider: 'AbuseIPDB', data_point: '85/100 confidence', interpretation: 'High abuse correlation' },
        ],
      };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.evidenceSources).toHaveLength(2);
      expect(result!.evidenceSources[0].provider).toBe('VirusTotal');
      expect(result!.evidenceSources[0].dataPoint).toBe('15/70 detections');
    });

    it('parses uncertainty_factors from response', async () => {
      const response = { ...VALID_TRIAGE_RESPONSE, uncertainty_factors: ['No sandbox analysis available', 'Limited historical data'] };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.uncertaintyFactors).toHaveLength(2);
      expect(result!.uncertaintyFactors[0]).toBe('No sandbox analysis available');
    });

    it('defaults evidence fields when absent', async () => {
      createMock.mockResolvedValue(mockAIResponse(VALID_TRIAGE_RESPONSE));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.scoreJustification).toBe('');
      expect(result!.evidenceSources).toEqual([]);
      expect(result!.uncertaintyFactors).toEqual([]);
    });
  });

  describe('MITRE ATT&CK extraction (#2)', () => {
    it('parses valid MITRE techniques', async () => {
      const response = {
        ...VALID_TRIAGE_RESPONSE,
        mitre_techniques: [
          { technique_id: 'T1071', name: 'Application Layer Protocol', tactic: 'Command and Control' },
          { technique_id: 'T1071.001', name: 'Web Protocols', tactic: 'Command and Control' },
        ],
      };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.mitreTechniques).toHaveLength(2);
      expect(result!.mitreTechniques[0].techniqueId).toBe('T1071');
      expect(result!.mitreTechniques[1].techniqueId).toBe('T1071.001');
    });

    it('filters out invalid technique IDs', async () => {
      const response = {
        ...VALID_TRIAGE_RESPONSE,
        mitre_techniques: [
          { technique_id: 'T1071', name: 'Valid', tactic: '' },
          { technique_id: 'INVALID', name: 'Bad', tactic: '' },
          { technique_id: 'T123', name: 'Too Short', tactic: '' },
        ],
      };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.mitreTechniques).toHaveLength(1);
      expect(result!.mitreTechniques[0].techniqueId).toBe('T1071');
    });

    it('defaults to empty array when absent', async () => {
      createMock.mockResolvedValue(mockAIResponse(VALID_TRIAGE_RESPONSE));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.mitreTechniques).toEqual([]);
    });
  });

  describe('false positive detection (#3)', () => {
    it('detects false positive and overrides severity to INFO', async () => {
      const response = {
        ...VALID_TRIAGE_RESPONSE,
        is_false_positive: true,
        false_positive_reason: 'IP belongs to Cloudflare CDN',
        severity: 'HIGH',
      };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.isFalsePositive).toBe(true);
      expect(result!.falsePositiveReason).toBe('IP belongs to Cloudflare CDN');
      expect(result!.severity).toBe('INFO');
    });

    it('defaults isFalsePositive to false', async () => {
      createMock.mockResolvedValue(mockAIResponse(VALID_TRIAGE_RESPONSE));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.isFalsePositive).toBe(false);
      expect(result!.falsePositiveReason).toBeNull();
    });

    it('sets falsePositiveReason null when not FP', async () => {
      const response = { ...VALID_TRIAGE_RESPONSE, is_false_positive: false, false_positive_reason: 'should be ignored' };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.falsePositiveReason).toBeNull();
    });
  });

  describe('malware family + threat actor extraction (#7)', () => {
    it('extracts malware families from response', async () => {
      const response = { ...VALID_TRIAGE_RESPONSE, malware_families: ['Cobalt Strike', 'Emotet'] };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.malwareFamilies).toEqual(['Cobalt Strike', 'Emotet']);
    });

    it('extracts attributed actors from response', async () => {
      const response = { ...VALID_TRIAGE_RESPONSE, attributed_actors: ['APT28', 'Lazarus'] };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.attributedActors).toEqual(['APT28', 'Lazarus']);
    });

    it('defaults to empty arrays when absent', async () => {
      createMock.mockResolvedValue(mockAIResponse(VALID_TRIAGE_RESPONSE));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.malwareFamilies).toEqual([]);
      expect(result!.attributedActors).toEqual([]);
    });
  });

  describe('recommended actions (#8)', () => {
    it('parses recommended actions from response', async () => {
      const response = {
        ...VALID_TRIAGE_RESPONSE,
        recommended_actions: [
          { action: 'Block IP at firewall', priority: 'immediate' },
          { action: 'Monitor related domains', priority: 'short_term' },
        ],
      };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.recommendedActions).toHaveLength(2);
      expect(result!.recommendedActions[0].action).toBe('Block IP at firewall');
      expect(result!.recommendedActions[0].priority).toBe('immediate');
    });

    it('limits to max 5 actions', async () => {
      const actions = Array.from({ length: 8 }, (_, i) => ({ action: `Action ${i}`, priority: 'short_term' }));
      const response = { ...VALID_TRIAGE_RESPONSE, recommended_actions: actions };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.recommendedActions).toHaveLength(5);
    });

    it('defaults invalid priority to short_term', async () => {
      const response = {
        ...VALID_TRIAGE_RESPONSE,
        recommended_actions: [{ action: 'Investigate', priority: 'INVALID' }],
      };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.recommendedActions[0].priority).toBe('short_term');
    });

    it('filters out empty actions', async () => {
      const response = {
        ...VALID_TRIAGE_RESPONSE,
        recommended_actions: [{ action: '', priority: 'immediate' }, { action: 'Valid action', priority: 'short_term' }],
      };
      createMock.mockResolvedValue(mockAIResponse(response));

      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      const result = await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);
      expect(result!.recommendedActions).toHaveLength(1);
      expect(result!.recommendedActions[0].action).toBe('Valid action');
    });
  });

  describe('max_tokens increased to 512', () => {
    it('sends max_tokens=512 for structured output', async () => {
      const provider = new HaikuTriageProvider('sk-ant-key', true, logger);
      await provider.triage('ip', '1.2.3.4', VT_RESULT, ABUSE_RESULT, 50);

      const callArgs = createMock.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(512);
    });
  });
});
