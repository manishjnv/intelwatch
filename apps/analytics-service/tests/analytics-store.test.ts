import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsStore } from '../src/services/analytics-store.js';

describe('AnalyticsStore', () => {
  let store: AnalyticsStore;

  beforeEach(() => { store = new AnalyticsStore(); });

  describe('get/set', () => {
    it('returns null for missing key', () => {
      expect(store.get('missing')).toBeNull();
    });

    it('stores and retrieves value', () => {
      store.set('key1', { count: 42 }, 60);
      expect(store.get('key1')).toEqual({ count: 42 });
    });

    it('purgeExpired removes entries past TTL', async () => {
      // Use a 1-second TTL and wait for it to expire
      store.set('short-lived', 'value', 0.001); // 1ms TTL
      await new Promise(r => setTimeout(r, 10)); // wait 10ms
      const purged = store.purgeExpired();
      expect(purged).toBe(1);
      expect(store.get('short-lived')).toBeNull();
    });

    it('handles different value types', () => {
      store.set('string', 'hello', 60);
      store.set('number', 42, 60);
      store.set('array', [1, 2, 3], 60);
      store.set('object', { a: 1 }, 60);
      store.set('boolean', true, 60);
      expect(store.get('string')).toBe('hello');
      expect(store.get('number')).toBe(42);
      expect(store.get('array')).toEqual([1, 2, 3]);
      expect(store.get('object')).toEqual({ a: 1 });
      expect(store.get('boolean')).toBe(true);
    });

    it('overwrites existing key', () => {
      store.set('key1', 'old', 60);
      store.set('key1', 'new', 60);
      expect(store.get('key1')).toBe('new');
    });
  });

  describe('getOrSet', () => {
    it('calls fetcher when cache miss', async () => {
      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });
      const result = await store.getOrSet('key1', 60, fetcher);
      expect(result).toEqual({ data: 'fresh' });
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it('returns cached value without calling fetcher', async () => {
      store.set('key1', { data: 'cached' }, 60);
      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });
      const result = await store.getOrSet('key1', 60, fetcher);
      expect(result).toEqual({ data: 'cached' });
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('removes a specific key', () => {
      store.set('key1', 'val', 60);
      expect(store.invalidate('key1')).toBe(true);
      expect(store.get('key1')).toBeNull();
    });

    it('returns false for missing key', () => {
      expect(store.invalidate('missing')).toBe(false);
    });
  });

  describe('invalidatePrefix', () => {
    it('removes all keys with prefix', () => {
      store.set('dashboard:t1', 'a', 60);
      store.set('dashboard:t2', 'b', 60);
      store.set('trends:t1', 'c', 60);
      expect(store.invalidatePrefix('dashboard:')).toBe(2);
      expect(store.get('dashboard:t1')).toBeNull();
      expect(store.get('trends:t1')).toBe('c');
    });
  });

  describe('size and clear', () => {
    it('reports correct size', () => {
      expect(store.size()).toBe(0);
      store.set('a', 1, 60);
      store.set('b', 2, 60);
      expect(store.size()).toBe(2);
    });

    it('clears all entries', () => {
      store.set('a', 1, 60);
      store.set('b', 2, 60);
      store.clear();
      expect(store.size()).toBe(0);
    });
  });
});
