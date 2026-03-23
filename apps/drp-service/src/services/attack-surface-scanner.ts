import { randomUUID } from 'node:crypto';
import type { DRPStore } from '../schemas/store.js';
import type { ExposedService, AlertEvidence } from '../schemas/drp.js';

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 3306, 3389, 5432, 8080, 8443];
const WEB_PORTS = [80, 443, 8080, 8443];

const SERVICE_MAP: Record<number, { name: string; protocol: string }> = {
  21: { name: 'ftp', protocol: 'tcp' },
  22: { name: 'ssh', protocol: 'tcp' },
  23: { name: 'telnet', protocol: 'tcp' },
  25: { name: 'smtp', protocol: 'tcp' },
  53: { name: 'dns', protocol: 'udp' },
  80: { name: 'http', protocol: 'tcp' },
  110: { name: 'pop3', protocol: 'tcp' },
  143: { name: 'imap', protocol: 'tcp' },
  443: { name: 'https', protocol: 'tcp' },
  445: { name: 'smb', protocol: 'tcp' },
  993: { name: 'imaps', protocol: 'tcp' },
  995: { name: 'pop3s', protocol: 'tcp' },
  3306: { name: 'mysql', protocol: 'tcp' },
  3389: { name: 'rdp', protocol: 'tcp' },
  5432: { name: 'postgresql', protocol: 'tcp' },
  8080: { name: 'http-alt', protocol: 'tcp' },
  8443: { name: 'https-alt', protocol: 'tcp' },
};

const HIGH_RISK_SERVICES = ['telnet', 'ftp', 'rdp', 'smb', 'mysql', 'postgresql'];
const VERSIONS = ['1.0', '2.0', '3.0', '5.6', '7.4', '8.0', '8.1', '14.2', null];

/** Attack surface discovery with simulated scanning. */
export class AttackSurfaceScanner {
  constructor(_store: DRPStore) {
    // Store reserved for future persistence
  }

  /** Scan a domain for exposed services, certificates, and DNS. */
  scanDomain(
    _tenantId: string,
    domain: string,
    config: { portRange: string; checkCerts: boolean; checkDns: boolean },
  ): {
    services: ExposedService[];
    certificates: CertInfo[];
    dnsRecords: DNSRecord[];
  } {
    const ports = config.portRange === 'web' ? WEB_PORTS : COMMON_PORTS;
    const services = this.simulatePortScan(domain, ports);
    const certificates = config.checkCerts ? this.simulateCertCheck(domain) : [];
    const dnsRecords = config.checkDns ? this.simulateDNSEnum(domain) : [];

    return { services, certificates, dnsRecords };
  }

  /** Classify risk for an exposed service. */
  classifyServiceRisk(service: ExposedService): number {
    let risk = 0;

    // High-risk service type
    if (HIGH_RISK_SERVICES.includes(service.service)) risk += 0.35;

    // Version outdated (simulated: null version = unknown = risky)
    if (!service.version) risk += 0.15;
    else if (parseFloat(service.version) < 5.0) risk += 0.20;

    // Certificate expired
    if (service.certificateExpiry) {
      const expiry = new Date(service.certificateExpiry);
      if (expiry < new Date()) risk += 0.30;
      else {
        const daysToExpiry = (expiry.getTime() - Date.now()) / 86400000;
        if (daysToExpiry < 30) risk += 0.15;
      }
    }

    // Known vulnerable (simulated)
    if (service.isVulnerable) risk += 0.30;

    return Math.min(1, risk);
  }

  /** Convert scan results to alert inputs. */
  servicesToAlertInputs(
    assetId: string,
    services: ExposedService[],
  ): Array<{
    assetId: string;
    type: 'exposed_service';
    title: string;
    description: string;
    detectedValue: string;
    evidence: AlertEvidence[];
    signals: Array<{ signalType: string; rawValue: number; description: string }>;
  }> {
    // Only create alerts for risky services
    const riskyServices = services.filter((s) => s.riskScore >= 0.3);

    return riskyServices.map((svc) => ({
      assetId,
      type: 'exposed_service' as const,
      title: `Exposed ${svc.service} on ${svc.host}:${svc.port}`,
      description: `${svc.service} service detected on ${svc.host}:${svc.port} (${svc.protocol}). Version: ${svc.version ?? 'unknown'}. Vulnerable: ${svc.isVulnerable}.`,
      detectedValue: `${svc.host}:${svc.port}`,
      evidence: [{
        id: randomUUID(),
        type: 'scan_result' as const,
        title: `Port scan: ${svc.host}:${svc.port}`,
        data: { host: svc.host, port: svc.port, service: svc.service, version: svc.version, isVulnerable: svc.isVulnerable },
        collectedAt: svc.detectedAt,
      }],
      signals: [
        { signalType: 'service_risk', rawValue: HIGH_RISK_SERVICES.includes(svc.service) ? 0.85 : 0.3, description: `Service: ${svc.service}` },
        { signalType: 'version_outdated', rawValue: svc.version && parseFloat(svc.version) < 5 ? 0.7 : 0.1, description: `Version: ${svc.version ?? 'unknown'}` },
        { signalType: 'high_risk_port', rawValue: svc.port < 1024 ? 0.5 : 0.2, description: `Port: ${svc.port}` },
      ],
    }));
  }

  /** Simulated port scan. */
  private simulatePortScan(domain: string, ports: number[]): ExposedService[] {
    const services: ExposedService[] = [];
    const now = new Date().toISOString();

    for (const port of ports) {
      // Simulate: ~30% of ports are open
      if (!this.isPortOpen(domain, port)) continue;

      const svcInfo = SERVICE_MAP[port] ?? { name: 'unknown', protocol: 'tcp' };
      const version = VERSIONS[Math.floor(Math.random() * VERSIONS.length)] ?? null;
      const isVulnerable = Math.random() < 0.2;
      const certExpiry = port === 443 || port === 8443
        ? this.simulateCertExpiry()
        : null;

      const svc: ExposedService = {
        id: randomUUID(),
        host: domain,
        port,
        protocol: svcInfo.protocol,
        service: svcInfo.name,
        version,
        isVulnerable,
        certificateExpiry: certExpiry,
        riskScore: 0,
        detectedAt: now,
      };
      svc.riskScore = this.classifyServiceRisk(svc);
      services.push(svc);
    }

    return services;
  }

  /** Simulated certificate transparency check. */
  private simulateCertCheck(domain: string): CertInfo[] {
    const certs: CertInfo[] = [];
    const count = 1 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i++) {
      const daysOffset = Math.floor(Math.random() * 730) - 365;
      const expiry = new Date(Date.now() + daysOffset * 86400000);
      certs.push({
        subject: i === 0 ? domain : `*.${domain}`,
        issuer: ['Let\'s Encrypt', 'DigiCert', 'Cloudflare', 'Sectigo'][Math.floor(Math.random() * 4)]!,
        validFrom: new Date(expiry.getTime() - 365 * 86400000).toISOString(),
        validTo: expiry.toISOString(),
        isExpired: expiry < new Date(),
        serialNumber: randomUUID().replace(/-/g, '').slice(0, 20),
      });
    }

    return certs;
  }

  /** Simulated DNS enumeration. */
  private simulateDNSEnum(domain: string): DNSRecord[] {
    const records: DNSRecord[] = [
      { type: 'A', name: domain, value: `${100 + Math.floor(Math.random() * 155)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` },
      { type: 'MX', name: domain, value: `mail.${domain}` },
      { type: 'NS', name: domain, value: `ns1.${domain}` },
      { type: 'TXT', name: domain, value: `v=spf1 include:_spf.google.com ~all` },
    ];

    // Simulate some subdomains
    const subs = ['www', 'mail', 'api', 'dev', 'staging', 'admin', 'vpn'];
    for (const sub of subs) {
      if (Math.random() < 0.4) {
        records.push({
          type: 'A',
          name: `${sub}.${domain}`,
          value: `${100 + Math.floor(Math.random() * 155)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        });
      }
    }

    return records;
  }

  /** Simulated: is port open? */
  private isPortOpen(_domain: string, port: number): boolean {
    // Web ports more likely open
    if (port === 80 || port === 443) return Math.random() < 0.8;
    return Math.random() < 0.3;
  }

  /** Simulated certificate expiry. */
  private simulateCertExpiry(): string {
    const daysOffset = Math.floor(Math.random() * 400) - 30;
    return new Date(Date.now() + daysOffset * 86400000).toISOString();
  }
}

export interface CertInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  isExpired: boolean;
  serialNumber: string;
}

export interface DNSRecord {
  type: string;
  name: string;
  value: string;
}
