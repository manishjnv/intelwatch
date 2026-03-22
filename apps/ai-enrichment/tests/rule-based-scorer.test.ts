import { describe, it, expect } from 'vitest';
import { ruleBasedScore } from '../src/rule-based-scorer.js';
import type { VTResult, AbuseIPDBResult } from '../src/schema.js';

const VT_HIGH: VTResult = {
  malicious: 40, suspicious: 5, harmless: 20, undetected: 5,
  totalEngines: 70, detectionRate: 57, tags: ['trojan', 'c2'], lastAnalysisDate: '2026-03-20',
};

const VT_LOW: VTResult = {
  malicious: 1, suspicious: 0, harmless: 65, undetected: 4,
  totalEngines: 70, detectionRate: 1, tags: [], lastAnalysisDate: '2026-03-20',
};

const ABUSE_HIGH: AbuseIPDBResult = {
  abuseConfidenceScore: 90, totalReports: 100, numDistinctUsers: 30,
  lastReportedAt: '2026-03-20', isp: 'Evil Hosting', countryCode: 'RU',
  usageType: 'Data Center', isWhitelisted: false, isTor: false,
};

const ABUSE_CDN: AbuseIPDBResult = {
  abuseConfidenceScore: 5, totalReports: 2, numDistinctUsers: 1,
  lastReportedAt: '2026-03-15', isp: 'Cloudflare Inc', countryCode: 'US',
  usageType: 'Content Delivery Network', isWhitelisted: true, isTor: false,
};

const ABUSE_TOR: AbuseIPDBResult = {
  ...ABUSE_HIGH,
  isTor: true, isp: 'Tor Network',
};

describe('ruleBasedScore', () => {
  it('returns high score for high VT + high AbuseIPDB', () => {
    const result = ruleBasedScore('ip', VT_HIGH, ABUSE_HIGH);
    expect(result.riskScore).toBeGreaterThanOrEqual(65);
    expect(result.severity).toBe('HIGH');
  });

  it('returns low score for low VT + null AbuseIPDB', () => {
    const result = ruleBasedScore('hash_sha256', VT_LOW, null);
    expect(result.riskScore).toBeLessThanOrEqual(15);
    expect(result.severity).toBe('INFO');
  });

  it('detects CDN ISP as false positive', () => {
    const result = ruleBasedScore('ip', VT_LOW, ABUSE_CDN);
    expect(result.isFalsePositive).toBe(true);
    expect(result.falsePositiveReason).toContain('Cloudflare');
    expect(result.severity).toBe('INFO');
    expect(result.riskScore).toBeLessThanOrEqual(15);
  });

  it('identifies Tor exit node category', () => {
    const result = ruleBasedScore('ip', VT_HIGH, ABUSE_TOR);
    expect(result.threatCategory).toBe('tor_exit');
  });

  it('infers c2_server from VT tags', () => {
    const result = ruleBasedScore('ip', VT_HIGH, ABUSE_HIGH);
    expect(result.threatCategory).toBe('c2_server');
  });

  it('returns zero cost (no AI used)', () => {
    const result = ruleBasedScore('ip', VT_HIGH, ABUSE_HIGH);
    expect(result.costUsd).toBe(0);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('includes rule_based tag', () => {
    const result = ruleBasedScore('ip', VT_HIGH, ABUSE_HIGH);
    expect(result.tags).toContain('rule_based');
  });

  it('has uncertainty factor about no AI', () => {
    const result = ruleBasedScore('ip', VT_HIGH, ABUSE_HIGH);
    expect(result.uncertaintyFactors.length).toBeGreaterThan(0);
    expect(result.uncertaintyFactors[0]).toContain('rule-based');
  });

  it('returns INFO for null VT and null Abuse', () => {
    const result = ruleBasedScore('domain', null, null);
    expect(result.riskScore).toBe(0);
    expect(result.severity).toBe('INFO');
    expect(result.confidence).toBe(30);
  });

  it('limits confidence to max 100', () => {
    const result = ruleBasedScore('ip', VT_HIGH, ABUSE_HIGH);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThan(30);
  });
});
