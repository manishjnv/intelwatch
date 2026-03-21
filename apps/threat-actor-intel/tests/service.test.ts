import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActorService } from '../src/service.js';
import { ActorRepository } from '../src/repository.js';
import type { ThreatActorProfile, PrismaClient } from '@prisma/client';

// Mock actor factory
function makeActor(overrides: Partial<ThreatActorProfile> = {}): ThreatActorProfile {
  return {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    tenantId: 'tenant-1',
    name: 'APT28',
    aliases: ['Fancy Bear', 'Sofacy'],
    description: 'Russian military intelligence',
    actorType: 'nation_state',
    motivation: 'espionage',
    sophistication: 'expert',
    country: 'Russia',
    targetSectors: ['government', 'military'],
    targetRegions: ['NATO', 'Ukraine'],
    ttps: ['T1059', 'T1566'],
    associatedMalware: ['X-Agent', 'Zebrocy'],
    tlp: 'amber',
    confidence: 90,
    tags: ['apt', 'russia'],
    firstSeen: new Date('2024-01-01'),
    lastSeen: new Date('2024-06-01'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ThreatActorProfile;
}

function createMockRepo(): ActorRepository {
  return {
    findMany: vi.fn().mockResolvedValue({ data: [makeActor()], total: 1 }),
    findById: vi.fn().mockResolvedValue(makeActor()),
    findByName: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((_tid, data) => Promise.resolve(makeActor({ ...data }))),
    update: vi.fn().mockImplementation((_tid, _id, data) => Promise.resolve(makeActor({ ...data }))),
    softDelete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ data: [makeActor()], total: 1 }),
    getStats: vi.fn().mockResolvedValue({
      total: 5, active: 4, byType: { nation_state: 3 }, byMotivation: { espionage: 3 },
      bySophistication: { expert: 2 }, avgConfidence: 75,
    }),
    findForExport: vi.fn().mockResolvedValue([makeActor()]),
  } as unknown as ActorRepository;
}

function createMockPrisma(): PrismaClient {
  return {
    $transaction: vi.fn().mockImplementation((args: unknown[]) => Promise.all(args)),
    ioc: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'ioc-1', iocType: 'ip', normalizedValue: '1.2.3.4', severity: 'high', confidence: 80,
          lifecycle: 'active', tlp: 'amber', tags: [], threatActors: ['APT28'],
          malwareFamilies: [], firstSeen: new Date('2026-03-20'), lastSeen: new Date('2026-03-21'),
          feedSourceId: 'feed-1', mitreAttack: ['T1059'] },
      ]),
      count: vi.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaClient;
}

describe('Threat Actor Intel — Service', () => {
  let service: ActorService;
  let repo: ActorRepository;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    repo = createMockRepo();
    mockPrisma = createMockPrisma();
    service = new ActorService(repo, mockPrisma);
  });

  describe('listActors', () => {
    it('delegates to repo.findMany and wraps with pagination', async () => {
      vi.mocked(repo.findMany).mockResolvedValueOnce({ data: [makeActor(), makeActor({ name: 'Lazarus' })], total: 2 });
      const result = await service.listActors('tenant-1', { page: 2, limit: 25, sortBy: 'name', sortOrder: 'asc' });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
      expect(repo.findMany).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ page: 2, limit: 25 }));
    });
  });

  describe('getActor', () => {
    it('returns actor from repo.findById', async () => {
      const actor = await service.getActor('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(actor.name).toBe('APT28');
      expect(repo.findById).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    });

    it('throws 404 when actor not found', async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce(null);
      await expect(service.getActor('tenant-1', 'missing-id')).rejects.toThrow('Threat actor not found');
    });
  });

  describe('createActor', () => {
    it('checks for duplicate name then delegates to repo.create', async () => {
      const input = {
        name: 'Lazarus', actorType: 'nation_state' as const, motivation: 'financial' as const,
        aliases: [], description: '', sophistication: 'advanced' as const, targetSectors: [],
        targetRegions: [], ttps: [], associatedMalware: [], tlp: 'amber' as const, confidence: 80, tags: [],
      };
      const actor = await service.createActor('tenant-1', input);
      expect(repo.findByName).toHaveBeenCalledWith('tenant-1', 'Lazarus');
      expect(repo.create).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ name: 'Lazarus', actorType: 'nation_state' }));
      expect(actor.name).toBe('Lazarus');
    });

    it('rejects duplicate actor name before calling create', async () => {
      vi.mocked(repo.findByName).mockResolvedValueOnce(makeActor());
      await expect(service.createActor('tenant-1', {
        name: 'APT28', aliases: [], description: '', actorType: 'unknown',
        motivation: 'unknown', sophistication: 'none', targetSectors: [],
        targetRegions: [], ttps: [], associatedMalware: [], tlp: 'amber', confidence: 50, tags: [],
      })).rejects.toThrow('already exists');
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateActor', () => {
    it('passes correct args to repo.update', async () => {
      await service.updateActor('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', { confidence: 95 });
      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', { confidence: 95 });
    });
  });

  describe('deleteActor', () => {
    it('delegates to repo.softDelete with correct args', async () => {
      await service.deleteActor('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(repo.softDelete).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    });
  });

  describe('searchActors', () => {
    it('delegates to repo.search with search term', async () => {
      vi.mocked(repo.search).mockResolvedValueOnce({ data: [makeActor({ name: 'APT29' })], total: 1 });
      const result = await service.searchActors('tenant-1', { q: 'APT29', page: 1, limit: 50 });
      expect(result.data[0].name).toBe('APT29');
      expect(repo.search).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ q: 'APT29' }));
    });
  });

  describe('getStats', () => {
    it('delegates to repo.getStats and returns result', async () => {
      const stats = await service.getStats('tenant-1');
      expect(stats.total).toBe(5);
      expect(stats.active).toBe(4);
      expect(stats.byType).toHaveProperty('nation_state');
      expect(repo.getStats).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('getLinkedIocs', () => {
    it('queries IOCs matching actor name and aliases', async () => {
      const result = await service.getLinkedIocs('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', { page: 1, limit: 50 });
      expect(result.actorName).toBe('APT28');
      expect(result.total).toBe(1);
      // Verify Prisma was queried with actor name AND aliases
      expect(mockPrisma.ioc.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          threatActors: { hasSome: ['APT28', 'Fancy Bear', 'Sofacy'] },
        }),
      }));
    });

    it('throws 404 when actor not found for IOC linkage', async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce(null);
      await expect(service.getLinkedIocs('tenant-1', 'missing', { page: 1, limit: 50 })).rejects.toThrow('not found');
    });
  });

  describe('getTimeline', () => {
    it('buckets IOCs by day with correct actor name', async () => {
      const result = await service.getTimeline('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', { days: 90 });
      expect(result.actorName).toBe('APT28');
      expect(result.days).toBe(90);
      expect(result.totalIocs).toBeGreaterThanOrEqual(0);
      expect(result.timeline).toBeInstanceOf(Array);
    });
  });

  describe('getMitreSummary', () => {
    it('generates technique summary from actor TTPs', async () => {
      const result = await service.getMitreSummary('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(result.actorName).toBe('APT28');
      expect(result.totalTechniques).toBe(2);
      expect(result.sophisticationScore).toBeGreaterThanOrEqual(0);
      expect(result.sophisticationScore).toBeLessThanOrEqual(100);
      expect(result.tactics.length).toBeGreaterThan(0);
    });
  });

  describe('exportActors', () => {
    it('exports as JSON with correct structure', async () => {
      const result = await service.exportActors('tenant-1', { format: 'json' });
      expect(result.contentType).toBe('application/json');
      expect(result.filename).toMatch(/\.json$/);
      const parsed = JSON.parse(result.content);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].name).toBe('APT28');
      expect(parsed.exportedAt).toBeDefined();
      expect(repo.findForExport).toHaveBeenCalledWith('tenant-1', expect.any(Object));
    });

    it('exports as CSV with header and data rows', async () => {
      const result = await service.exportActors('tenant-1', { format: 'csv' });
      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toMatch(/\.csv$/);
      const lines = result.content.split('\n');
      expect(lines[0]).toContain('name,aliases,actor_type');
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[1]).toContain('APT28');
    });
  });

  describe('computeAttributionBetween', () => {
    it('returns 100 for identical actors', () => {
      const actor = makeActor();
      const score = service.computeAttributionBetween(actor, actor);
      expect(score).toBe(100);
    });

    it('returns 0 for completely disjoint actors', () => {
      const actorA = makeActor({ associatedMalware: ['A'], ttps: ['T1059'], targetSectors: ['finance'], targetRegions: ['US'] });
      const actorB = makeActor({ associatedMalware: ['B'], ttps: ['T9999'], targetSectors: ['health'], targetRegions: ['EU'] });
      const score = service.computeAttributionBetween(actorA, actorB);
      expect(score).toBe(0);
    });

    it('returns partial score proportional to overlap', () => {
      const actorA = makeActor({ associatedMalware: ['X-Agent', 'Zebrocy'], ttps: ['T1059', 'T1566'], targetSectors: ['government'], targetRegions: ['NATO'] });
      const actorB = makeActor({ associatedMalware: ['X-Agent', 'Other'], ttps: ['T1059', 'T9999'], targetSectors: ['military'], targetRegions: ['NATO'] });
      const score = service.computeAttributionBetween(actorA, actorB);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
      // Verify it's in a reasonable range for ~50% overlap on some signals
      expect(score).toBeGreaterThan(15);
      expect(score).toBeLessThan(80);
    });
  });
});
