import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantOverlayService } from '../src/services/tenant-overlay-service.js';

const TENANT_ID = 'tenant-001';
const IOC_ID = '00000000-0000-0000-0000-000000000001';

function buildGlobalIoc(overrides: Record<string, unknown> = {}) {
  return {
    id: IOC_ID,
    iocType: 'ip',
    value: '44.55.66.77',
    normalizedValue: '44.55.66.77',
    severity: 'medium',
    confidence: 60,
    lifecycle: 'active',
    tags: ['global-tag'],
    firstSeen: new Date('2026-01-01'),
    lastSeen: new Date('2026-03-01'),
    crossFeedCorroboration: 3,
    stixConfidenceTier: 'Medium',
    enrichmentQuality: 75,
    warninglistMatch: null,
    affectedCPEs: [],
    enrichmentData: { sources: [] },
    overlays: [],
    ...overrides,
  };
}

function buildOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: 'overlay-001',
    tenantId: TENANT_ID,
    globalIocId: IOC_ID,
    customSeverity: null as string | null,
    customConfidence: null as number | null,
    customLifecycle: null as string | null,
    customTags: [] as string[],
    customNotes: null as string | null,
    overriddenBy: 'analyst@test.com',
    overriddenAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    globalIoc: {
      findMany: vi.fn().mockResolvedValue([buildGlobalIoc()]),
      findUnique: vi.fn().mockResolvedValue(buildGlobalIoc()),
      count: vi.fn().mockResolvedValue(100),
    },
    tenantIocOverlay: {
      upsert: vi.fn().mockResolvedValue(buildOverlay()),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown;
}

describe('TenantOverlayService', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let service: TenantOverlayService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new TenantOverlayService(prisma as never);
  });

  describe('getIocsForTenant', () => {
    it('returns merged global + overlay view', async () => {
      const iocWithOverlay = buildGlobalIoc({
        overlays: [buildOverlay({ customSeverity: 'high', customTags: ['custom-tag'] })],
      });
      (prisma as Record<string, unknown>).globalIoc = {
        ...((prisma as Record<string, unknown>).globalIoc as Record<string, unknown>),
        findMany: vi.fn().mockResolvedValue([iocWithOverlay]),
      };
      service = new TenantOverlayService(prisma as never);

      const results = await service.getIocsForTenant(TENANT_ID);

      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('high'); // overlay wins
      expect(results[0].hasOverlay).toBe(true);
    });

    it('uses global defaults when no overlay exists', async () => {
      const results = await service.getIocsForTenant(TENANT_ID);

      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('medium'); // global default
      expect(results[0].hasOverlay).toBe(false);
    });

    it('custom confidence wins over global', async () => {
      const iocWithOverlay = buildGlobalIoc({
        overlays: [buildOverlay({ customConfidence: 95 })],
      });
      (prisma as Record<string, unknown>).globalIoc = {
        ...((prisma as Record<string, unknown>).globalIoc as Record<string, unknown>),
        findMany: vi.fn().mockResolvedValue([iocWithOverlay]),
      };
      service = new TenantOverlayService(prisma as never);

      const results = await service.getIocsForTenant(TENANT_ID);

      expect(results[0].confidence).toBe(95);
    });

    it('merges tags (global + custom, no duplicates)', async () => {
      const iocWithOverlay = buildGlobalIoc({
        tags: ['apt28', 'shared'],
        overlays: [buildOverlay({ customTags: ['internal', 'shared'] })],
      });
      (prisma as Record<string, unknown>).globalIoc = {
        ...((prisma as Record<string, unknown>).globalIoc as Record<string, unknown>),
        findMany: vi.fn().mockResolvedValue([iocWithOverlay]),
      };
      service = new TenantOverlayService(prisma as never);

      const results = await service.getIocsForTenant(TENANT_ID);

      expect(results[0].tags).toContain('apt28');
      expect(results[0].tags).toContain('internal');
      expect(results[0].tags).toContain('shared');
      // No duplicates
      expect(results[0].tags.filter((t: string) => t === 'shared')).toHaveLength(1);
    });

    it('filter by iocType works', async () => {
      await service.getIocsForTenant(TENANT_ID, { iocType: 'domain' });

      const findMany = (prisma as { globalIoc: { findMany: ReturnType<typeof vi.fn> } }).globalIoc.findMany;
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ iocType: 'domain' }),
        }),
      );
    });

    it('filter by minConfidence works', async () => {
      await service.getIocsForTenant(TENANT_ID, { minConfidence: 70 });

      const findMany = (prisma as { globalIoc: { findMany: ReturnType<typeof vi.fn> } }).globalIoc.findMany;
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ confidence: { gte: 70 } }),
        }),
      );
    });

    it('pagination (limit + offset)', async () => {
      await service.getIocsForTenant(TENANT_ID, { limit: 10, offset: 20 });

      const findMany = (prisma as { globalIoc: { findMany: ReturnType<typeof vi.fn> } }).globalIoc.findMany;
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });

  describe('setOverlay', () => {
    it('creates new overlay via upsert', async () => {
      await service.setOverlay(TENANT_ID, IOC_ID, {
        customSeverity: 'critical',
        overriddenBy: 'analyst@test.com',
      });

      const upsert = (prisma as { tenantIocOverlay: { upsert: ReturnType<typeof vi.fn> } }).tenantIocOverlay.upsert;
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_globalIocId: { tenantId: TENANT_ID, globalIocId: IOC_ID } },
          create: expect.objectContaining({ customSeverity: 'critical' }),
        }),
      );
    });

    it('updates existing overlay (upsert)', async () => {
      await service.setOverlay(TENANT_ID, IOC_ID, {
        customConfidence: 30,
        overriddenBy: 'admin@test.com',
      });

      const upsert = (prisma as { tenantIocOverlay: { upsert: ReturnType<typeof vi.fn> } }).tenantIocOverlay.upsert;
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ customConfidence: 30 }),
        }),
      );
    });

    it('partial update (only customSeverity, rest unchanged)', async () => {
      await service.setOverlay(TENANT_ID, IOC_ID, {
        customSeverity: 'low',
        overriddenBy: 'analyst@test.com',
      });

      const upsert = (prisma as { tenantIocOverlay: { upsert: ReturnType<typeof vi.fn> } }).tenantIocOverlay.upsert;
      const call = upsert.mock.calls[0][0];
      // Update should only contain customSeverity + overridden fields
      expect(call.update.customSeverity).toBe('low');
      expect(call.update).not.toHaveProperty('customConfidence');
    });
  });

  describe('removeOverlay', () => {
    it('deletes overlay, IOC reverts to global defaults', async () => {
      await service.removeOverlay(TENANT_ID, IOC_ID);

      const deleteMany = (prisma as { tenantIocOverlay: { deleteMany: ReturnType<typeof vi.fn> } }).tenantIocOverlay.deleteMany;
      expect(deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, globalIocId: IOC_ID },
      });
    });

    it('non-existent overlay → no error', async () => {
      (prisma as { tenantIocOverlay: { deleteMany: ReturnType<typeof vi.fn> } }).tenantIocOverlay.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeOverlay(TENANT_ID, 'nonexistent')).resolves.not.toThrow();
    });
  });

  describe('bulkSetOverlay', () => {
    it('batch upserts multiple IOCs', async () => {
      const ids = ['id-1', 'id-2', 'id-3'];
      const count = await service.bulkSetOverlay(TENANT_ID, ids, {
        customSeverity: 'high',
        overriddenBy: 'analyst@test.com',
      });

      expect(count).toBe(3);
      const upsert = (prisma as { tenantIocOverlay: { upsert: ReturnType<typeof vi.fn> } }).tenantIocOverlay.upsert;
      expect(upsert).toHaveBeenCalledTimes(3);
    });
  });

  describe('getOverlayStats', () => {
    it('returns correct counts', async () => {
      (prisma as { tenantIocOverlay: { findMany: ReturnType<typeof vi.fn> } }).tenantIocOverlay.findMany.mockResolvedValue([
        buildOverlay({ customSeverity: 'high', customConfidence: 90, customTags: ['tag1'] }),
        buildOverlay({ customSeverity: 'low', customConfidence: null, customTags: [] }),
      ]);

      const stats = await service.getOverlayStats(TENANT_ID);

      expect(stats.totalGlobalIocs).toBe(100);
      expect(stats.overlayCount).toBe(2);
      expect(stats.customSeverityCount).toBe(2);
      expect(stats.customConfidenceCount).toBe(1);
      expect(stats.customTagsCount).toBe(1);
    });
  });
});
