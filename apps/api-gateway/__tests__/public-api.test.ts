import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  buildCursorWhere,
  buildCursorOrderBy,
  extractPaginationMeta,
} from '../src/routes/public/cursor.js';
import { toPublicIoc, toPublicFeed, toPublicArticle } from '../src/routes/public/dto.js';
import { iocsToStixBundle } from '../src/routes/public/stix-mapper.js';
import type { PublicIocDto } from '@etip/shared-types';

// ── Cursor Pagination Tests ─────────────────────────────────────────

describe('cursor', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('round-trips a string sort value + id', () => {
      const cursor = encodeCursor('2026-03-31T00:00:00.000Z', 'abc-123');
      const decoded = decodeCursor(cursor);
      expect(decoded.s).toBe('2026-03-31T00:00:00.000Z');
      expect(decoded.i).toBe('abc-123');
    });

    it('round-trips a numeric sort value', () => {
      const cursor = encodeCursor(85, 'uuid-456');
      const decoded = decodeCursor(cursor);
      expect(decoded.s).toBe(85);
      expect(decoded.i).toBe('uuid-456');
    });

    it('round-trips a Date sort value', () => {
      const date = new Date('2026-03-31T12:00:00Z');
      const cursor = encodeCursor(date, 'uuid-789');
      const decoded = decodeCursor(cursor);
      expect(decoded.s).toBe(date.toISOString());
    });

    it('throws 400 on invalid cursor', () => {
      expect(() => decodeCursor('not-valid-base64url!!!')).toThrow();
      expect(() => decodeCursor(Buffer.from('{}').toString('base64url'))).toThrow();
    });
  });

  describe('buildCursorWhere', () => {
    it('returns empty object for null cursor (first page)', () => {
      expect(buildCursorWhere('lastSeen', 'desc', null)).toEqual({});
    });

    it('builds lt condition for desc order', () => {
      const result = buildCursorWhere('lastSeen', 'desc', { s: '2026-03-31', i: 'id-1' });
      expect(result).toEqual({
        OR: [
          { lastSeen: { lt: '2026-03-31' } },
          { lastSeen: '2026-03-31', id: { lt: 'id-1' } },
        ],
      });
    });

    it('builds gt condition for asc order', () => {
      const result = buildCursorWhere('confidence', 'asc', { s: 50, i: 'id-2' });
      expect(result).toEqual({
        OR: [
          { confidence: { gt: 50 } },
          { confidence: 50, id: { gt: 'id-2' } },
        ],
      });
    });
  });

  describe('buildCursorOrderBy', () => {
    it('builds compound orderBy', () => {
      expect(buildCursorOrderBy('lastSeen', 'desc')).toEqual([
        { lastSeen: 'desc' },
        { id: 'desc' },
      ]);
    });
  });

  describe('extractPaginationMeta', () => {
    it('detects hasMore when items exceed limit', () => {
      const items = [
        { id: '1', lastSeen: 'a' },
        { id: '2', lastSeen: 'b' },
        { id: '3', lastSeen: 'c' },
      ];
      const result = extractPaginationMeta(items, 2, 'lastSeen');
      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeTruthy();
    });

    it('returns hasMore=false when items fit within limit', () => {
      const items = [
        { id: '1', lastSeen: 'a' },
        { id: '2', lastSeen: 'b' },
      ];
      const result = extractPaginationMeta(items, 5, 'lastSeen');
      expect(result.hasMore).toBe(false);
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('handles empty result set', () => {
      const result = extractPaginationMeta([], 10, 'lastSeen');
      expect(result.hasMore).toBe(false);
      expect(result.data).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });
  });
});

// ── DTO Projection Tests ────────────────────────────────────────────

describe('dto', () => {
  describe('toPublicIoc', () => {
    it('projects only public fields', () => {
      const raw = {
        id: 'uuid-1',
        iocType: 'ip',
        value: '1.2.3.4',
        severity: 'high',
        tlp: 'amber',
        confidence: 85,
        lifecycle: 'active',
        tags: ['c2'],
        mitreAttack: ['T1059'],
        malwareFamilies: ['LockBit'],
        threatActors: ['APT28'],
        firstSeen: new Date('2026-03-01'),
        lastSeen: new Date('2026-03-31'),
        expiresAt: null,
        createdAt: new Date('2026-03-01'),
        // Internal fields that should NOT appear in output
        tenantId: 'tenant-secret',
        enrichmentData: { vtResult: {} },
        normalizedValue: '1.2.3.4',
        dedupeHash: 'abc123',
        feedSourceId: 'feed-id',
        archivedAt: null,
      };

      const result = toPublicIoc(raw);
      expect(result.id).toBe('uuid-1');
      expect(result.type).toBe('ip');
      expect(result.confidence).toBe(85);
      expect(result.firstSeen).toBe('2026-03-01T00:00:00.000Z');
      // Verify internal fields are stripped
      expect(result).not.toHaveProperty('tenantId');
      expect(result).not.toHaveProperty('enrichmentData');
      expect(result).not.toHaveProperty('normalizedValue');
      expect(result).not.toHaveProperty('dedupeHash');
      expect(result).not.toHaveProperty('feedSourceId');
    });
  });

  describe('toPublicFeed', () => {
    it('projects only public fields', () => {
      const raw = {
        id: 'feed-1',
        name: 'AlienVault OTX',
        description: 'OTX feed',
        feedType: 'rss',
        status: 'active',
        lastFetchAt: new Date('2026-03-31'),
        feedReliability: 80,
        totalItemsIngested: 5000,
        // Internal fields
        url: 'https://secret-feed-url.com',
        authConfig: { apiKey: 'secret' },
        parseConfig: {},
        headers: {},
        tenantId: 'tenant-secret',
      };

      const result = toPublicFeed(raw);
      expect(result.name).toBe('AlienVault OTX');
      expect(result).not.toHaveProperty('url');
      expect(result).not.toHaveProperty('authConfig');
      expect(result).not.toHaveProperty('tenantId');
    });
  });

  describe('toPublicArticle', () => {
    it('strips cost tracking and AI result blobs', () => {
      const raw = {
        id: 'art-1',
        title: 'APT28 Campaign',
        url: 'https://blog.example.com/apt28',
        publishedAt: new Date('2026-03-30'),
        author: 'Researcher',
        isCtiRelevant: true,
        articleType: 'threat_report',
        iocsExtracted: 12,
        // Internal fields
        content: 'Full article text...',
        stage1TriageTokens: 500,
        stage1TriageCostUsd: 0.01,
        triageResult: {},
        extractionResult: {},
        tenantId: 'tenant-secret',
      };

      const result = toPublicArticle(raw);
      expect(result.title).toBe('APT28 Campaign');
      expect(result.iocsExtracted).toBe(12);
      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('stage1TriageTokens');
      expect(result).not.toHaveProperty('tenantId');
    });
  });
});

// ── STIX 2.1 Mapper Tests ───────────────────────────────────────────

describe('stix-mapper', () => {
  const sampleIoc: PublicIocDto = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    type: 'ip',
    value: '192.168.1.1',
    severity: 'high',
    tlp: 'amber',
    confidence: 90,
    lifecycle: 'active',
    tags: ['c2', 'cobalt-strike'],
    mitreAttack: ['T1059'],
    malwareFamilies: ['CobaltStrike'],
    threatActors: ['APT28'],
    firstSeen: '2026-03-01T00:00:00.000Z',
    lastSeen: '2026-03-31T00:00:00.000Z',
    expiresAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
  };

  it('produces a valid STIX bundle envelope', () => {
    const bundle = iocsToStixBundle([sampleIoc]);
    expect(bundle.type).toBe('bundle');
    expect(bundle.id).toMatch(/^bundle--/);
    expect(bundle.objects.length).toBeGreaterThan(0);
  });

  it('includes identity, indicator, SCO, and relationships', () => {
    const bundle = iocsToStixBundle([sampleIoc]);
    const types = bundle.objects.map((o) => o.type);
    expect(types).toContain('identity');
    expect(types).toContain('indicator');
    expect(types).toContain('ipv4-addr');
    expect(types).toContain('relationship');
    expect(types).toContain('malware');
    expect(types).toContain('threat-actor');
  });

  it('creates correct STIX pattern for IP', () => {
    const bundle = iocsToStixBundle([sampleIoc]);
    const indicator = bundle.objects.find((o) => o.type === 'indicator');
    expect(indicator?.pattern).toBe("[ipv4-addr:value = '192.168.1.1']");
  });

  it('maps TLP to STIX marking definition', () => {
    const bundle = iocsToStixBundle([sampleIoc]);
    const indicator = bundle.objects.find((o) => o.type === 'indicator');
    expect(indicator?.object_marking_refs).toBeDefined();
    expect((indicator?.object_marking_refs as string[])[0]).toMatch(/^marking-definition--/);
  });

  it('deduplicates malware and threat actor SDOs', () => {
    const iocs: PublicIocDto[] = [
      { ...sampleIoc, id: '550e8400-e29b-41d4-a716-446655440001' },
      { ...sampleIoc, id: '550e8400-e29b-41d4-a716-446655440002' },
    ];
    const bundle = iocsToStixBundle(iocs);
    const malwareCount = bundle.objects.filter((o) => o.type === 'malware').length;
    const actorCount = bundle.objects.filter((o) => o.type === 'threat-actor').length;
    expect(malwareCount).toBe(1); // deduplicated
    expect(actorCount).toBe(1);
  });

  it('handles different IOC types correctly', () => {
    const hashIoc: PublicIocDto = { ...sampleIoc, type: 'sha256', value: 'abcdef1234567890' };
    const bundle = iocsToStixBundle([hashIoc]);
    const indicator = bundle.objects.find((o) => o.type === 'indicator');
    expect(indicator?.pattern).toBe("[file:hashes.'SHA-256' = 'abcdef1234567890']");
    const fileSco = bundle.objects.find((o) => o.type === 'file');
    expect(fileSco).toBeDefined();
  });

  it('handles domain IOCs', () => {
    const domainIoc: PublicIocDto = { ...sampleIoc, type: 'domain', value: 'evil.com' };
    const bundle = iocsToStixBundle([domainIoc]);
    const indicator = bundle.objects.find((o) => o.type === 'indicator');
    expect(indicator?.pattern).toBe("[domain-name:value = 'evil.com']");
  });

  it('handles empty input', () => {
    const bundle = iocsToStixBundle([]);
    expect(bundle.type).toBe('bundle');
    expect(bundle.objects).toHaveLength(1); // just the identity
  });
});
