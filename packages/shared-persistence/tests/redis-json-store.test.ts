import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisJsonStore } from '../src/redis-json-store.js';
import type { StoreSerializer } from '../src/redis-json-store.js';

// ── Mock ioredis ──────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockQuit = vi.fn();

vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      get = mockGet;
      set = mockSet;
      quit = mockQuit;
    },
  };
});

// ── Test state shape ──────────────────────────────────────────────────

interface TestState {
  items: Map<string, { name: string; value: number }>;
  counter: number;
}

const testSerializer: StoreSerializer<TestState> = {
  serialize(state) {
    const items: Record<string, { name: string; value: number }> = {};
    for (const [k, v] of state.items) items[k] = v;
    return { items, counter: state.counter };
  },
  deserialize(raw, target) {
    const data = raw as { items: Record<string, { name: string; value: number }>; counter: number };
    for (const [k, v] of Object.entries(data.items)) {
      target.items.set(k, v);
    }
    target.counter = data.counter;
  },
};

function createTestState(): TestState {
  return { items: new Map(), counter: 0 };
}

function createStore(overrides: Partial<ConstructorParameters<typeof RedisJsonStore<TestState>>[0]> = {}) {
  return new RedisJsonStore<TestState>({
    redisUrl: 'redis://localhost:6379',
    key: 'etip:test:state',
    serializer: testSerializer,
    debounceMs: 50, // fast debounce for tests
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('RedisJsonStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue('OK');
    mockQuit.mockResolvedValue('OK');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  // ── save() ────────────────────────────────────────────────────────

  describe('save', () => {
    it('serialises state and writes to Redis with TTL', async () => {
      const store = createStore();
      const state = createTestState();
      state.items.set('ioc-1', { name: 'test-ioc', value: 42 });
      state.counter = 5;

      await store.save(state);

      expect(mockSet).toHaveBeenCalledOnce();
      const [key, json, ex, ttl] = mockSet.mock.calls[0];
      expect(key).toBe('etip:test:state');
      expect(ex).toBe('EX');
      expect(ttl).toBe(7 * 86_400); // default 7 days

      const snapshot = JSON.parse(json as string);
      expect(snapshot.v).toBe(1);
      expect(snapshot.savedAt).toBeDefined();
      expect(snapshot.data.items['ioc-1']).toEqual({ name: 'test-ioc', value: 42 });
      expect(snapshot.data.counter).toBe(5);

      await store.close();
    });

    it('uses custom TTL when configured', async () => {
      const store = createStore({ ttlDays: 14 });
      const state = createTestState();

      await store.save(state);

      const [, , , ttl] = mockSet.mock.calls[0];
      expect(ttl).toBe(14 * 86_400);

      await store.close();
    });

    it('includes custom version in snapshot', async () => {
      const store = createStore({ version: 3 });
      const state = createTestState();

      await store.save(state);

      const snapshot = JSON.parse(mockSet.mock.calls[0][1] as string);
      expect(snapshot.v).toBe(3);

      await store.close();
    });
  });

  // ── restore() ─────────────────────────────────────────────────────

  describe('restore', () => {
    it('restores state from Redis snapshot', async () => {
      const store = createStore();
      const snapshot = {
        v: 1,
        savedAt: '2026-03-26T00:00:00.000Z',
        data: {
          items: { 'ioc-2': { name: 'restored', value: 99 } },
          counter: 10,
        },
      };
      mockGet.mockResolvedValue(JSON.stringify(snapshot));

      const state = createTestState();
      const restored = await store.restore(state);

      expect(restored).toBe(true);
      expect(state.items.get('ioc-2')).toEqual({ name: 'restored', value: 99 });
      expect(state.counter).toBe(10);

      await store.close();
    });

    it('returns false when key is absent', async () => {
      const store = createStore();
      mockGet.mockResolvedValue(null);

      const state = createTestState();
      const restored = await store.restore(state);

      expect(restored).toBe(false);
      expect(state.items.size).toBe(0);

      await store.close();
    });

    it('returns false for version mismatch', async () => {
      const store = createStore({ version: 2 });
      const snapshot = { v: 1, savedAt: '2026-03-26T00:00:00.000Z', data: {} };
      mockGet.mockResolvedValue(JSON.stringify(snapshot));

      const state = createTestState();
      const restored = await store.restore(state);

      expect(restored).toBe(false);

      await store.close();
    });

    it('returns false gracefully on Redis error', async () => {
      const store = createStore();
      mockGet.mockRejectedValue(new Error('connection refused'));

      const state = createTestState();
      const restored = await store.restore(state);

      expect(restored).toBe(false);
      expect(state.items.size).toBe(0);

      await store.close();
    });

    it('returns false on malformed JSON', async () => {
      const store = createStore();
      mockGet.mockResolvedValue('not-valid-json{{{');

      const state = createTestState();
      const restored = await store.restore(state);

      expect(restored).toBe(false);

      await store.close();
    });
  });

  // ── scheduleCheckpoint() ──────────────────────────────────────────

  describe('scheduleCheckpoint', () => {
    it('debounces multiple calls into a single save', async () => {
      const store = createStore({ debounceMs: 50 });
      const state = createTestState();
      state.counter = 1;

      store.scheduleCheckpoint(state);
      store.scheduleCheckpoint(state);
      store.scheduleCheckpoint(state);

      // Wait for debounce
      await new Promise((r) => setTimeout(r, 100));

      expect(mockSet).toHaveBeenCalledOnce();

      await store.close();
    });

    it('does not crash when save fails during checkpoint', async () => {
      const store = createStore({ debounceMs: 10 });
      mockSet.mockRejectedValue(new Error('write failed'));

      const state = createTestState();
      store.scheduleCheckpoint(state);

      // Wait for debounce — should not throw
      await new Promise((r) => setTimeout(r, 50));

      await store.close();
    });
  });

  // ── close() ───────────────────────────────────────────────────────

  describe('close', () => {
    it('clears pending debounce timer on close', async () => {
      const store = createStore({ debounceMs: 5000 });
      const state = createTestState();

      store.scheduleCheckpoint(state);
      await store.close();

      // Wait past the debounce — should NOT have saved
      await new Promise((r) => setTimeout(r, 50));
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('calls redis.quit on close', async () => {
      const store = createStore();
      // Force Redis initialisation
      await store.save(createTestState());

      await store.close();

      expect(mockQuit).toHaveBeenCalledOnce();
    });

    it('handles close when redis was never initialised', async () => {
      const store = createStore();
      // Never called save/restore, so redis is null
      await expect(store.close()).resolves.not.toThrow();
    });
  });

  // ── Empty state serialisation ─────────────────────────────────────

  describe('empty state', () => {
    it('saves and restores empty state correctly', async () => {
      const store = createStore();
      const emptyState = createTestState();

      await store.save(emptyState);

      const json = mockSet.mock.calls[0][1] as string;
      mockGet.mockResolvedValue(json);

      const restoredState = createTestState();
      const ok = await store.restore(restoredState);

      expect(ok).toBe(true);
      expect(restoredState.items.size).toBe(0);
      expect(restoredState.counter).toBe(0);

      await store.close();
    });
  });

  // ── Round-trip with populated state ──────────────────────────────

  describe('round-trip', () => {
    it('serialises and deserialises populated state identically', async () => {
      const store = createStore();
      const original = createTestState();
      original.items.set('a', { name: 'alpha', value: 1 });
      original.items.set('b', { name: 'beta', value: 2 });
      original.items.set('c', { name: 'gamma', value: 3 });
      original.counter = 42;

      await store.save(original);

      const json = mockSet.mock.calls[0][1] as string;
      mockGet.mockResolvedValue(json);

      const restored = createTestState();
      await store.restore(restored);

      expect(restored.items.size).toBe(3);
      expect(restored.items.get('a')).toEqual({ name: 'alpha', value: 1 });
      expect(restored.items.get('b')).toEqual({ name: 'beta', value: 2 });
      expect(restored.items.get('c')).toEqual({ name: 'gamma', value: 3 });
      expect(restored.counter).toBe(42);

      await store.close();
    });
  });
});
