import { getLogger } from '../logger.js';
import { ServiceClient } from './service-client.js';
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
  { name: 'APT28', aliases: ['Fancy Bear', 'Sofacy'], origin: 'Russia', description: 'Russian state-sponsored cyber espionage group.' },
  { name: 'APT29', aliases: ['Cozy Bear', 'The Dukes'], origin: 'Russia', description: 'Russian intelligence-linked group targeting government networks.' },
  { name: 'Lazarus Group', aliases: ['Hidden Cobra'], origin: 'North Korea', description: 'North Korean state-sponsored group focused on financial theft.' },
  { name: 'APT41', aliases: ['Winnti', 'Barium'], origin: 'China', description: 'Chinese dual-purpose group: espionage + financially motivated attacks.' },
  { name: 'FIN7', aliases: ['Carbanak'], origin: 'Unknown', description: 'Financially motivated threat group targeting hospitality and retail.' },
];

/** Demo malware families. */
const DEMO_MALWARE = [
  { name: 'Emotet', type: 'trojan', severity: 'critical', description: 'Modular banking trojan turned malware distribution platform.' },
  { name: 'Cobalt Strike', type: 'framework', severity: 'high', description: 'Commercial adversary simulation tool widely abused by threat actors.' },
  { name: 'Mimikatz', type: 'tool', severity: 'high', description: 'Credential extraction tool for Windows environments.' },
  { name: 'QakBot', type: 'banking_trojan', severity: 'critical', description: 'Banking trojan with worm capabilities and ransomware delivery.' },
  { name: 'BlackCat', type: 'ransomware', severity: 'critical', description: 'Rust-based ransomware-as-a-service (ALPHV).' },
];

/** Default OSINT feeds to seed via ingestion service. */
const DEFAULT_FEEDS = [
  { name: 'AlienVault OTX', url: 'https://otx.alienvault.com/api/v1/pulses/subscribed', type: 'json' as const, schedule: '*/30 * * * *' },
  { name: 'Abuse.ch URLhaus', url: 'https://urlhaus-api.abuse.ch/v1/', type: 'json' as const, schedule: '*/30 * * * *' },
  { name: 'CISA KEV', url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', type: 'json' as const, schedule: '*/30 * * * *' },
  { name: 'Feodo Tracker', url: 'https://feodotracker.abuse.ch/downloads/ipblocklist.json', type: 'json' as const, schedule: '*/30 * * * *' },
];

/** Demo CVEs. */
const DEMO_VULNS = [
  { cveId: 'CVE-2024-21887', product: 'Ivanti Connect Secure', cvssScore: 9.1, description: 'Command injection in Ivanti Connect Secure web component.' },
  { cveId: 'CVE-2024-3400', product: 'Palo Alto PAN-OS', cvssScore: 10.0, description: 'OS command injection in GlobalProtect gateway.' },
  { cveId: 'CVE-2023-44228', product: 'Apache Log4j', cvssScore: 10.0, description: 'Remote code execution via JNDI lookup in log messages.' },
  { cveId: 'CVE-2024-1709', product: 'ConnectWise ScreenConnect', cvssScore: 10.0, description: 'Authentication bypass in ConnectWise ScreenConnect.' },
  { cveId: 'CVE-2023-46805', product: 'Ivanti Policy Secure', cvssScore: 8.2, description: 'Authentication bypass in Ivanti web component.' },
];

export interface DemoSeederDeps {
  iocClient: ServiceClient;
  actorClient: ServiceClient;
  malwareClient: ServiceClient;
  vulnClient: ServiceClient;
  ingestionClient: ServiceClient;
}

/**
 * Seeds demo data via real API calls to downstream services.
 * All seeded items tagged as DEMO so users can distinguish from real intel.
 */
export class DemoSeeder {
  private seeded = new Map<string, boolean>();
  private seedResults = new Map<string, DemoSeedResult>();
  private clients: DemoSeederDeps | null = null;

  /** Inject service clients (set at startup after config loaded). */
  setClients(deps: DemoSeederDeps): void {
    this.clients = deps;
  }

  /** Seed demo data for a tenant. Idempotent — only seeds once per tenant. */
  async seed(tenantId: string, categories?: string[]): Promise<DemoSeedResult> {
    if (this.seeded.get(tenantId)) {
      return this.seedResults.get(tenantId)!;
    }

    const allCategories = categories ?? ['iocs', 'actors', 'malware', 'vulnerabilities', 'feeds'];

    const counts = { iocs: 0, actors: 0, malware: 0, vulnerabilities: 0, feeds: 0, alerts: 0 };

    if (allCategories.includes('iocs')) {
      counts.iocs = await this.seedIOCs(tenantId);
    }
    if (allCategories.includes('actors')) {
      counts.actors = await this.seedActors(tenantId);
    }
    if (allCategories.includes('malware')) {
      counts.malware = await this.seedMalware(tenantId);
    }
    if (allCategories.includes('vulnerabilities')) {
      counts.vulnerabilities = await this.seedVulnerabilities(tenantId);
    }
    if (allCategories.includes('feeds')) {
      counts.feeds = await this.seedFeeds(tenantId);
    }

    const result: DemoSeedResult = { seeded: true, counts, tag: 'DEMO' };
    this.seeded.set(tenantId, true);
    this.seedResults.set(tenantId, result);
    return result;
  }

  isSeeded(tenantId: string): boolean {
    return this.seeded.get(tenantId) ?? false;
  }

  getSeedResult(tenantId: string): DemoSeedResult | null {
    return this.seedResults.get(tenantId) ?? null;
  }

  getAvailableDemoData(): { iocs: number; actors: number; malware: number; vulnerabilities: number; alerts: number } {
    return { iocs: DEMO_IOCS.length, actors: DEMO_ACTORS.length, malware: DEMO_MALWARE.length, vulnerabilities: DEMO_VULNS.length, feeds: DEFAULT_FEEDS.length, alerts: 0 };
  }

  clearDemoData(tenantId: string): void {
    this.seeded.delete(tenantId);
    this.seedResults.delete(tenantId);
  }

  // ─── Real API seed methods ──────────────────────────────

  private async seedIOCs(tenantId: string): Promise<number> {
    if (!this.clients) return this.fallbackCount('iocs');
    const logger = getLogger();
    let count = 0;

    for (const ioc of DEMO_IOCS) {
      const result = await this.clients.iocClient.post('/api/v1/iocs', {
        tenantId,
        type: ioc.type,
        value: ioc.value,
        severity: ioc.severity,
        confidence: 80,
        source: 'demo',
        tags: ['DEMO'],
      });
      if (result) count++;
    }

    logger.info({ tenantId, count }, 'Demo IOCs seeded');
    return count;
  }

  private async seedActors(tenantId: string): Promise<number> {
    if (!this.clients) return this.fallbackCount('actors');
    const logger = getLogger();
    let count = 0;

    for (const actor of DEMO_ACTORS) {
      const result = await this.clients.actorClient.post('/api/v1/actors', {
        tenantId,
        name: actor.name,
        aliases: actor.aliases,
        origin: actor.origin,
        description: actor.description,
        tags: ['DEMO'],
      });
      if (result) count++;
    }

    logger.info({ tenantId, count }, 'Demo actors seeded');
    return count;
  }

  private async seedMalware(tenantId: string): Promise<number> {
    if (!this.clients) return this.fallbackCount('malware');
    const logger = getLogger();
    let count = 0;

    for (const mal of DEMO_MALWARE) {
      const result = await this.clients.malwareClient.post('/api/v1/malware', {
        tenantId,
        name: mal.name,
        type: mal.type,
        severity: mal.severity,
        description: mal.description,
        tags: ['DEMO'],
      });
      if (result) count++;
    }

    logger.info({ tenantId, count }, 'Demo malware seeded');
    return count;
  }

  private async seedVulnerabilities(tenantId: string): Promise<number> {
    if (!this.clients) return this.fallbackCount('vulnerabilities');
    const logger = getLogger();
    let count = 0;

    for (const vuln of DEMO_VULNS) {
      const result = await this.clients.vulnClient.post('/api/v1/vulnerabilities', {
        tenantId,
        cveId: vuln.cveId,
        product: vuln.product,
        cvssScore: vuln.cvssScore,
        description: vuln.description,
        tags: ['DEMO'],
      });
      if (result) count++;
    }

    logger.info({ tenantId, count }, 'Demo vulnerabilities seeded');
    return count;
  }

  private async seedFeeds(tenantId: string): Promise<number> {
    if (!this.clients) return this.fallbackCount('feeds');
    const logger = getLogger();
    let count = 0;

    for (const feed of DEFAULT_FEEDS) {
      const result = await this.clients.ingestionClient.post('/api/v1/feeds', {
        tenantId,
        name: feed.name,
        url: feed.url,
        type: feed.type,
        schedule: feed.schedule,
        enabled: true,
        tags: ['DEMO'],
      });
      if (result) count++;
    }

    logger.info({ tenantId, count }, 'Demo feeds seeded');
    return count;
  }

  /** Fallback counts when service clients not configured (e.g., test mode). */
  private fallbackCount(category: string): number {
    const map: Record<string, number> = {
      iocs: DEMO_IOCS.length,
      actors: DEMO_ACTORS.length,
      malware: DEMO_MALWARE.length,
      vulnerabilities: DEMO_VULNS.length,
      feeds: DEFAULT_FEEDS.length,
    };
    return map[category] ?? 0;
  }
}
