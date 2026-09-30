import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaDocRepo } from '../src/doc-repo-prisma.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PARENT = 'hunt-parent-1';
const NOT_UUID = 'tenant-legacy';

interface Doc { id: string; tenantId: string; name: string; }

function makeMockPrisma() {
  return {
    huntingDoc: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('createPrismaDocRepo (hunting-service)', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let repo: ReturnType<typeof createPrismaDocRepo<Doc>>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    repo = createPrismaDocRepo<Doc>(prisma as unknown as Parameters<typeof createPrismaDocRepo>[0], 'hunt_session');
  });

  // Non-UUID id ('hunt-1', a randomUUID(), etc.) — hunting ids are VarChar(100), not UUID.
  const doc: Doc = { id: 'hunt-1', tenantId: TENANT, name: 'a hunt' };

  // ─── kind + tenantId scoping ──────────────────────────────

  it('list scopes by tenantId and kind', async () => {
    await repo.list(TENANT);
    expect(prisma.huntingDoc.findMany.mock.calls[0]![0].where).toEqual({ tenantId: TENANT, kind: 'hunt_session' });
  });

  it('list with parentId also filters by parentId', async () => {
    await repo.list(TENANT, PARENT);
    expect(prisma.huntingDoc.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: TENANT, kind: 'hunt_session', parentId: PARENT,
    });
  });

  it('get scopes by id + tenantId + kind', async () => {
    await repo.get(doc.id, TENANT);
    expect(prisma.huntingDoc.findFirst.mock.calls[0]![0].where).toEqual({ id: doc.id, tenantId: TENANT, kind: 'hunt_session' });
  });

  it('save: updateMany is scoped to { kind, id, tenantId } and its data omits kind/id/tenantId', async () => {
    prisma.huntingDoc.updateMany.mockResolvedValueOnce({ count: 1 });
    await repo.save(doc);
    const call = prisma.huntingDoc.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ kind: 'hunt_session', id: doc.id, tenantId: TENANT });
    expect(call.data).not.toHaveProperty('kind');
    expect(call.data).not.toHaveProperty('id');
    expect(call.data).not.toHaveProperty('tenantId');
    expect(call.data.data).toEqual(doc);
    expect(prisma.huntingDoc.create).not.toHaveBeenCalled();
  });

  it('save: updateMany count 0 creates with id, tenantId, kind and the row as data', async () => {
    await repo.save(doc);
    const call = prisma.huntingDoc.create.mock.calls[0]![0];
    expect(call.data).toMatchObject({ id: doc.id, tenantId: TENANT, kind: 'hunt_session', parentId: null });
    expect(call.data.data).toEqual(doc);
  });

  it('save: updateMany count 0 + create rejects with P2002 -> AppError 409 CONFLICT', async () => {
    prisma.huntingDoc.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(repo.save(doc)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('two repos of different kinds saving the same id each call create with their own kind (composite-key proof)', async () => {
    const otherPrisma = makeMockPrisma();
    const otherRepo = createPrismaDocRepo<Doc>(otherPrisma as unknown as Parameters<typeof createPrismaDocRepo>[0], 'playbook_execution');
    await repo.save(doc); // kind: hunt_session
    await otherRepo.save(doc); // same id, kind: playbook_execution
    expect(prisma.huntingDoc.create.mock.calls[0]![0].data).toMatchObject({ id: doc.id, kind: 'hunt_session' });
    expect(otherPrisma.huntingDoc.create.mock.calls[0]![0].data).toMatchObject({ id: doc.id, kind: 'playbook_execution' });
  });

  it('delete scopes deleteMany by id + tenantId + kind', async () => {
    prisma.huntingDoc.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await repo.delete(doc.id, TENANT)).toBe(true);
    expect(prisma.huntingDoc.deleteMany.mock.calls[0]![0].where).toEqual({ id: doc.id, tenantId: TENANT, kind: 'hunt_session' });
  });

  it('deleteByParent scopes by tenantId + kind + parentId', async () => {
    prisma.huntingDoc.deleteMany.mockResolvedValueOnce({ count: 3 });
    expect(await repo.deleteByParent(TENANT, PARENT)).toBe(3);
    expect(prisma.huntingDoc.deleteMany.mock.calls[0]![0].where).toEqual({ tenantId: TENANT, kind: 'hunt_session', parentId: PARENT });
  });

  // ─── id may be any non-empty string ≤100 chars (not UUID) ─

  it('save accepts a non-UUID id (hunt ids are VarChar(100))', async () => {
    prisma.huntingDoc.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(repo.save(doc)).resolves.toEqual(doc);
  });

  it('save rejects an id over 100 characters', async () => {
    const longId = 'x'.repeat(101);
    await expect(repo.save({ ...doc, id: longId })).rejects.toMatchObject({
      statusCode: 400, code: 'VALIDATION_ERROR',
    });
    expect(prisma.huntingDoc.updateMany).not.toHaveBeenCalled();
  });

  // ─── Non-UUID tenantId guards make no Prisma call ─────────

  it('list with non-UUID tenantId returns [] without calling Prisma', async () => {
    expect(await repo.list(NOT_UUID)).toEqual([]);
    expect(prisma.huntingDoc.findMany).not.toHaveBeenCalled();
  });

  it('get with non-UUID tenantId returns null without calling Prisma', async () => {
    expect(await repo.get(doc.id, NOT_UUID)).toBeNull();
    expect(prisma.huntingDoc.findFirst).not.toHaveBeenCalled();
  });

  it('save with non-UUID tenantId throws VALIDATION_ERROR without calling Prisma', async () => {
    await expect(repo.save({ ...doc, tenantId: NOT_UUID })).rejects.toMatchObject({
      statusCode: 400, code: 'VALIDATION_ERROR',
    });
    expect(prisma.huntingDoc.updateMany).not.toHaveBeenCalled();
  });

  it('delete with non-UUID tenantId returns false without calling Prisma', async () => {
    expect(await repo.delete(doc.id, NOT_UUID)).toBe(false);
    expect(prisma.huntingDoc.deleteMany).not.toHaveBeenCalled();
  });

  it('deleteByParent with non-UUID tenantId returns 0 without calling Prisma', async () => {
    expect(await repo.deleteByParent(NOT_UUID, PARENT)).toBe(0);
    expect(prisma.huntingDoc.deleteMany).not.toHaveBeenCalled();
  });

  // ─── DB errors → 503 DB_UNAVAILABLE ───────────────────────

  it('list rejects with 503 DB_UNAVAILABLE on Prisma error', async () => {
    prisma.huntingDoc.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(repo.list(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });

  it('save rejects with 503 DB_UNAVAILABLE on Prisma error', async () => {
    prisma.huntingDoc.updateMany.mockRejectedValueOnce(new Error('db down'));
    await expect(repo.save(doc)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });

  // ─── Data round-trip ───────────────────────────────────────

  it('list maps stored data back to the row type', async () => {
    prisma.huntingDoc.findMany.mockResolvedValueOnce([{ data: doc }]);
    const rows = await repo.list(TENANT);
    expect(rows).toEqual([doc]);
  });

  it('get maps stored data back to the row type', async () => {
    prisma.huntingDoc.findFirst.mockResolvedValueOnce({ data: doc });
    expect(await repo.get(doc.id, TENANT)).toEqual(doc);
  });
});
