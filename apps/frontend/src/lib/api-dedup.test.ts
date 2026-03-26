/**
 * @module lib/api-dedup
 * @description Tests for in-flight GET request deduplication.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth store before importing api
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      accessToken: 'test-token',
      user: { tenantId: 't1', id: 'u1', role: 'admin' },
    }),
  },
}));

// Track fetch calls
const mockFetch = vi.fn().mockImplementation(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { items: [] } }),
}));
vi.stubGlobal('fetch', mockFetch);

// Import after mocks
const { api } = await import('./api');

describe('In-flight request deduplication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('same GET URL within 100ms returns the same promise (single fetch)', async () => {
    const p1 = api('/feeds');
    const p2 = api('/feeds');

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    // Only one fetch call should have been made
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance past dedup window so cleanup runs
    await vi.advanceTimersByTimeAsync(200);
  });

  it('different GET URLs create separate fetches', async () => {
    const p1 = api('/actors');
    const p2 = api('/malware');

    await Promise.all([p1, p2]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
