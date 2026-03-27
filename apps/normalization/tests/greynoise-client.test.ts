import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GreyNoiseClient, type GreyNoiseIpResult } from '../src/enrichment/greynoise-client.js';

function buildGnResult(overrides: Partial<GreyNoiseIpResult> = {}): GreyNoiseIpResult {
  return {
    ip: '1.2.3.4',
    noise: false,
    riot: false,
    classification: 'unknown',
    name: '',
    link: 'https://viz.greynoise.io/ip/1.2.3.4',
    lastSeen: '2026-03-01',
    message: 'IP not observed',
    ...overrides,
  };
}

describe('GreyNoiseClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('enrichIp', () => {
    it('returns parsed result on successful API call', async () => {
      const client = new GreyNoiseClient('test-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ip: '1.2.3.4',
          noise: true,
          riot: false,
          classification: 'malicious',
          name: 'Scanner',
          link: 'https://viz.greynoise.io/ip/1.2.3.4',
          last_seen: '2026-03-01',
          message: 'observed scanning',
        }),
      });

      const result = await client.enrichIp('1.2.3.4');

      expect(result).not.toBeNull();
      expect(result!.noise).toBe(true);
      expect(result!.classification).toBe('malicious');
    });

    it('returns null when no API key is set', async () => {
      const prev = process.env['TI_GREYNOISE_API_KEY'];
      delete process.env['TI_GREYNOISE_API_KEY'];
      const client = new GreyNoiseClient(undefined);

      const result = await client.enrichIp('1.2.3.4');

      expect(result).toBeNull();
      if (prev) process.env['TI_GREYNOISE_API_KEY'] = prev;
    });

    it('returns null on API error', async () => {
      const client = new GreyNoiseClient('test-key');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

      const result = await client.enrichIp('1.2.3.4');

      expect(result).toBeNull();
    });
  });

  describe('isAvailable', () => {
    it('returns true with API key', () => {
      expect(new GreyNoiseClient('key').isAvailable()).toBe(true);
    });

    it('returns false without API key', () => {
      const prev = process.env['TI_GREYNOISE_API_KEY'];
      delete process.env['TI_GREYNOISE_API_KEY'];
      expect(new GreyNoiseClient(undefined).isAvailable()).toBe(false);
      if (prev) process.env['TI_GREYNOISE_API_KEY'] = prev;
    });
  });

  describe('assessThreatLevel', () => {
    it('riot=true → isKnownService, confidenceAdjustment=-20', () => {
      const result = buildGnResult({ riot: true, classification: 'benign', name: 'Google DNS' });
      const assessment = GreyNoiseClient.assessThreatLevel(result);

      expect(assessment.isKnownService).toBe(true);
      expect(assessment.confidenceAdjustment).toBe(-20);
    });

    it('classification=malicious → isMalicious, +20 adjustment', () => {
      const result = buildGnResult({ noise: true, classification: 'malicious' });
      const assessment = GreyNoiseClient.assessThreatLevel(result);

      expect(assessment.isMalicious).toBe(true);
      expect(assessment.confidenceAdjustment).toBe(20);
    });

    it('benign scanner (noise=true, classification=benign) → -10 adjustment', () => {
      const result = buildGnResult({ noise: true, classification: 'benign', name: 'Shodan.io' });
      const assessment = GreyNoiseClient.assessThreatLevel(result);

      expect(assessment.isBenignScanner).toBe(true);
      expect(assessment.confidenceAdjustment).toBe(-10);
    });

    it('unknown classification → 0 adjustment', () => {
      const result = buildGnResult({ noise: false, classification: 'unknown' });
      const assessment = GreyNoiseClient.assessThreatLevel(result);

      expect(assessment.isBenignScanner).toBe(false);
      expect(assessment.isMalicious).toBe(false);
      expect(assessment.isKnownService).toBe(false);
      expect(assessment.confidenceAdjustment).toBe(0);
    });
  });
});
