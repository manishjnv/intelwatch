import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShodanClient, type ShodanIpResult } from '../src/enrichment/shodan-client.js';

function buildShodanResult(overrides: Partial<ShodanIpResult> = {}): ShodanIpResult {
  return {
    ip: '1.2.3.4',
    hostnames: ['example.com'],
    org: 'Test Org',
    isp: 'Test ISP',
    os: 'Linux',
    ports: [22, 80, 443],
    vulns: [],
    country: 'US',
    city: 'New York',
    lastUpdate: '2026-03-01T00:00:00Z',
    tags: [],
    ...overrides,
  };
}

describe('ShodanClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('enrichIp', () => {
    it('returns parsed ShodanIpResult on successful API call', async () => {
      const client = new ShodanClient('test-key');
      const apiData = {
        ip_str: '1.2.3.4',
        hostnames: ['example.com'],
        org: 'Test Org',
        isp: 'Test ISP',
        os: 'Linux',
        ports: [22, 80],
        vulns: ['CVE-2024-1234'],
        country_name: 'US',
        city: 'NYC',
        last_update: '2026-03-01',
        tags: ['cloud'],
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiData),
      });

      const result = await client.enrichIp('1.2.3.4');

      expect(result).not.toBeNull();
      expect(result!.ip).toBe('1.2.3.4');
      expect(result!.org).toBe('Test Org');
      expect(result!.ports).toEqual([22, 80]);
      expect(result!.vulns).toEqual(['CVE-2024-1234']);
      expect(result!.tags).toEqual(['cloud']);
    });

    it('returns null when no API key is set', async () => {
      const client = new ShodanClient(undefined);
      // Clear env too
      const prev = process.env['TI_SHODAN_API_KEY'];
      delete process.env['TI_SHODAN_API_KEY'];

      const result = await client.enrichIp('1.2.3.4');

      expect(result).toBeNull();
      if (prev) process.env['TI_SHODAN_API_KEY'] = prev;
    });

    it('returns null on API error (non-ok response)', async () => {
      const client = new ShodanClient('test-key');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

      const result = await client.enrichIp('1.2.3.4');

      expect(result).toBeNull();
    });

    it('returns null on fetch timeout/error', async () => {
      const client = new ShodanClient('test-key');
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('AbortError'));

      const result = await client.enrichIp('1.2.3.4');

      expect(result).toBeNull();
    });
  });

  describe('isAvailable', () => {
    it('returns true when API key is set', () => {
      expect(new ShodanClient('key').isAvailable()).toBe(true);
    });

    it('returns false when no API key', () => {
      const prev = process.env['TI_SHODAN_API_KEY'];
      delete process.env['TI_SHODAN_API_KEY'];
      expect(new ShodanClient(undefined).isAvailable()).toBe(false);
      if (prev) process.env['TI_SHODAN_API_KEY'] = prev;
    });
  });

  describe('extractRiskIndicators', () => {
    it('calculates high risk for many open ports + vulns', () => {
      const result = buildShodanResult({
        ports: [22, 80, 443, 8080, 8443, 3306, 5432],
        vulns: ['CVE-2024-1', 'CVE-2024-2', 'CVE-2024-3', 'CVE-2024-4'],
      });

      const risk = ShodanClient.extractRiskIndicators(result);

      expect(risk.openPorts).toBe(7);
      expect(risk.hasKnownVulns).toBe(true);
      expect(risk.vulnCount).toBe(4);
      // 20 + min(35,30) + min(40,40) = 90
      expect(risk.riskScore).toBe(90);
    });

    it('calculates low risk for clean host', () => {
      const result = buildShodanResult({
        ports: [443],
        vulns: [],
        tags: [],
      });

      const risk = ShodanClient.extractRiskIndicators(result);

      expect(risk.openPorts).toBe(1);
      expect(risk.hasKnownVulns).toBe(false);
      // 20 + 5 + 0 = 25
      expect(risk.riskScore).toBe(25);
    });

    it('adds +15 for Tor exit nodes', () => {
      const result = buildShodanResult({
        ports: [9001],
        vulns: [],
        tags: ['tor'],
      });

      const risk = ShodanClient.extractRiskIndicators(result);

      expect(risk.isTorExit).toBe(true);
      // 20 + 5 + 0 + 15 = 40
      expect(risk.riskScore).toBe(40);
    });
  });
});
