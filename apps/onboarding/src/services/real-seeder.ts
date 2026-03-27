/**
 * @module services/real-seeder
 * @description Seeds new tenants with real data via HTTP calls to service APIs.
 * Subscribes to global catalog feeds, creates private starter feeds, triggers
 * initial fetches, and seeds sample IOCs/actors/malware so new tenants see
 * live-ish data from day one. Falls back gracefully on partial failure.
 */
import { getLogger } from '../logger.js';
import type { ServiceClient } from './service-client.js';

// ─── Types ──────────────────────────────────────────────────────

export interface RealSeederDeps {
  ingestionClient: ServiceClient;
  iocClient: ServiceClient;
  actorClient: ServiceClient;
  malwareClient: ServiceClient;
}

export interface SeedResult {
  seederUsed: 'real';
  globalSubscriptions: number;
  privateFeeds: number;
  fetchesTriggered: number;
  sampleIocs: number;
  sampleActors: number;
  sampleMalware: number;
  errors: string[];
}

interface CatalogFeed {
  id: string;
  name: string;
  feedType: string;
  minPlanTier: string;
  enabled: boolean;
}

// ─── Plan Tier Feed Limits ──────────────────────────────────────

const PLAN_FEED_LIMITS: Record<string, number> = {
  free: 5,
  starter: 10,
  teams: Infinity,
  enterprise: Infinity,
};

const PLAN_TIER_ORDER = ['free', 'starter', 'teams', 'enterprise'];

function tierIndex(tier: string): number {
  const idx = PLAN_TIER_ORDER.indexOf(tier);
  return idx >= 0 ? idx : 0;
}

// ─── Private Starter Feeds ──────────────────────────────────────

const PRIVATE_STARTER_FEEDS = [
  {
    name: 'My RSS Feed - The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    feedType: 'rss',
    schedule: '*/30 * * * *',
  },
  {
    name: 'My RSS Feed - BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
    feedType: 'rss',
    schedule: '*/30 * * * *',
  },
];

// ─── Sample Seed Data ───────────────────────────────────────────

const SAMPLE_IOCS = [
  { type: 'ip', value: '45.33.32.156', severity: 'high', confidence: 75, tags: ['scanner'] },
  { type: 'domain', value: 'evil-phishing-example.com', severity: 'critical', confidence: 90, tags: ['phishing'] },
  { type: 'sha256', value: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', severity: 'medium', confidence: 70, tags: ['malware'] },
  { type: 'cve', value: 'CVE-2024-3400', severity: 'critical', confidence: 95, tags: ['palo-alto'] },
  { type: 'url', value: 'http://malware-distribution.example.com/payload', severity: 'high', confidence: 80, tags: ['c2'] },
];

const SAMPLE_ACTORS = [
  { name: 'APT29', aliases: ['Cozy Bear', 'The Dukes'], origin: 'Russia', description: 'Russian intelligence-linked espionage group.', tags: ['ONBOARDING'] },
  { name: 'Lazarus Group', aliases: ['Hidden Cobra'], origin: 'North Korea', description: 'State-sponsored financial theft and espionage.', tags: ['ONBOARDING'] },
  { name: 'FIN7', aliases: ['Carbanak'], origin: 'Unknown', description: 'Financially motivated group targeting retail/hospitality.', tags: ['ONBOARDING'] },
];

const SAMPLE_MALWARE = [
  { name: 'Emotet', type: 'trojan', severity: 'critical', description: 'Modular banking trojan turned malware distribution platform.', tags: ['ONBOARDING'] },
  { name: 'Cobalt Strike', type: 'c2_framework', severity: 'high', description: 'Commercial adversary simulation tool abused by threat actors.', tags: ['ONBOARDING'] },
  { name: 'Log4Shell Exploit', type: 'exploit', severity: 'critical', description: 'RCE exploit targeting Apache Log4j (CVE-2021-44228).', tags: ['ONBOARDING'] },
];

// ─── Default Alert Config ───────────────────────────────────────

const DEFAULT_ALERT_CONFIG = {
  minSeverity: 'high',
  minConfidence: 60,
  iocTypes: [] as string[],
};

// ─── RealSeeder Class ───────────────────────────────────────────

export class RealSeeder {
  private clients: RealSeederDeps | null = null;

  /** Inject service clients (set at startup after config loaded). */
  setClients(deps: RealSeederDeps): void {
    this.clients = deps;
  }

  /**
   * Full onboarding seed: subscribe to global feeds, create private feeds,
   * trigger fetches, and seed sample entities. Captures errors without throwing.
   */
  async seedTenant(tenantId: string, planTier: string): Promise<SeedResult> {
    const result: SeedResult = {
      seederUsed: 'real',
      globalSubscriptions: 0,
      privateFeeds: 0,
      fetchesTriggered: 0,
      sampleIocs: 0,
      sampleActors: 0,
      sampleMalware: 0,
      errors: [],
    };

    if (!this.clients) {
      result.errors.push('No service clients configured');
      return result;
    }

    const tenantHeaders = { 'x-tenant-id': tenantId };

    // 1. Subscribe to global feeds
    result.globalSubscriptions = await this.subscribeGlobalFeeds(tenantId, planTier, tenantHeaders, result.errors);

    // 2. Create private starter feeds
    const privateFeedIds = await this.createPrivateFeeds(tenantId, tenantHeaders, result.errors);
    result.privateFeeds = privateFeedIds.length;

    // 3. Trigger initial fetch for private feeds
    result.fetchesTriggered = await this.triggerFetches(tenantId, privateFeedIds, tenantHeaders, result.errors);

    // 4. Seed sample entities
    result.sampleIocs = await this.seedSampleIocs(tenantId, tenantHeaders, result.errors);
    result.sampleActors = await this.seedSampleActors(tenantId, tenantHeaders, result.errors);
    result.sampleMalware = await this.seedSampleMalware(tenantId, tenantHeaders, result.errors);

    const logger = getLogger();
    logger.info({ tenantId, planTier, ...result }, 'RealSeeder completed');
    return result;
  }

  // ─── Step 1: Global Feed Subscriptions ──────────────────────

  private async subscribeGlobalFeeds(
    tenantId: string, planTier: string,
    headers: Record<string, string>, errors: string[],
  ): Promise<number> {
    const logger = getLogger();

    // Fetch catalog
    const catalogRes = await this.clients!.ingestionClient.get<{ data: CatalogFeed[] }>(
      '/api/v1/catalog', headers,
    );
    if (!catalogRes?.data) {
      errors.push('Failed to fetch global feed catalog');
      return 0;
    }

    // Filter feeds available for this plan tier
    const tenantTier = tierIndex(planTier);
    const eligible = catalogRes.data
      .filter(f => f.enabled && tierIndex(f.minPlanTier) <= tenantTier);

    // Limit by plan
    const limit = PLAN_FEED_LIMITS[planTier] ?? PLAN_FEED_LIMITS.free;
    const toSubscribe = eligible.slice(0, limit);

    let count = 0;
    for (const feed of toSubscribe) {
      const res = await this.clients!.ingestionClient.post(
        `/api/v1/catalog/${feed.id}/subscribe`, {}, headers,
      );
      if (res) {
        count++;
      } else {
        errors.push(`Failed to subscribe to global feed: ${feed.name}`);
      }
    }

    logger.info({ tenantId, planTier, subscribed: count, eligible: eligible.length }, 'Global feed subscriptions');
    return count;
  }

  // ─── Step 2: Private Starter Feeds ──────────────────────────

  private async createPrivateFeeds(
    tenantId: string,
    headers: Record<string, string>, errors: string[],
  ): Promise<string[]> {
    const feedIds: string[] = [];

    for (const feed of PRIVATE_STARTER_FEEDS) {
      const res = await this.clients!.ingestionClient.post<{ data: { id: string } }>(
        '/api/v1/feeds',
        { ...feed, enabled: true },
        headers,
      );
      if (res?.data?.id) {
        feedIds.push(res.data.id);
      } else {
        errors.push(`Failed to create private feed: ${feed.name}`);
      }
    }

    return feedIds;
  }

  // ─── Step 3: Trigger Initial Fetches ────────────────────────

  private async triggerFetches(
    tenantId: string, feedIds: string[],
    headers: Record<string, string>, errors: string[],
  ): Promise<number> {
    let count = 0;
    for (const feedId of feedIds) {
      const res = await this.clients!.ingestionClient.post(
        `/api/v1/feeds/${feedId}/trigger`, {}, headers,
      );
      if (res) {
        count++;
      } else {
        errors.push(`Failed to trigger fetch for feed: ${feedId}`);
      }
    }
    return count;
  }

  // ─── Step 4: Sample IOCs ───────────────────────────────────

  async seedSampleIocs(
    tenantId: string,
    headers: Record<string, string>, errors: string[],
  ): Promise<number> {
    if (!this.clients) return 0;

    // Check if IOCs already exist (from prior subscriptions)
    const existing = await this.clients.iocClient.get<{ data: unknown[]; total: number }>(
      '/api/v1/iocs?limit=1', headers,
    );
    if (existing && existing.total > 0) {
      getLogger().info({ tenantId }, 'Skipping sample IOCs — global IOCs already present');
      return 0;
    }

    let count = 0;
    for (const ioc of SAMPLE_IOCS) {
      const res = await this.clients.iocClient.post(
        '/api/v1/iocs',
        { ...ioc, source: 'onboarding', tags: [...ioc.tags, 'ONBOARDING'] },
        headers,
      );
      if (res) count++;
      else errors.push(`Failed to seed IOC: ${ioc.value}`);
    }
    return count;
  }

  // ─── Step 5: Sample Actors ─────────────────────────────────

  async seedSampleActors(
    tenantId: string,
    headers: Record<string, string>, errors: string[],
  ): Promise<number> {
    if (!this.clients) return 0;
    let count = 0;
    for (const actor of SAMPLE_ACTORS) {
      const res = await this.clients.actorClient.post('/api/v1/actors', actor, headers);
      if (res) count++;
      else errors.push(`Failed to seed actor: ${actor.name}`);
    }
    return count;
  }

  // ─── Step 6: Sample Malware ────────────────────────────────

  async seedSampleMalware(
    tenantId: string,
    headers: Record<string, string>, errors: string[],
  ): Promise<number> {
    if (!this.clients) return 0;
    let count = 0;
    for (const mal of SAMPLE_MALWARE) {
      const res = await this.clients.malwareClient.post('/api/v1/malware', mal, headers);
      if (res) count++;
      else errors.push(`Failed to seed malware: ${mal.name}`);
    }
    return count;
  }
}
