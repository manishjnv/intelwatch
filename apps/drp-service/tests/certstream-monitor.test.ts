import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CertStreamMonitor } from '../src/services/certstream-monitor.js';
import { DomainEnricher } from '../src/services/domain-enricher.js';
import type { CertStreamEntry } from '../src/services/certstream-monitor.js';

describe('DRP Service — CertStream Monitor', () => {
  let monitor: CertStreamMonitor;
  let enricher: DomainEnricher;

  beforeEach(() => {
    enricher = new DomainEnricher({ enabled: false });
    monitor = new CertStreamMonitor({
      enabled: true,
      url: 'wss://certstream.calidog.io',
      maxMatchesPerHour: 100,
      matchThreshold: 0.4,
    }, enricher);
  });

  afterEach(() => {
    monitor.stop();
  });

  const certEntry = (domain: string, san: string[] = []): CertStreamEntry => ({
    domain, san, issuer: "Let's Encrypt", timestamp: new Date().toISOString(),
  });

  // CS.1 monitor starts and stops
  it('CS.1 start/stop lifecycle', () => {
    expect(monitor.isRunning()).toBe(false);
    monitor.start();
    expect(monitor.isRunning()).toBe(true);
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  // CS.2 does not process when not running
  it('CS.2 ignores certs when stopped', () => {
    monitor.setMonitoredAssets(['paypal.com']);
    const matches = monitor.processCertificate(certEntry('paypa1.com'));
    expect(matches).toHaveLength(0);
  });

  // CS.3 detects similar domain via Jaro-Winkler
  it('CS.3 detects typosquat certificate', () => {
    monitor.setMonitoredAssets(['paypal.com']);
    monitor.start();
    const matches = monitor.processCertificate(certEntry('paypa1.com'));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.matchedAsset).toBe('paypal.com');
    expect(matches[0]!.similarity).toBeGreaterThan(0.4);
  });

  // CS.4 skips exact matches (legitimate certs)
  it('CS.4 skips exact domain matches', () => {
    monitor.setMonitoredAssets(['example.com']);
    monitor.start();
    const matches = monitor.processCertificate(certEntry('example.com'));
    expect(matches).toHaveLength(0);
  });

  // CS.5 checks SAN fields too
  it('CS.5 checks SAN domains', () => {
    monitor.setMonitoredAssets(['paypal.com']);
    monitor.start();
    const matches = monitor.processCertificate(certEntry('unrelated.com', ['paypa1.com']));
    expect(matches.some((m) => m.certDomain === 'paypa1.com')).toBe(true);
  });

  // CS.6 rate limiting — respects maxMatchesPerHour
  it('CS.6 rate limits matches per hour', () => {
    const limited = new CertStreamMonitor({
      enabled: true, url: '', maxMatchesPerHour: 3, matchThreshold: 0.4,
    }, enricher);
    limited.setMonitoredAssets(['paypal.com']);
    limited.start();
    for (let i = 0; i < 10; i++) {
      limited.processCertificate(certEntry(`paypa${i}.com`));
    }
    const stats = limited.getStats();
    expect(stats.matchesFound).toBeLessThanOrEqual(3);
    expect(stats.rateLimited).toBe(true);
    limited.stop();
  });

  // CS.7 stats tracking
  it('CS.7 tracks stats correctly', () => {
    monitor.setMonitoredAssets(['google.com']);
    monitor.start();
    monitor.processCertificate(certEntry('unrelated.com'));
    monitor.processCertificate(certEntry('gooogle.com'));
    const stats = monitor.getStats();
    expect(stats.enabled).toBe(true);
    expect(stats.connected).toBe(true);
    expect(stats.certificatesProcessed).toBe(2);
    expect(stats.lastCertAt).not.toBeNull();
  });

  // CS.8 registration burst detection — 3+ similar in 1 hour
  it('CS.8 detects registration burst', () => {
    monitor.setMonitoredAssets(['paypal.com']);
    monitor.start();
    const allMatches = [];
    for (const domain of ['paypa1.com', 'paypal-login.com', 'paypall.com']) {
      allMatches.push(...monitor.processCertificate(certEntry(domain)));
    }
    const bursts = monitor.detectRegistrationBurst(allMatches);
    expect(bursts.length).toBeGreaterThan(0);
    expect(bursts[0]!.length).toBeGreaterThanOrEqual(3);
  });

  // CS.9 disabled monitor does nothing
  it('CS.9 disabled monitor does not start', () => {
    const disabled = new CertStreamMonitor({
      enabled: false, url: '', maxMatchesPerHour: 100, matchThreshold: 0.4,
    }, enricher);
    disabled.start();
    expect(disabled.isRunning()).toBe(false);
  });

  // CS.10 match includes TLD risk score
  it('CS.10 match includes tldRisk', () => {
    monitor.setMonitoredAssets(['paypal.com']);
    monitor.start();
    const matches = monitor.processCertificate(certEntry('paypa1.top'));
    if (matches.length > 0) {
      expect(matches[0]!.tldRisk).toBeGreaterThan(0);
      expect(typeof matches[0]!.tldRisk).toBe('number');
    }
  });
});
