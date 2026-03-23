import type { DemoSeedResult } from '../schemas/onboarding.js';

/** Demo IOC samples covering all types. */
const DEMO_IOCS = [
  { type: 'ip', value: '185.220.101.34', severity: 'high' },
  { type: 'ip', value: '45.33.32.156', severity: 'medium' },
  { type: 'ip', value: '198.51.100.23', severity: 'low' },
  { type: 'domain', value: 'evil-phishing.example.com', severity: 'critical' },
  { type: 'domain', value: 'c2-beacon.malware.test', severity: 'high' },
  { type: 'url', value: 'https://malware-drop.example.com/payload.exe', severity: 'critical' },
  { type: 'sha256', value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', severity: 'medium' },
  { type: 'md5', value: 'd41d8cd98f00b204e9800998ecf8427e', severity: 'low' },
  { type: 'email', value: 'phisher@malicious-domain.test', severity: 'high' },
  { type: 'cve', value: 'CVE-2024-21887', severity: 'critical' },
];

/** Demo threat actors. */
const DEMO_ACTORS = [
  { name: 'APT28', aliases: ['Fancy Bear', 'Sofacy'], origin: 'Russia' },
  { name: 'APT29', aliases: ['Cozy Bear', 'The Dukes'], origin: 'Russia' },
  { name: 'Lazarus Group', aliases: ['Hidden Cobra'], origin: 'North Korea' },
  { name: 'APT41', aliases: ['Winnti', 'Barium'], origin: 'China' },
  { name: 'FIN7', aliases: ['Carbanak'], origin: 'Unknown' },
];

/** Demo malware families. */
const DEMO_MALWARE = [
  { name: 'Emotet', type: 'trojan', severity: 'critical' },
  { name: 'Cobalt Strike', type: 'framework', severity: 'high' },
  { name: 'Mimikatz', type: 'tool', severity: 'high' },
  { name: 'QakBot', type: 'banking_trojan', severity: 'critical' },
  { name: 'BlackCat', type: 'ransomware', severity: 'critical' },
];

/** Demo CVEs. */
const DEMO_VULNS = [
  { cve: 'CVE-2024-21887', product: 'Ivanti Connect Secure', cvss: 9.1 },
  { cve: 'CVE-2024-3400', product: 'Palo Alto PAN-OS', cvss: 10.0 },
  { cve: 'CVE-2023-44228', product: 'Apache Log4j', cvss: 10.0 },
  { cve: 'CVE-2024-1709', product: 'ConnectWise ScreenConnect', cvss: 10.0 },
  { cve: 'CVE-2023-46805', product: 'Ivanti Policy Secure', cvss: 8.2 },
];

/** Demo DRP alerts. */
const DEMO_ALERTS = [
  { type: 'typosquat', target: 'intelwatch.in', detected: 'inte1watch.in', severity: 'high' },
  { type: 'credential_leak', source: 'dark_web_forum', count: 23, severity: 'critical' },
  { type: 'brand_impersonation', platform: 'social_media', severity: 'medium' },
];

/**
 * P0 #7: Seeds demo data for first-time users.
 * All seeded items tagged as DEMO so users can distinguish from real intel.
 */
export class DemoSeeder {
  /** tenantId → seeded flag */
  private seeded = new Map<string, boolean>();
  /** tenantId → seed results */
  private seedResults = new Map<string, DemoSeedResult>();

  /** Seed demo data for a tenant. Idempotent — only seeds once per tenant. */
  seed(tenantId: string, categories?: string[]): DemoSeedResult {
    if (this.seeded.get(tenantId)) {
      return this.seedResults.get(tenantId)!;
    }

    const allCategories = categories ?? ['iocs', 'actors', 'malware', 'vulnerabilities', 'alerts'];

    const counts = {
      iocs: 0,
      actors: 0,
      malware: 0,
      vulnerabilities: 0,
      alerts: 0,
    };

    if (allCategories.includes('iocs')) {
      counts.iocs = this.seedIOCs(tenantId);
    }
    if (allCategories.includes('actors')) {
      counts.actors = this.seedActors(tenantId);
    }
    if (allCategories.includes('malware')) {
      counts.malware = this.seedMalware(tenantId);
    }
    if (allCategories.includes('vulnerabilities')) {
      counts.vulnerabilities = this.seedVulnerabilities(tenantId);
    }
    if (allCategories.includes('alerts')) {
      counts.alerts = this.seedAlerts(tenantId);
    }

    const result: DemoSeedResult = { seeded: true, counts, tag: 'DEMO' };
    this.seeded.set(tenantId, true);
    this.seedResults.set(tenantId, result);
    return result;
  }

  /** Check if demo data has been seeded. */
  isSeeded(tenantId: string): boolean {
    return this.seeded.get(tenantId) ?? false;
  }

  /** Get the seed result for a tenant. */
  getSeedResult(tenantId: string): DemoSeedResult | null {
    return this.seedResults.get(tenantId) ?? null;
  }

  /** Get available demo data counts. */
  getAvailableDemoData(): {
    iocs: number;
    actors: number;
    malware: number;
    vulnerabilities: number;
    alerts: number;
  } {
    return {
      iocs: DEMO_IOCS.length * 15, // 10 templates × 15 = 150 IOCs
      actors: DEMO_ACTORS.length * 2, // 5 × 2 = 10 actors
      malware: DEMO_MALWARE.length * 4, // 5 × 4 = 20 malware
      vulnerabilities: DEMO_VULNS.length * 10, // 5 × 10 = 50 CVEs
      alerts: DEMO_ALERTS.length, // 3 alerts (5 DRP alerts total with variants)
    };
  }

  /** Clear demo data for a tenant. */
  clearDemoData(tenantId: string): void {
    this.seeded.delete(tenantId);
    this.seedResults.delete(tenantId);
  }

  // ─── Private seed methods (in-memory simulation) ──────

  private seedIOCs(_tenantId: string): number {
    // In production: call ingestion-service API to create tagged IOCs
    // For Phase 6: simulate seeding 150 IOCs from 10 templates
    return DEMO_IOCS.length * 15; // 150
  }

  private seedActors(_tenantId: string): number {
    return DEMO_ACTORS.length * 2; // 10
  }

  private seedMalware(_tenantId: string): number {
    return DEMO_MALWARE.length * 4; // 20
  }

  private seedVulnerabilities(_tenantId: string): number {
    return DEMO_VULNS.length * 10; // 50
  }

  private seedAlerts(_tenantId: string): number {
    return 5;
  }
}
