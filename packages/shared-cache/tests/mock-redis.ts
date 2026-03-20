/**
 * @module @etip/shared-cache/tests/mock-redis
 * @description Minimal in-memory Redis mock for unit testing CacheService.
 * Implements only the methods used by CacheService.
 */
import type Redis from 'ioredis';

interface StoreEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * In-memory mock of ioredis for deterministic unit tests.
 * Does NOT require a running Redis server.
 */
export class MockRedis {
  private store = new Map<string, StoreEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: null });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async exists(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return 0;
    }
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    if (remaining <= 0) {
      this.store.delete(key);
      return -2;
    }
    return remaining;
  }

  async scan(
    cursor: string,
    _match: string,
    pattern: string,
    _count: string,
    _countVal: number
  ): Promise<[string, string[]]> {
    // Simple mock: return all matching keys in one batch
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matched: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key)) matched.push(key);
    }
    return ['0', matched]; // cursor '0' = done
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  /** Test helper: get store size */
  get size(): number {
    return this.store.size;
  }

  /** Test helper: clear all entries */
  clear(): void {
    this.store.clear();
  }
}

/** Cast MockRedis to ioredis Redis type for use in CacheService */
export function createMockRedis(): Redis {
  return new MockRedis() as unknown as Redis;
}
