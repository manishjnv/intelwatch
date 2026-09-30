/**
 * @module services/real-seeder
 * @description Seeds new tenants with real data via HTTP calls to service APIs.
 * Subscribes to global catalog feeds, creates private starter feeds, and triggers
 * initial fetches so new tenants pull live threat data from day one. No fabricated
 * sample entities (DECISION-048: real tenants never get fabricated data).
 */
import { getLogger } from '../logger.js';
import type { ServiceClient } from './service-client.js';

// ─── Types ──────────────────────────────────────────────────────

export interface RealSeederDeps {
  ingestionClient: ServiceClient;
}

export interface SeedResult {
  seederUsed: 'real';
  globalSubscriptions: number;
  privateFeeds: number;
  fetchesTriggered: number;
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

// ─── Default Alert Config ───────────────────────────────────────

// Alert config reserved for future use when alerting service is wired
const _DEFAULT_ALERT_CONFIG = {
  minSeverity: 'high',
  minConfidence: 60,
  iocTypes: [] as string[],
};
void _DEFAULT_ALERT_CONFIG;

// ─── RealSeeder Class ───────────────────────────────────────────

export class RealSeeder {
  private clients: RealSeederDeps | null = null;

  /** Inject service clients (set at startup after config loaded). */
  setClients(deps: RealSeederDeps): void {
    this.clients = deps;
  }

  /**
   * Full onboarding seed: subscribe to global feeds, create private feeds,
   * and trigger fetches. Captures errors without throwing.
   */
  async seedTenant(tenantId: string, planTier: string): Promise<SeedResult> {
    const result: SeedResult = {
      seederUsed: 'real',
      globalSubscriptions: 0,
      privateFeeds: 0,
      fetchesTriggered: 0,
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
    _tenantId: string,
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
    _tenantId: string, feedIds: string[],
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
}
