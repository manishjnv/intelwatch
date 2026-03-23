import { describe, it, expect, beforeEach } from 'vitest';
import { CredentialLeakDetector } from '../src/services/credential-leak-detector.js';
import { DRPStore } from '../src/schemas/store.js';

describe('DRP Service — #5 Credential Leak Detector', () => {
  let store: DRPStore;
  let detector: CredentialLeakDetector;

  beforeEach(() => {
    store = new DRPStore();
    detector = new CredentialLeakDetector(store);
  });

  // 5.1 checkDomain returns leaks for known domains
  it('5.1 checkDomain returns leaks for known domains', () => {
    // The isDomainInBreach check is deterministic based on domain/breach name lengths.
    // Try a domain that will match at least some breaches.
    const leaks = detector.checkDomain('tenant-1', 'example.com');
    // The method matches ~40% of breaches deterministically;
    // we just need it to be an array (may be empty for some domains).
    expect(Array.isArray(leaks)).toBe(true);

    // Try multiple domains to ensure at least one yields results
    const domains = ['test.com', 'corp.io', 'acme.org', 'ab.co', 'longdomainname.net'];
    const allLeaks = domains.flatMap((d) => detector.checkDomain('tenant-1', d));
    expect(allLeaks.length).toBeGreaterThan(0);
  });

  // 5.2 leaks have required fields (id, breachName, breachDate, etc.)
  it('5.2 leaks have required fields', () => {
    const domains = ['test.com', 'corp.io', 'acme.org', 'ab.co', 'longdomainname.net'];
    const allLeaks = domains.flatMap((d) => detector.checkDomain('tenant-1', d));
    expect(allLeaks.length).toBeGreaterThan(0);

    for (const leak of allLeaks) {
      expect(leak.id).toBeDefined();
      expect(typeof leak.id).toBe('string');
      expect(leak.breachName).toBeDefined();
      expect(typeof leak.breachName).toBe('string');
      expect(leak.breachDate).toBeDefined();
      expect(typeof leak.breachDate).toBe('string');
      expect(leak.emailDomain).toBeDefined();
      expect(leak.exposedCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(leak.dataTypes)).toBe(true);
      expect(leak.severity).toBeDefined();
      expect(['critical', 'high', 'medium', 'low', 'info']).toContain(leak.severity);
      expect(leak.source).toBe('simulated-breach-db');
      expect(leak.detectedAt).toBeDefined();
    }
  });

  // 5.3 classifySeverity returns critical for plaintext passwords
  it('5.3 classifySeverity returns critical for plaintext passwords', () => {
    const severity = detector.classifySeverity(['email', 'password_plaintext'], 1000);
    expect(severity).toBe('critical');
  });

  // 5.4 classifySeverity returns critical for credit card data
  it('5.4 classifySeverity returns critical for credit card data', () => {
    const severity = detector.classifySeverity(['email', 'credit_card'], 500);
    expect(severity).toBe('critical');
  });

  // 5.5 classifySeverity returns high for password hashes
  it('5.5 classifySeverity returns high for password hashes (small breach)', () => {
    // password_hash with count <= 100_000 => high
    const severity = detector.classifySeverity(['email', 'password_hash'], 50_000);
    expect(severity).toBe('high');
  });

  // 5.6 classifySeverity returns high for api_key exposure
  it('5.6 classifySeverity returns high for api_key exposure', () => {
    const severity = detector.classifySeverity(['email', 'api_key'], 500);
    expect(severity).toBe('high');
  });

  // 5.7 classifySeverity returns medium for small breaches
  it('5.7 classifySeverity returns medium for small breaches without sensitive data', () => {
    // No passwords, no financial, no api keys, count > 10_000 but <= 1_000_000
    const severity = detector.classifySeverity(['email', 'username'], 50_000);
    expect(severity).toBe('medium');
  });

  // 5.8 classifySeverity returns low for email-only breach
  it('5.8 classifySeverity returns low for email-only breach with small count', () => {
    // email-only, count <= 10_000
    const severity = detector.classifySeverity(['email'], 500);
    expect(severity).toBe('low');
  });

  // 5.9 checkEmails deduplicates by domain
  it('5.9 checkEmails deduplicates by domain', () => {
    const emails = [
      'alice@test.com',
      'bob@test.com',
      'carol@test.com',
    ];
    const leaks = detector.checkEmails('tenant-1', emails);
    // All emails share the same domain, so checkDomain should only be called once.
    // Check that we don't get triplicate results — count should match single-domain check.
    const singleDomainLeaks = detector.checkDomain('tenant-1', 'test.com');
    expect(leaks.length).toBe(singleDomainLeaks.length);
  });

  // 5.10 leaksToAlertInputs produces valid inputs with signals
  it('5.10 leaksToAlertInputs produces valid alert inputs with signals', () => {
    const domains = ['test.com', 'corp.io', 'acme.org', 'ab.co', 'longdomainname.net'];
    const allLeaks = domains.flatMap((d) => detector.checkDomain('tenant-1', d));
    expect(allLeaks.length).toBeGreaterThan(0);

    const alertInputs = detector.leaksToAlertInputs('asset-1', allLeaks);
    expect(alertInputs.length).toBe(allLeaks.length);

    for (const input of alertInputs) {
      expect(input.assetId).toBe('asset-1');
      expect(input.type).toBe('credential_leak');
      expect(input.title).toBeDefined();
      expect(input.description).toBeDefined();
      expect(input.detectedValue).toBeDefined();
      expect(input.sourceUrl).toMatch(/^breach-db:\/\//);
      expect(input.evidence.length).toBeGreaterThanOrEqual(1);
      expect(input.signals.length).toBe(4);
      // Verify signal types
      const signalTypes = input.signals.map((s) => s.signalType);
      expect(signalTypes).toContain('breach_severity');
      expect(signalTypes).toContain('exposed_count');
      expect(signalTypes).toContain('password_included');
      expect(signalTypes).toContain('breach_recency');
    }
  });

  // 5.11 breach_recency signal is higher for recent breaches
  it('5.11 breach_recency signal is higher for recent breaches', () => {
    const recentLeak = {
      id: 'leak-1',
      breachName: 'RecentBreach',
      breachDate: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0]!, // 10 days ago
      emailDomain: 'test.com',
      exposedCount: 100_000,
      dataTypes: ['email', 'password_hash'],
      severity: 'high' as const,
      source: 'test',
      detectedAt: new Date().toISOString(),
    };

    const oldLeak = {
      id: 'leak-2',
      breachName: 'OldBreach',
      breachDate: '2023-01-01', // very old
      emailDomain: 'test.com',
      exposedCount: 100_000,
      dataTypes: ['email', 'password_hash'],
      severity: 'high' as const,
      source: 'test',
      detectedAt: new Date().toISOString(),
    };

    const recentAlerts = detector.leaksToAlertInputs('asset-1', [recentLeak]);
    const oldAlerts = detector.leaksToAlertInputs('asset-1', [oldLeak]);

    const recentRecency = recentAlerts[0]!.signals.find((s) => s.signalType === 'breach_recency')!;
    const oldRecency = oldAlerts[0]!.signals.find((s) => s.signalType === 'breach_recency')!;

    expect(recentRecency.rawValue).toBeGreaterThan(oldRecency.rawValue);
  });

  // 5.12 exposed_count signal scales with count
  it('5.12 exposed_count signal scales with count', () => {
    const smallLeak = {
      id: 'leak-s',
      breachName: 'Small',
      breachDate: '2025-01-01',
      emailDomain: 'test.com',
      exposedCount: 1000,
      dataTypes: ['email'],
      severity: 'low' as const,
      source: 'test',
      detectedAt: new Date().toISOString(),
    };

    const largeLeak = {
      id: 'leak-l',
      breachName: 'Large',
      breachDate: '2025-01-01',
      emailDomain: 'test.com',
      exposedCount: 5_000_000,
      dataTypes: ['email'],
      severity: 'low' as const,
      source: 'test',
      detectedAt: new Date().toISOString(),
    };

    const smallAlerts = detector.leaksToAlertInputs('asset-1', [smallLeak]);
    const largeAlerts = detector.leaksToAlertInputs('asset-1', [largeLeak]);

    const smallCount = smallAlerts[0]!.signals.find((s) => s.signalType === 'exposed_count')!;
    const largeCount = largeAlerts[0]!.signals.find((s) => s.signalType === 'exposed_count')!;

    expect(largeCount.rawValue).toBeGreaterThan(smallCount.rawValue);
    // exposed_count is clamped to max 1 (via Math.min(1, count / 1_000_000))
    expect(largeCount.rawValue).toBeLessThanOrEqual(1);
    expect(smallCount.rawValue).toBeGreaterThanOrEqual(0);
  });
});
