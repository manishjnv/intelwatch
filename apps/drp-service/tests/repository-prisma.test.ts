/**
 * DRP repository unit tests — mocked PrismaClient (Step 3 S158).
 * Covers UUID short-circuiting, Date/Json <-> app-type mapping, tenant scoping
 * on every where clause, DB_UNAVAILABLE mapping, and P2002 -> 409 CONFLICT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import { isUuid } from '../src/repository.js';
import { createPrismaDrpRepo } from '../src/repository-prisma-alerts.js';
import type { MonitoredAsset, DRPAlert, ScanResult } from '../src/schemas/drp.js';
import type { TakedownRequest } from '../src/schemas/p1-p2.js';

function createMockPrisma() {
  return {
    drpAsset: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    drpAlert: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    drpScan: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    drpTakedown: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    drpAlertFeedback: { findMany: vi.fn(), create: vi.fn() },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

const TENANT = randomUUID();

function makeAsset(overrides?: Partial<MonitoredAsset>): MonitoredAsset {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: TENANT,
    type: 'domain',
    value: 'example.com',
    displayName: 'Example',
    enabled: true,
    scanFrequencyHours: 24,
    lastScannedAt: null,
    alertCount: 0,
    criticality: 0.5,
    tags: [],
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAlert(overrides?: Partial<DRPAlert>): DRPAlert {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: TENANT,
    assetId: 'example.com',
    type: 'typosquatting',
    severity: 'high',
    status: 'open',
    title: 'Test alert',
    description: '',
    evidence: [],
    confidence: 0.8,
    confidenceReasons: [],
    signalIds: [],
    assignedTo: null,
    triageNotes: '',
    tags: [],
    detectedValue: 'evil.com',
    sourceUrl: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeScan(overrides?: Partial<ScanResult>): ScanResult {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: TENANT,
    assetId: 'example.com',
    scanType: 'typosquatting',
    status: 'completed',
    findingsCount: 0,
    alertsCreated: 0,
    startedAt: now,
    completedAt: now,
    durationMs: 10,
    ...overrides,
  };
}

function makeTakedown(overrides?: Partial<TakedownRequest>): TakedownRequest {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    alertId: randomUUID(),
    tenantId: TENANT,
    platform: 'registrar',
    status: 'draft',
    subject: 'Subject',
    body: 'Body',
    contactName: 'Abuse Team',
    contactEmail: 'abuse@example.com',
    evidence: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('isUuid', () => {
  it('accepts a valid uuid', () => {
    expect(isUuid(randomUUID())).toBe(true);
  });
  it('rejects legacy/free-text ids like a domain', () => {
    expect(isUuid('example.com')).toBe(false);
  });
});

describe('DRP asset repo', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createPrismaDrpRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createPrismaDrpRepo(db as unknown as PrismaClient);
  });

  it('listAssets passes where: { tenantId }', async () => {
    db.drpAsset.findMany.mockResolvedValue([]);
    await repo.listAssets(TENANT);
    expect(db.drpAsset.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT }, orderBy: { updatedAt: 'desc' } });
  });

  it('non-UUID tenantId short-circuits listAssets to [] without calling Prisma', async () => {
    expect(await repo.listAssets('not-a-uuid')).toEqual([]);
    expect(db.drpAsset.findMany).not.toHaveBeenCalled();
  });

  it('getAsset scopes by id AND tenantId', async () => {
    db.drpAsset.findFirst.mockResolvedValue(null);
    const id = randomUUID();
    await repo.getAsset(TENANT, id);
    expect(db.drpAsset.findFirst).toHaveBeenCalledWith({ where: { id, tenantId: TENANT } });
  });

  it('non-UUID id short-circuits getAsset to null without calling Prisma', async () => {
    expect(await repo.getAsset(TENANT, 'nope')).toBeNull();
    expect(db.drpAsset.findFirst).not.toHaveBeenCalled();
  });

  it('maps Date fields to ISO strings on read', async () => {
    const dbRow = { ...makeAsset(), lastScannedAt: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z') };
    db.drpAsset.findFirst.mockResolvedValue(dbRow);
    const asset = await repo.getAsset(TENANT, dbRow.id);
    expect(asset!.lastScannedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(asset!.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps ISO strings to Date on save (create data, when updateMany finds no row)', async () => {
    const asset = makeAsset({ lastScannedAt: '2026-02-01T00:00:00.000Z' });
    db.drpAsset.updateMany.mockResolvedValue({ count: 0 });
    db.drpAsset.create.mockResolvedValue({});
    db.drpAsset.findFirst.mockResolvedValue({ ...asset, lastScannedAt: new Date(asset.lastScannedAt!), createdAt: new Date(asset.createdAt), updatedAt: new Date(asset.updatedAt) });
    await repo.upsertAsset(asset);
    const call = db.drpAsset.create.mock.calls[0]![0];
    expect(call.data.lastScannedAt).toBeInstanceOf(Date);
    expect(call.data.lastScannedAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('upsertAsset: updateMany is scoped to { id, tenantId } and its data omits id/tenantId/createdAt', async () => {
    const asset = makeAsset();
    db.drpAsset.updateMany.mockResolvedValue({ count: 1 });
    db.drpAsset.findFirst.mockResolvedValue({ ...asset, lastScannedAt: null, createdAt: new Date(asset.createdAt), updatedAt: new Date(asset.updatedAt) });
    await repo.upsertAsset(asset);
    const call = db.drpAsset.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: asset.id, tenantId: asset.tenantId });
    expect(call.data).not.toHaveProperty('id');
    expect(call.data).not.toHaveProperty('tenantId');
    expect(call.data).not.toHaveProperty('createdAt');
    expect(db.drpAsset.create).not.toHaveBeenCalled();
  });

  it('upsertAsset: updateMany count 0 triggers create', async () => {
    const asset = makeAsset();
    db.drpAsset.updateMany.mockResolvedValue({ count: 0 });
    db.drpAsset.create.mockResolvedValue({});
    db.drpAsset.findFirst.mockResolvedValue({ ...asset, lastScannedAt: null, createdAt: new Date(asset.createdAt), updatedAt: new Date(asset.updatedAt) });
    await repo.upsertAsset(asset);
    expect(db.drpAsset.create).toHaveBeenCalledTimes(1);
  });

  it('upsertAsset with a non-UUID tenantId throws 400 VALIDATION_ERROR without calling Prisma', async () => {
    const asset = makeAsset({ tenantId: 'default' });
    await expect(repo.upsertAsset(asset)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(db.drpAsset.updateMany).not.toHaveBeenCalled();
  });

  it('P2002 unique violation on upsertAsset (updateMany count 0 + create) maps to 409 CONFLICT, no other write', async () => {
    db.drpAsset.updateMany.mockResolvedValue({ count: 0 });
    db.drpAsset.create.mockRejectedValue({ code: 'P2002' });
    await expect(repo.upsertAsset(makeAsset())).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(db.drpAsset.findFirst).not.toHaveBeenCalled();
  });

  it('Prisma rejecting maps to AppError 503 DB_UNAVAILABLE', async () => {
    db.drpAsset.findMany.mockRejectedValue(new Error('connection refused'));
    await expect(repo.listAssets(TENANT)).rejects.toBeInstanceOf(AppError);
    await expect(repo.listAssets(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });

  it('deleteAsset scopes by id AND tenantId, returns false when nothing matched', async () => {
    db.drpAsset.deleteMany.mockResolvedValue({ count: 0 });
    const id = randomUUID();
    expect(await repo.deleteAsset(TENANT, id)).toBe(false);
    expect(db.drpAsset.deleteMany).toHaveBeenCalledWith({ where: { id, tenantId: TENANT } });
  });

  it('non-UUID id short-circuits deleteAsset/countAssets without calling Prisma', async () => {
    expect(await repo.deleteAsset(TENANT, 'nope')).toBe(false);
    expect(db.drpAsset.deleteMany).not.toHaveBeenCalled();
    expect(await repo.countAssets('not-a-uuid')).toBe(0);
    expect(db.drpAsset.count).not.toHaveBeenCalled();
  });
});

describe('DRP alert repo (incl. embedded AI enrichment / evidence chain)', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createPrismaDrpRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createPrismaDrpRepo(db as unknown as PrismaClient);
  });

  it('listAlertsByAsset scopes by tenantId AND assetId (assetId is a free-text string, not a uuid)', async () => {
    db.drpAlert.findMany.mockResolvedValue([]);
    await repo.listAlertsByAsset(TENANT, 'evil-example.com');
    expect(db.drpAlert.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT, assetId: 'evil-example.com' }, orderBy: { updatedAt: 'desc' } });
  });

  it('evidence/confidenceReasons round-trip through Json columns', async () => {
    const alert = makeAlert({
      evidence: [{ id: randomUUID(), type: 'dns_record', title: 'x', data: { a: 1 }, collectedAt: new Date().toISOString() }],
      confidenceReasons: [{ signal: 's', weight: 0.5, value: 0.5, description: 'd' }],
    });
    db.drpAlert.updateMany.mockResolvedValue({ count: 0 });
    db.drpAlert.create.mockResolvedValue({});
    db.drpAlert.findFirst.mockResolvedValue({ ...alert, createdAt: new Date(alert.createdAt), updatedAt: new Date(alert.updatedAt), resolvedAt: null, aiEnrichment: null, evidenceChain: null });
    const saved = await repo.upsertAlert(alert);
    expect(saved.evidence).toEqual(alert.evidence);
    expect(saved.confidenceReasons).toEqual(alert.confidenceReasons);
  });

  it('setAiEnrichment updates only the target row by id + tenantId', async () => {
    db.drpAlert.updateMany.mockResolvedValue({ count: 1 });
    const alertId = randomUUID();
    const result = { alertId, hostingProvider: null, registrar: null, takedownContacts: [], recommendedActions: [], riskAssessment: 'x', enrichedAt: new Date().toISOString(), model: 'm', cached: false };
    await repo.setAiEnrichment(TENANT, alertId, result);
    expect(db.drpAlert.updateMany).toHaveBeenCalledWith({ where: { id: alertId, tenantId: TENANT }, data: { aiEnrichment: result } });
  });

  it('non-UUID alertId short-circuits setAiEnrichment/getAiEnrichment without calling Prisma', async () => {
    await repo.setAiEnrichment(TENANT, 'not-a-uuid', {} as never);
    expect(db.drpAlert.updateMany).not.toHaveBeenCalled();
    expect(await repo.getAiEnrichment(TENANT, 'not-a-uuid')).toBeNull();
    expect(db.drpAlert.findFirst).not.toHaveBeenCalled();
  });

  it('upsertAlert: updateMany is scoped to { id, tenantId } and its data omits id/tenantId/createdAt', async () => {
    const alert = makeAlert();
    db.drpAlert.updateMany.mockResolvedValue({ count: 1 });
    db.drpAlert.findFirst.mockResolvedValue({ ...alert, createdAt: new Date(alert.createdAt), updatedAt: new Date(alert.updatedAt), resolvedAt: null, aiEnrichment: null, evidenceChain: null });
    await repo.upsertAlert(alert);
    const call = db.drpAlert.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: alert.id, tenantId: alert.tenantId });
    expect(call.data).not.toHaveProperty('id');
    expect(call.data).not.toHaveProperty('tenantId');
    expect(call.data).not.toHaveProperty('createdAt');
    expect(db.drpAlert.create).not.toHaveBeenCalled();
  });

  it('P2002 unique violation on upsertAlert (updateMany count 0 + create) maps to 409 CONFLICT, no other write', async () => {
    db.drpAlert.updateMany.mockResolvedValue({ count: 0 });
    db.drpAlert.create.mockRejectedValue({ code: 'P2002' });
    await expect(repo.upsertAlert(makeAlert())).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(db.drpAlert.findFirst).not.toHaveBeenCalled();
  });

  it('Prisma rejecting on listAlerts maps to 503 DB_UNAVAILABLE', async () => {
    db.drpAlert.findMany.mockRejectedValue(new Error('timeout'));
    await expect(repo.listAlerts(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });
});

describe('DRP scan repo', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createPrismaDrpRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createPrismaDrpRepo(db as unknown as PrismaClient);
  });

  it('listScans passes where: { tenantId }, orderBy startedAt desc', async () => {
    db.drpScan.findMany.mockResolvedValue([]);
    await repo.listScans(TENANT);
    expect(db.drpScan.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT }, orderBy: { startedAt: 'desc' } });
  });

  it('maps completedAt Date -> ISO string, null stays null', async () => {
    const scan = makeScan({ completedAt: null });
    db.drpScan.updateMany.mockResolvedValue({ count: 0 });
    db.drpScan.create.mockResolvedValue({});
    db.drpScan.findFirst.mockResolvedValue({ ...scan, startedAt: new Date(scan.startedAt), completedAt: null });
    const saved = await repo.upsertScan(scan);
    expect(saved.completedAt).toBeNull();
  });

  it('upsertScan: updateMany is scoped to { id, tenantId } and its data omits id/tenantId', async () => {
    const scan = makeScan();
    db.drpScan.updateMany.mockResolvedValue({ count: 1 });
    db.drpScan.findFirst.mockResolvedValue({ ...scan, startedAt: new Date(scan.startedAt), completedAt: new Date(scan.completedAt!) });
    await repo.upsertScan(scan);
    const call = db.drpScan.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: scan.id, tenantId: scan.tenantId });
    expect(call.data).not.toHaveProperty('id');
    expect(call.data).not.toHaveProperty('tenantId');
    expect(db.drpScan.create).not.toHaveBeenCalled();
  });

  it('non-UUID tenantId short-circuits listScans to [] without calling Prisma', async () => {
    expect(await repo.listScans('nope')).toEqual([]);
    expect(db.drpScan.findMany).not.toHaveBeenCalled();
  });
});

describe('DRP takedown repo', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createPrismaDrpRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createPrismaDrpRepo(db as unknown as PrismaClient);
  });

  it('listTakedownsByAlert scopes by tenantId AND alertId (both uuids)', async () => {
    db.drpTakedown.findMany.mockResolvedValue([]);
    const alertId = randomUUID();
    await repo.listTakedownsByAlert(TENANT, alertId);
    expect(db.drpTakedown.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT, alertId }, orderBy: { createdAt: 'desc' } });
  });

  it('getTakedown returns null for a non-UUID id without calling Prisma', async () => {
    expect(await repo.getTakedown(TENANT, 'nope')).toBeNull();
    expect(db.drpTakedown.findFirst).not.toHaveBeenCalled();
  });

  it('round-trips evidence Json array', async () => {
    const takedown = makeTakedown({ evidence: [{ type: 'dns_record', description: 'x' }] });
    db.drpTakedown.updateMany.mockResolvedValue({ count: 0 });
    db.drpTakedown.create.mockResolvedValue({});
    db.drpTakedown.findFirst.mockResolvedValue({ ...takedown, createdAt: new Date(takedown.createdAt), updatedAt: new Date(takedown.updatedAt) });
    const saved = await repo.upsertTakedown(takedown);
    expect(saved.evidence).toEqual(takedown.evidence);
  });

  it('P2002 unique violation on upsertTakedown (updateMany count 0 + create) maps to 409 CONFLICT, no other write', async () => {
    db.drpTakedown.updateMany.mockResolvedValue({ count: 0 });
    db.drpTakedown.create.mockRejectedValue({ code: 'P2002' });
    await expect(repo.upsertTakedown(makeTakedown())).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(db.drpTakedown.findFirst).not.toHaveBeenCalled();
  });
});

describe('DRP feedback repo', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createPrismaDrpRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createPrismaDrpRepo(db as unknown as PrismaClient);
  });

  it('addFeedback creates a row and listFeedback scopes by tenantId', async () => {
    const feedback = { id: randomUUID(), tenantId: TENANT, alertId: randomUUID(), verdict: 'true_positive' as const, reason: '', userId: 'u1', createdAt: new Date().toISOString() };
    db.drpAlertFeedback.create.mockResolvedValue({ ...feedback, createdAt: new Date(feedback.createdAt) });
    await repo.addFeedback(feedback);
    expect(db.drpAlertFeedback.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: TENANT, verdict: 'true_positive' }) });

    db.drpAlertFeedback.findMany.mockResolvedValue([]);
    await repo.listFeedback(TENANT);
    expect(db.drpAlertFeedback.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT }, orderBy: { createdAt: 'desc' } });
  });

  it('addFeedback with a non-UUID tenantId throws 400 VALIDATION_ERROR without calling Prisma', async () => {
    const feedback = { id: randomUUID(), tenantId: 'default', alertId: randomUUID(), verdict: 'false_positive' as const, reason: '', userId: 'u1', createdAt: new Date().toISOString() };
    await expect(repo.addFeedback(feedback)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(db.drpAlertFeedback.create).not.toHaveBeenCalled();
  });
});
