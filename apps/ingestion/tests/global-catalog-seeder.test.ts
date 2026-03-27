/**
 * Tests for GlobalCatalogSeeder — auto-seeds on startup when catalog empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedGlobalCatalogIfEmpty } from '../src/services/global-catalog-seeder.js';

const mockCount = vi.fn();
const mockUpsert = vi.fn();

const mockPrisma = {
  globalFeedCatalog: {
    count: mockCount,
    upsert: mockUpsert,
  },
} as any;

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({});
});

describe('seedGlobalCatalogIfEmpty', () => {
  it('seeds 10 feeds when catalog is empty', async () => {
    mockCount.mockResolvedValue(0);

    await seedGlobalCatalogIfEmpty(mockPrisma, mockLogger);

    expect(mockCount).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledTimes(10);
    expect(mockLogger.info).toHaveBeenCalledWith(
      { seeded: 10 },
      'Global catalog seeded with default OSINT feeds',
    );
  });

  it('skips seeding when catalog already has feeds', async () => {
    mockCount.mockResolvedValue(5);

    await seedGlobalCatalogIfEmpty(mockPrisma, mockLogger);

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { existingFeeds: 5 },
      'Global catalog already seeded — skipping',
    );
  });

  it('upserts by name with correct Admiralty scoring', async () => {
    mockCount.mockResolvedValue(0);

    await seedGlobalCatalogIfEmpty(mockPrisma, mockLogger);

    // CISA KEV: A1 = (100+100)/2 = 100
    const cisaCall = mockUpsert.mock.calls.find(
      (c: any[]) => c[0].where.name === 'CISA Known Exploited Vulnerabilities',
    );
    expect(cisaCall).toBeDefined();
    expect(cisaCall![0].create.feedReliability).toBe(100);
    expect(cisaCall![0].create.sourceReliability).toBe('A');
    expect(cisaCall![0].create.infoCred).toBe(1);

    // Blocklist.de: C3 = (60+60)/2 = 60
    const blocklistCall = mockUpsert.mock.calls.find(
      (c: any[]) => c[0].where.name === 'Blocklist.de',
    );
    expect(blocklistCall).toBeDefined();
    expect(blocklistCall![0].create.feedReliability).toBe(60);
  });

  it('handles database errors gracefully without crashing', async () => {
    mockCount.mockRejectedValue(new Error('DB connection failed'));

    await seedGlobalCatalogIfEmpty(mockPrisma, mockLogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to seed global catalog — will retry on next restart',
    );
  });

  it('all feeds have valid URLs and schedules', async () => {
    mockCount.mockResolvedValue(0);

    await seedGlobalCatalogIfEmpty(mockPrisma, mockLogger);

    for (const call of mockUpsert.mock.calls) {
      const create = call[0].create;
      expect(create.url).toMatch(/^https?:\/\//);
      expect(create.schedule).toBeTruthy();
      expect(create.enabled).toBe(true);
      expect(create.feedReliability).toBeGreaterThanOrEqual(0);
      expect(create.feedReliability).toBeLessThanOrEqual(100);
    }
  });
});
