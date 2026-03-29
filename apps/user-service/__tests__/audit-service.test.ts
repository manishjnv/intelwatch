/**
 * @module audit-service.test
 * @description Tests for AuditService — hash chain, integrity verification, query.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256 } from '@etip/shared-utils';

const GENESIS_HASH = '0'.repeat(64);

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock('../src/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({
          id: 'audit-1', ...args.data, createdAt: args.data.createdAt ?? new Date(),
        })),
      },
    })),
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/audit-replication.js', () => ({
  fetchFromS3: vi.fn().mockResolvedValue(null),
}));

describe('Hash chain computation', () => {
  it('genesis hash for first entry', async () => {
    const { computeHashChain } = await import('../src/repository.js');
    const entry = {
      action: 'USER_LOGIN', tenantId: 't-1', entityType: 'session',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const hash = computeHashChain(GENESIS_HASH, entry);
    expect(hash).toBe(sha256(GENESIS_HASH + JSON.stringify(entry)));
    expect(hash).toHaveLength(64);
  });

  it('chains to previous entry correctly', async () => {
    const { computeHashChain } = await import('../src/repository.js');
    const first = computeHashChain(GENESIS_HASH, {
      action: 'A', tenantId: 't', entityType: 'x', timestamp: '2026-01-01T00:00:00.000Z',
    });
    const second = computeHashChain(first, {
      action: 'B', tenantId: 't', entityType: 'y', timestamp: '2026-01-01T00:01:00.000Z',
    });
    expect(second).not.toBe(first);
    expect(second).toHaveLength(64);
  });

  it('is deterministic', async () => {
    const { computeHashChain } = await import('../src/repository.js');
    const entry = { action: 'X', tenantId: 't', entityType: 'z', timestamp: '2026-01-01T00:00:00.000Z' };
    const a = computeHashChain(GENESIS_HASH, entry);
    const b = computeHashChain(GENESIS_HASH, entry);
    expect(a).toBe(b);
  });
});

describe('AuditService.verifyIntegrity', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns VERIFIED for valid chain', async () => {
    const { prisma } = await import('../src/prisma.js');
    const ts1 = new Date('2026-01-01T00:00:00.000Z');
    const ts2 = new Date('2026-01-01T00:01:00.000Z');
    const entry1Data = { action: 'A', tenantId: 't', entityType: 'x', timestamp: ts1.toISOString() };
    const hash1 = sha256(GENESIS_HASH + JSON.stringify(entry1Data));
    const entry2Data = { action: 'B', tenantId: 't', entityType: 'y', timestamp: ts2.toISOString() };
    const hash2 = sha256(hash1 + JSON.stringify(entry2Data));

    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: '1', ...entry1Data, userId: undefined, entityId: undefined, changes: undefined, hashChain: hash1, externalRef: null, createdAt: ts1 },
      { id: '2', ...entry2Data, userId: undefined, entityId: undefined, changes: undefined, hashChain: hash2, externalRef: null, createdAt: ts2 },
    ]);

    const { AuditService } = await import('../src/audit-service.js');
    const svc = new AuditService();
    const result = await svc.verifyIntegrity('t');
    expect(result.status).toBe('VERIFIED');
    expect(result.entriesChecked).toBe(2);
    expect(result.violations).toHaveLength(0);
  });

  it('detects tampered entry', async () => {
    const { prisma } = await import('../src/prisma.js');
    const ts = new Date('2026-01-01T00:00:00.000Z');

    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: '1', action: 'A', tenantId: 't', entityType: 'x', userId: undefined, entityId: undefined, changes: undefined, hashChain: 'tampered-hash', externalRef: null, createdAt: ts },
    ]);

    const { AuditService } = await import('../src/audit-service.js');
    const svc = new AuditService();
    const result = await svc.verifyIntegrity('t');
    expect(result.status).toBe('INTEGRITY_VIOLATION');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].auditLogId).toBe('1');
  });

  it('returns VERIFIED for empty chain', async () => {
    const { prisma } = await import('../src/prisma.js');
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { AuditService } = await import('../src/audit-service.js');
    const svc = new AuditService();
    const result = await svc.verifyIntegrity('t');
    expect(result.status).toBe('VERIFIED');
    expect(result.entriesChecked).toBe(0);
  });

  it('skips legacy entries without hashChain', async () => {
    const { prisma } = await import('../src/prisma.js');
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: '1', action: 'OLD', tenantId: 't', entityType: 'x', hashChain: null, externalRef: null, createdAt: new Date() },
    ]);

    const { AuditService } = await import('../src/audit-service.js');
    const svc = new AuditService();
    const result = await svc.verifyIntegrity('t');
    expect(result.status).toBe('VERIFIED');
    expect(result.entriesChecked).toBe(0);
  });
});

describe('AuditService.query', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('queryTenantAuditLogs returns paginated results', async () => {
    const { prisma } = await import('../src/prisma.js');
    const mockData = [{ id: '1', action: 'LOGIN' }];
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockData);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

    const { AuditService } = await import('../src/audit-service.js');
    const svc = new AuditService();
    const result = await svc.queryTenantAuditLogs('t-1', { page: 1, limit: 10 });
    expect(result.data).toEqual(mockData);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });

  it('queryAllAuditLogs returns cross-tenant results', async () => {
    const { prisma } = await import('../src/prisma.js');
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const { AuditService } = await import('../src/audit-service.js');
    const svc = new AuditService();
    const result = await svc.queryAllAuditLogs({ action: 'USER_LOGIN' });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});
