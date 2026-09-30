import { getLogger } from '../logger.js';
import { ServiceClient } from './service-client.js';
import type { DemoSeedResult } from '../schemas/onboarding.js';
import type { Redis } from 'ioredis';
import { DEMO_IOCS, DEMO_ACTORS, DEMO_MALWARE, DEFAULT_FEEDS, DEMO_VULNS } from './demo-seed-data.js';

const KEY_PREFIX = 'etip:';
const KEY_SUFFIX = ':demo-seeded';

function redisKey(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}${KEY_SUFFIX}`;
}

interface DemoSeedState {
  seeded: boolean;
  result: DemoSeedResult | null;
}

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
  private seeded = new Map<string, boolean>(); // memory-ok: cache — per-process copy of the tenant Redis key (Redis is the source of truth; memory-only when no Redis, i.e. tests)
  private seedResults = new Map<string, DemoSeedResult>(); // memory-ok: cache — per-process copy of the tenant Redis key (Redis is the source of truth; memory-only when no Redis, i.e. tests)
  private clients: DemoSeederDeps | null = null;
  private redis: Redis | null;

  constructor(redis?: Redis | null) {
    this.redis = redis ?? null;
  }

  /** Inject service clients (set at startup after config loaded). */
  setClients(deps: DemoSeederDeps): void {
    this.clients = deps;
  }

  /** Seed demo data for a tenant. Idempotent — only seeds once per tenant. */
  async seed(tenantId: string, categories?: string[]): Promise<DemoSeedResult> {
    const existing = await this.getState(tenantId);
    if (existing?.seeded) {
      return existing.result!;
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
    await this.persist(tenantId, { seeded: true, result });
    return result;
  }

  async isSeeded(tenantId: string): Promise<boolean> {
    const state = await this.getState(tenantId);
    return state?.seeded ?? false;
  }

  async getSeedResult(tenantId: string): Promise<DemoSeedResult | null> {
    const state = await this.getState(tenantId);
    return state?.result ?? null;
  }

  getAvailableDemoData(): { iocs: number; actors: number; malware: number; vulnerabilities: number; feeds: number; feedsFreeTier: number; alerts: number } {
    const freeTierCount = DEFAULT_FEEDS.filter((f) => f.freeTier).length;
    return { iocs: DEMO_IOCS.length, actors: DEMO_ACTORS.length, malware: DEMO_MALWARE.length, vulnerabilities: DEMO_VULNS.length, feeds: DEFAULT_FEEDS.length, feedsFreeTier: freeTierCount, alerts: 0 };
  }

  async clearDemoData(tenantId: string): Promise<void> {
    this.seeded.delete(tenantId);
    this.seedResults.delete(tenantId);
    if (this.redis) {
      await this.redis.del(redisKey(tenantId));
    }
  }

  // ─── Private ──────────────────────────────────────────

  /** Get seed state from cache, then Redis (mirrors WizardStore). */
  private async getState(tenantId: string): Promise<DemoSeedState | null> {
    if (this.seeded.has(tenantId)) {
      return { seeded: this.seeded.get(tenantId)!, result: this.seedResults.get(tenantId) ?? null };
    }

    if (this.redis) {
      const raw = await this.redis.get(redisKey(tenantId));
      if (raw) {
        const state = JSON.parse(raw) as DemoSeedState;
        this.seeded.set(tenantId, state.seeded);
        if (state.result) this.seedResults.set(tenantId, state.result);
        return state;
      }
    }

    return null;
  }

  /** Persist seed state to Redis (if available). */
  private async persist(tenantId: string, state: DemoSeedState): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(redisKey(tenantId), JSON.stringify(state));
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

    // Default: seed only Free-tier feeds (3 feeds)
    const freeTierFeeds = DEFAULT_FEEDS.filter((f) => f.freeTier);
    let count = 0;

    for (const feed of freeTierFeeds) {
      const result = await this.clients.ingestionClient.post('/api/v1/feeds', {
        tenantId,
        name: feed.name,
        url: feed.url || undefined,
        feedType: feed.feedType,
        schedule: feed.schedule,
        parseConfig: feed.parseConfig ?? {},
        enabled: true,
        tags: ['DEMO'],
      });
      if (result) count++;
    }

    logger.info({ tenantId, count, tier: 'free' }, 'Free-tier feeds seeded');
    return count;
  }

  /**
   * Seed additional feeds when tenant is upgraded to Starter+ plan.
   * Only seeds feeds not already present (idempotent).
   */
  async seedUpgradeFeeds(tenantId: string): Promise<number> {
    if (!this.clients) return 0;
    const logger = getLogger();

    const nonFreeFeeds = DEFAULT_FEEDS.filter((f) => !f.freeTier);
    let count = 0;

    for (const feed of nonFreeFeeds) {
      const result = await this.clients.ingestionClient.post('/api/v1/feeds', {
        tenantId,
        name: feed.name,
        url: feed.url || undefined,
        feedType: feed.feedType,
        schedule: feed.schedule,
        parseConfig: feed.parseConfig ?? {},
        enabled: true,
        tags: ['DEMO'],
      });
      if (result) count++;
    }

    logger.info({ tenantId, count, tier: 'upgraded' }, 'Upgrade feeds seeded');
    return count;
  }

  /** Get all DEFAULT_FEEDS with freeTier flag exposed for external use. */
  static getDefaultFeeds(): ReadonlyArray<typeof DEFAULT_FEEDS[number]> {
    return DEFAULT_FEEDS;
  }

  /** Get only Free-tier default feed count. */
  static getFreeTierFeedCount(): number {
    return DEFAULT_FEEDS.filter((f) => f.freeTier).length;
  }

  /** Fallback counts when service clients not configured (e.g., test mode). */
  private fallbackCount(category: string): number {
    const map: Record<string, number> = {
      iocs: DEMO_IOCS.length,
      actors: DEMO_ACTORS.length,
      malware: DEMO_MALWARE.length,
      vulnerabilities: DEMO_VULNS.length,
      feeds: DEFAULT_FEEDS.filter((f) => f.freeTier).length,
    };
    return map[category] ?? 0;
  }
}
