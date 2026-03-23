import { describe, it, expect, beforeEach } from 'vitest';
import { AttackSurfaceScanner } from '../src/services/attack-surface-scanner.js';
import { DRPStore } from '../src/schemas/store.js';
import type { ExposedService } from '../src/schemas/drp.js';

describe('DRP Service — #6 Attack Surface Scanner', () => {
  let store: DRPStore;
  let scanner: AttackSurfaceScanner;

  beforeEach(() => {
    store = new DRPStore();
    scanner = new AttackSurfaceScanner(store);
  });

  /** Helper to build an ExposedService with overrides. */
  function makeService(overrides: Partial<ExposedService> = {}): ExposedService {
    return {
      id: 'svc-1',
      host: 'example.com',
      port: 80,
      protocol: 'tcp',
      service: 'http',
      version: '8.0',
      isVulnerable: false,
      certificateExpiry: null,
      riskScore: 0,
      detectedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  // 6.1 scanDomain returns services array
  it('6.1 scanDomain returns services array', () => {
    const result = scanner.scanDomain('tenant-1', 'example.com', {
      portRange: 'common',
      checkCerts: false,
      checkDns: false,
    });
    expect(Array.isArray(result.services)).toBe(true);
    // Simulated ~30% open rate across 17 common ports, so we expect at least some
    // (though randomness may yield 0 on rare occasions, so we just check array type)
  });

  // 6.2 services have required fields (id, host, port, etc.)
  it('6.2 services have required fields', () => {
    // Run scan multiple times to increase chance of getting services
    let services: ExposedService[] = [];
    for (let i = 0; i < 5 && services.length === 0; i++) {
      const result = scanner.scanDomain('tenant-1', 'example.com', {
        portRange: 'common',
        checkCerts: false,
        checkDns: false,
      });
      services = result.services;
    }

    // Validate fields on any returned services
    for (const svc of services) {
      expect(svc.id).toBeDefined();
      expect(typeof svc.host).toBe('string');
      expect(typeof svc.port).toBe('number');
      expect(typeof svc.protocol).toBe('string');
      expect(typeof svc.service).toBe('string');
      expect(typeof svc.isVulnerable).toBe('boolean');
      expect(typeof svc.riskScore).toBe('number');
      expect(svc.detectedAt).toBeDefined();
    }
  });

  // 6.3 scanDomain returns certificates when checkCerts=true
  it('6.3 scanDomain returns certificates when checkCerts=true', () => {
    const result = scanner.scanDomain('tenant-1', 'example.com', {
      portRange: 'web',
      checkCerts: true,
      checkDns: false,
    });
    expect(Array.isArray(result.certificates)).toBe(true);
    expect(result.certificates.length).toBeGreaterThan(0);

    for (const cert of result.certificates) {
      expect(cert.subject).toBeDefined();
      expect(cert.issuer).toBeDefined();
      expect(cert.validFrom).toBeDefined();
      expect(cert.validTo).toBeDefined();
      expect(typeof cert.isExpired).toBe('boolean');
      expect(cert.serialNumber).toBeDefined();
    }
  });

  // 6.4 scanDomain returns no certificates when checkCerts=false
  it('6.4 scanDomain returns no certificates when checkCerts=false', () => {
    const result = scanner.scanDomain('tenant-1', 'example.com', {
      portRange: 'common',
      checkCerts: false,
      checkDns: false,
    });
    expect(result.certificates).toEqual([]);
  });

  // 6.5 scanDomain returns DNS records when checkDns=true
  it('6.5 scanDomain returns DNS records when checkDns=true', () => {
    const result = scanner.scanDomain('tenant-1', 'example.com', {
      portRange: 'web',
      checkCerts: false,
      checkDns: true,
    });
    expect(Array.isArray(result.dnsRecords)).toBe(true);
    // At minimum we get A, MX, NS, TXT = 4 records
    expect(result.dnsRecords.length).toBeGreaterThanOrEqual(4);

    for (const rec of result.dnsRecords) {
      expect(rec.type).toBeDefined();
      expect(rec.name).toBeDefined();
      expect(rec.value).toBeDefined();
    }
  });

  // 6.6 scanDomain returns no DNS records when checkDns=false
  it('6.6 scanDomain returns no DNS records when checkDns=false', () => {
    const result = scanner.scanDomain('tenant-1', 'example.com', {
      portRange: 'common',
      checkCerts: false,
      checkDns: false,
    });
    expect(result.dnsRecords).toEqual([]);
  });

  // 6.7 classifyServiceRisk returns higher risk for telnet
  it('6.7 classifyServiceRisk returns higher risk for telnet', () => {
    const telnet = makeService({ service: 'telnet', port: 23 });
    const http = makeService({ service: 'http', port: 80 });

    const telnetRisk = scanner.classifyServiceRisk(telnet);
    const httpRisk = scanner.classifyServiceRisk(http);

    expect(telnetRisk).toBeGreaterThan(httpRisk);
  });

  // 6.8 classifyServiceRisk returns higher risk for rdp
  it('6.8 classifyServiceRisk returns higher risk for rdp', () => {
    const rdp = makeService({ service: 'rdp', port: 3389 });
    const https = makeService({ service: 'https', port: 443 });

    const rdpRisk = scanner.classifyServiceRisk(rdp);
    const httpsRisk = scanner.classifyServiceRisk(https);

    expect(rdpRisk).toBeGreaterThan(httpsRisk);
  });

  // 6.9 classifyServiceRisk considers version age
  it('6.9 classifyServiceRisk considers version age (old version = higher risk)', () => {
    const oldVersion = makeService({ version: '2.0' });
    const newVersion = makeService({ version: '8.0' });

    const oldRisk = scanner.classifyServiceRisk(oldVersion);
    const newRisk = scanner.classifyServiceRisk(newVersion);

    expect(oldRisk).toBeGreaterThan(newRisk);
  });

  // 6.10 classifyServiceRisk considers cert expiry
  it('6.10 classifyServiceRisk considers cert expiry (expired cert = higher risk)', () => {
    const expired = makeService({
      certificateExpiry: new Date(Date.now() - 86400000).toISOString(), // yesterday
    });
    const valid = makeService({
      certificateExpiry: new Date(Date.now() + 180 * 86400000).toISOString(), // 180 days from now
    });

    const expiredRisk = scanner.classifyServiceRisk(expired);
    const validRisk = scanner.classifyServiceRisk(valid);

    expect(expiredRisk).toBeGreaterThan(validRisk);
  });

  // 6.11 classifyServiceRisk considers vulnerability flag
  it('6.11 classifyServiceRisk considers vulnerability flag', () => {
    const vulnerable = makeService({ isVulnerable: true });
    const safe = makeService({ isVulnerable: false });

    const vulnRisk = scanner.classifyServiceRisk(vulnerable);
    const safeRisk = scanner.classifyServiceRisk(safe);

    expect(vulnRisk).toBeGreaterThan(safeRisk);
  });

  // 6.12 servicesToAlertInputs only creates alerts for risky services
  it('6.12 servicesToAlertInputs only creates alerts for risky services (riskScore >= 0.3)', () => {
    const lowRisk = makeService({ riskScore: 0.1, service: 'http' });
    const highRisk = makeService({ riskScore: 0.5, service: 'telnet', port: 23, id: 'svc-2' });

    const inputs = scanner.servicesToAlertInputs('asset-1', [lowRisk, highRisk]);

    // Only the high-risk service should generate an alert
    expect(inputs.length).toBe(1);
    expect(inputs[0]!.title).toContain('telnet');
  });

  // 6.13 alert inputs have correct signals
  it('6.13 alert inputs have correct signals', () => {
    const svc = makeService({ riskScore: 0.5, service: 'telnet', port: 23, version: '2.0' });
    const inputs = scanner.servicesToAlertInputs('asset-1', [svc]);

    expect(inputs.length).toBe(1);
    const alert = inputs[0]!;

    expect(alert.assetId).toBe('asset-1');
    expect(alert.type).toBe('exposed_service');
    expect(alert.evidence.length).toBeGreaterThanOrEqual(1);

    const signalTypes = alert.signals.map((s) => s.signalType);
    expect(signalTypes).toContain('service_risk');
    expect(signalTypes).toContain('version_outdated');
    expect(signalTypes).toContain('high_risk_port');

    // telnet is a high-risk service, so service_risk should be 0.85
    const serviceRisk = alert.signals.find((s) => s.signalType === 'service_risk')!;
    expect(serviceRisk.rawValue).toBe(0.85);

    // version 2.0 < 5.0, so version_outdated should be 0.7
    const versionSignal = alert.signals.find((s) => s.signalType === 'version_outdated')!;
    expect(versionSignal.rawValue).toBe(0.7);
  });

  // 6.14 web port range scans fewer ports
  it('6.14 web port range scans fewer ports than common range', () => {
    // We can't easily count scanned ports, but we can observe that web range
    // only scans ports 80, 443, 8080, 8443 (4 ports) vs common (17 ports).
    // Run many times and compare average service counts.
    let webTotal = 0;
    let commonTotal = 0;
    const runs = 20;

    for (let i = 0; i < runs; i++) {
      const webResult = scanner.scanDomain('tenant-1', `web${i}.com`, {
        portRange: 'web',
        checkCerts: false,
        checkDns: false,
      });
      const commonResult = scanner.scanDomain('tenant-1', `common${i}.com`, {
        portRange: 'common',
        checkCerts: false,
        checkDns: false,
      });
      webTotal += webResult.services.length;
      commonTotal += commonResult.services.length;
    }

    // With 4 ports at ~30-80% open vs 17 ports at ~30% open,
    // common should find more on average.
    // This is probabilistic, so we just check web <= common (very likely over 20 runs).
    expect(webTotal).toBeLessThanOrEqual(commonTotal);
  });

  // 6.15 risk scores are bounded 0-1
  it('6.15 risk scores are bounded 0-1', () => {
    // Create a maximally risky service
    const maxRisk = makeService({
      service: 'telnet',
      port: 23,
      version: null,
      isVulnerable: true,
      certificateExpiry: new Date(Date.now() - 86400000).toISOString(),
    });

    const risk = scanner.classifyServiceRisk(maxRisk);
    expect(risk).toBeGreaterThanOrEqual(0);
    expect(risk).toBeLessThanOrEqual(1);

    // Create a minimally risky service
    const minRisk = makeService({
      service: 'https',
      port: 443,
      version: '14.2',
      isVulnerable: false,
      certificateExpiry: null,
    });

    const lowRisk = scanner.classifyServiceRisk(minRisk);
    expect(lowRisk).toBeGreaterThanOrEqual(0);
    expect(lowRisk).toBeLessThanOrEqual(1);
  });
});
