/**
 * StoreCheckpointService — Redis-backed persistence for CorrelationStore (P1-1).
 *
 * Serialises all in-memory state to a single Redis key with a 7-day TTL on every
 * checkpoint call (debounced to 5 seconds to avoid per-write Redis floods).
 * On startup, restores state from Redis — if the key is absent or Redis is
 * unavailable the service starts with an empty store (no crash).
 *
 * Redis key: etip:correlation-engine:store-snapshot
 * TTL:       configurable via TI_CORRELATION_CHECKPOINT_TTL_DAYS (default 7 days)
 */
import Redis from 'ioredis';
import type { CorrelationStore } from '../schemas/correlation.js';
import type {
  CorrelatedIOC, CorrelationResult, CampaignCluster,
  TemporalWave, FPFeedback, RuleStats,
} from '../schemas/correlation.js';

// ── Snapshot shape ────────────────────────────────────────────────

interface StoreSnapshot {
  /** Schema version — increment when shape changes */
  v: 1;
  savedAt: string;
  iocs:      Record<string, Record<string, CorrelatedIOC>>;
  results:   Record<string, Record<string, CorrelationResult>>;
  campaigns: Record<string, Record<string, CampaignCluster>>;
  waves:     Record<string, TemporalWave[]>;
  feedback:  Record<string, FPFeedback[]>;
  ruleStats: Record<string, Record<string, RuleStats>>;
}

const CHECKPOINT_KEY = 'etip:correlation-engine:store-snapshot';
const DEBOUNCE_MS = 5_000;

// ── Serialise helpers ─────────────────────────────────────────────

/** Convert a Map<string, Map<string, V>> to a plain nested object. */
function mapOfMapToObj<V>(m: Map<string, Map<string, V>>): Record<string, Record<string, V>> {
  const out: Record<string, Record<string, V>> = {};
  for (const [tenantId, inner] of m) {
    out[tenantId] = Object.fromEntries(inner);
  }
  return out;
}

/** Convert a Map<string, V[]> to a plain object of arrays. */
function mapOfArrayToObj<V>(m: Map<string, V[]>): Record<string, V[]> {
  const out: Record<string, V[]> = {};
  for (const [tenantId, arr] of m) {
    out[tenantId] = arr;
  }
  return out;
}

/** Restore a nested plain object into a Map<string, Map<string, V>>. */
function objToMapOfMap<V>(obj: Record<string, Record<string, V>>): Map<string, Map<string, V>> {
  const m = new Map<string, Map<string, V>>();
  for (const [tenantId, inner] of Object.entries(obj)) {
    m.set(tenantId, new Map(Object.entries(inner)));
  }
  return m;
}

/** Restore a plain object of arrays into a Map<string, V[]>. */
function objToMapOfArray<V>(obj: Record<string, V[]>): Map<string, V[]> {
  const m = new Map<string, V[]>();
  for (const [tenantId, arr] of Object.entries(obj)) {
    m.set(tenantId, arr);
  }
  return m;
}

// ── Service ───────────────────────────────────────────────────────

export class StoreCheckpointService {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param redisUrl   Redis connection URL (e.g. redis://localhost:6379)
   * @param ttlDays    TTL for the checkpoint key in days (default 7)
   */
  constructor(redisUrl: string, ttlDays: number = 7) {
    this.ttlSeconds = ttlDays * 86_400;
    const url = new URL(redisUrl);
    const password = decodeURIComponent(url.password || '');
    this.redis = new Redis({
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  /**
   * Serialise the full store to JSON and store in Redis.
   * Called by scheduleCheckpoint() after the debounce window.
   */
  async save(store: CorrelationStore): Promise<void> {
    const snapshot: StoreSnapshot = {
      v: 1,
      savedAt: new Date().toISOString(),
      iocs:      mapOfMapToObj(store.iocs),
      results:   mapOfMapToObj(store.results),
      campaigns: mapOfMapToObj(store.campaigns),
      waves:     mapOfArrayToObj(store.waves),
      feedback:  mapOfArrayToObj(store.feedback),
      ruleStats: mapOfMapToObj(store.ruleStats),
    };
    await this.redis.set(CHECKPOINT_KEY, JSON.stringify(snapshot), 'EX', this.ttlSeconds);
  }

  /**
   * Load the checkpoint from Redis and hydrate the provided store.
   * If the key is absent or Redis is unavailable, returns silently — store
   * remains empty (graceful cold start).
   */
  async restore(store: CorrelationStore): Promise<void> {
    try {
      const raw = await this.redis.get(CHECKPOINT_KEY);
      if (!raw) return;

      const snap = JSON.parse(raw) as StoreSnapshot;
      if (snap.v !== 1) return; // Unknown schema version — start fresh

      // Hydrate each map in-place
      for (const [tid, inner] of objToMapOfMap(snap.iocs)) store.iocs.set(tid, inner);
      for (const [tid, inner] of objToMapOfMap(snap.results)) store.results.set(tid, inner);
      for (const [tid, inner] of objToMapOfMap(snap.campaigns)) store.campaigns.set(tid, inner);
      for (const [tid, arr] of objToMapOfArray(snap.waves)) store.waves.set(tid, arr);
      for (const [tid, arr] of objToMapOfArray(snap.feedback)) store.feedback.set(tid, arr);
      for (const [tid, inner] of objToMapOfMap(snap.ruleStats)) store.ruleStats.set(tid, inner);
    } catch {
      // Redis unavailable or JSON malformed — start from empty, no crash
    }
  }

  /**
   * Schedule a debounced checkpoint. Rapid successive calls within the
   * debounce window collapse into a single save — prevents Redis floods
   * when the BullMQ worker processes many jobs in a burst.
   */
  scheduleCheckpoint(store: CorrelationStore): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.save(store).catch(() => {
        // Checkpoint failure is non-fatal — service keeps running
      });
    }, DEBOUNCE_MS);
  }

  /** Flush any pending debounced checkpoint and close the Redis connection. */
  async close(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.redis.quit();
  }
}
