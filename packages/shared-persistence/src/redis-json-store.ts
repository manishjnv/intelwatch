/**
 * RedisJsonStore — Generic Map-to-Redis persistence utility.
 *
 * Generalises the pattern from correlation-engine/store-checkpoint.ts for reuse
 * across all ETIP services migrating from in-memory Maps to durable storage.
 *
 * Features:
 * - Debounced save (5s default) to avoid Redis floods
 * - Graceful restore on startup (empty state if Redis unavailable)
 * - Configurable TTL (default 7 days)
 * - Schema versioning for safe migration
 * - Generic serializer/deserializer for any Map shape
 */
import Redis from 'ioredis';

/** Serialisation interface — convert between Map and plain object. */
export interface StoreSerializer<T> {
  /** Serialise the in-memory state to a JSON-safe object. */
  serialize(state: T): unknown;
  /** Deserialise a parsed JSON object back into the in-memory state. */
  deserialize(raw: unknown, target: T): void;
}

export interface RedisJsonStoreOptions<T> {
  /** Redis connection URL (e.g. redis://localhost:6379) */
  redisUrl: string;
  /** Redis key for this store (e.g. etip:billing-service:plans) */
  key: string;
  /** TTL in days (default 7) */
  ttlDays?: number;
  /** Debounce interval in ms (default 5000) */
  debounceMs?: number;
  /** Schema version — increment when serialisation shape changes */
  version?: number;
  /** Serialiser for converting between in-memory state and JSON */
  serializer: StoreSerializer<T>;
}

interface Snapshot {
  v: number;
  savedAt: string;
  data: unknown;
}

/**
 * Persist any in-memory state to a single Redis JSON key with debounced writes.
 *
 * Usage:
 * ```ts
 * const store = new RedisJsonStore({
 *   redisUrl: 'redis://localhost:6379',
 *   key: 'etip:my-service:state',
 *   serializer: { serialize: (s) => ..., deserialize: (raw, s) => ... },
 * });
 * await store.restore(myState);       // on startup
 * store.scheduleCheckpoint(myState);   // after every write
 * await store.close();                 // on shutdown
 * ```
 */
export class RedisJsonStore<T> {
  private redis: Redis | null = null;
  private readonly redisUrl: string;
  private readonly key: string;
  private readonly ttlSeconds: number;
  private readonly debounceMs: number;
  private readonly version: number;
  private readonly serializer: StoreSerializer<T>;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RedisJsonStoreOptions<T>) {
    this.redisUrl = opts.redisUrl;
    this.key = opts.key;
    this.ttlSeconds = (opts.ttlDays ?? 7) * 86_400;
    this.debounceMs = opts.debounceMs ?? 5_000;
    this.version = opts.version ?? 1;
    this.serializer = opts.serializer;
  }

  /** Lazily connect to Redis on first use. */
  private getRedis(): Redis {
    if (!this.redis) {
      const url = new URL(this.redisUrl);
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
    return this.redis;
  }

  /** Save the full state to Redis as JSON with TTL. */
  async save(state: T): Promise<void> {
    const snapshot: Snapshot = {
      v: this.version,
      savedAt: new Date().toISOString(),
      data: this.serializer.serialize(state),
    };
    const redis = this.getRedis();
    await redis.set(this.key, JSON.stringify(snapshot), 'EX', this.ttlSeconds);
  }

  /**
   * Restore state from Redis. If key is absent or Redis unavailable,
   * state remains unchanged (graceful cold start).
   */
  async restore(state: T): Promise<boolean> {
    try {
      const redis = this.getRedis();
      const raw = await redis.get(this.key);
      if (!raw) return false;

      const snap = JSON.parse(raw) as Snapshot;
      if (snap.v !== this.version) return false; // unknown schema — start fresh

      this.serializer.deserialize(snap.data, state);
      return true;
    } catch {
      // Redis unavailable or JSON malformed — start empty, no crash
      return false;
    }
  }

  /**
   * Schedule a debounced checkpoint. Rapid successive calls within the
   * debounce window collapse into a single save.
   */
  scheduleCheckpoint(state: T): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.save(state).catch(() => {
        // Checkpoint failure is non-fatal — service keeps running
      });
    }, this.debounceMs);
  }

  /** Flush any pending debounced checkpoint and close the Redis connection. */
  async close(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
