import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaDocRepo } from '../src/services/doc-repo-prisma.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PARENT = '22222222-2222-2222-2222-222222222222';
const NOT_UUID = 'tenant-legacy';

interface Doc { id: string; tenantId: string; name: string; }

function makeMockPrisma() {
  return {
    integrationDoc: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('createPrismaDocRepo', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let repo: ReturnType<typeof createPrismaDocRepo<Doc>>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    repo = createPrismaDocRepo<Doc>(prisma as unknown as Parameters<typeof createPrismaDocRepo>[0], 'routing_rule');
  });

  const doc: Doc = { id: '33333333-3333-3333-3333-333333333333', tenantId: TENANT, name: 'a rule' };

  // ─── kind + tenantId scoping ──────────────────────────────

  it('list scopes by tenantId and kind', async () => {
    await repo.list(TENANT);
    expect(prisma.integrationDoc.findMany.mock.calls[0]![0].where).toEqual({ tenantId: TENANT, kind: 'routing_rule' });
  });

  it('list with parentId also filters by parentId', async () => {
    await repo.list(TENANT, PARENT);
    expect(prisma.integrationDoc.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: TENANT, kind: 'routing_rule', parentId: PARENT,
    });
  });

  it('get scopes by id + tenantId + kind', async () => {
    await repo.get(doc.id, TENANT);
    expect(prisma.integrationDoc.findFirst.mock.calls[0]![0].where).toEqual({ id: doc.id, tenantId: TENANT, kind: 'routing_rule' });
  });

  it('save: updateMany is scoped to { kind, id, tenantId } and its data omits kind/id/tenantId', async () => {
    prisma.integrationDoc.updateMany.mockResolvedValueOnce({ count: 1 });
    await repo.save(doc);
    const call = prisma.integrationDoc.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ kind: 'routing_rule', id: doc.id, tenantId: TENANT });
    expect(call.data).not.toHaveProperty('kind');
    expect(call.data).not.toHaveProperty('id');
    expect(call.data).not.toHaveProperty('tenantId');
    expect(call.data.data).toEqual(doc);
    expect(prisma.integrationDoc.create).not.toHaveBeenCalled();
  });

  it('save: updateMany count 0 creates with id, tenantId, kind and the row as data', async () => {
    await repo.save(doc);
    const call = prisma.integrationDoc.create.mock.calls[0]![0];
    expect(call.data).toMatchObject({ id: doc.id, tenantId: TENANT, kind: 'routing_rule', parentId: null });
    expect(call.data.data).toEqual(doc);
  });

  it('save: updateMany count 0 + create rejects with P2002 -> AppError 409 CONFLICT, no other write', async () => {
    prisma.integrationDoc.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(repo.save(doc)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(prisma.integrationDoc.findFirst).not.toHaveBeenCalled();
  });

  it('two repos of different kinds saving the same id each call create with their own kind (composite-key proof)', async () => {
    const otherPrisma = makeMockPrisma();
    const otherRepo = createPrismaDocRepo<Doc>(otherPrisma as unknown as Parameters<typeof createPrismaDocRepo>[0], 'taxii_objects');
    await repo.save(doc); // kind: routing_rule
    await otherRepo.save(doc); // same id, kind: taxii_objects
    expect(prisma.integrationDoc.create.mock.calls[0]![0].data).toMatchObject({ id: doc.id, kind: 'routing_rule' });
    expect(otherPrisma.integrationDoc.create.mock.calls[0]![0].data).toMatchObject({ id: doc.id, kind: 'taxii_objects' });
  });

  it('delete scopes deleteMany by id + tenantId + kind', async () => {
    prisma.integrationDoc.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await repo.delete(doc.id, TENANT)).toBe(true);
    expect(prisma.integrationDoc.deleteMany.mock.calls[0]![0].where).toEqual({ id: doc.id, tenantId: TENANT, kind: 'routing_rule' });
  });

  it('deleteByParent scopes by tenantId + kind + parentId', async () => {
    prisma.integrationDoc.deleteMany.mockResolvedValueOnce({ count: 3 });
    expect(await repo.deleteByParent(TENANT, PARENT)).toBe(3);
    expect(prisma.integrationDoc.deleteMany.mock.calls[0]![0].where).toEqual({ tenantId: TENANT, kind: 'routing_rule', parentId: PARENT });
  });

  // ─── Non-UUID guards make no Prisma call ──────────────────

  it('list with non-UUID tenantId returns [] without calling Prisma', async () => {
    expect(await repo.list(NOT_UUID)).toEqual([]);
    expect(prisma.integrationDoc.findMany).not.toHaveBeenCalled();
  });

  it('list with non-UUID parentId returns [] without calling Prisma', async () => {
    expect(await repo.list(TENANT, NOT_UUID)).toEqual([]);
    expect(prisma.integrationDoc.findMany).not.toHaveBeenCalled();
  });

  it('get with non-UUID id or tenantId returns null without calling Prisma', async () => {
    expect(await repo.get(NOT_UUID, TENANT)).toBeNull();
    expect(await repo.get(doc.id, NOT_UUID)).toBeNull();
    expect(prisma.integrationDoc.findFirst).not.toHaveBeenCalled();
  });

  it('save with non-UUID tenantId throws VALIDATION_ERROR without calling Prisma', async () => {
    await expect(repo.save({ ...doc, tenantId: NOT_UUID })).rejects.toMatchObject({
      statusCode: 400, code: 'VALIDATION_ERROR',
    });
    expect(prisma.integrationDoc.updateMany).not.toHaveBeenCalled();
  });

  it('delete with non-UUID id or tenantId returns false without calling Prisma', async () => {
    expect(await repo.delete(NOT_UUID, TENANT)).toBe(false);
    expect(await repo.delete(doc.id, NOT_UUID)).toBe(false);
    expect(prisma.integrationDoc.deleteMany).not.toHaveBeenCalled();
  });

  it('deleteByParent with non-UUID tenantId or parentId returns 0 without calling Prisma', async () => {
    expect(await repo.deleteByParent(NOT_UUID, PARENT)).toBe(0);
    expect(await repo.deleteByParent(TENANT, NOT_UUID)).toBe(0);
    expect(prisma.integrationDoc.deleteMany).not.toHaveBeenCalled();
  });

  // ─── DB errors → 503 DB_UNAVAILABLE ───────────────────────

  it('list rejects with 503 DB_UNAVAILABLE on Prisma error', async () => {
    prisma.integrationDoc.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(repo.list(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });

  it('save rejects with 503 DB_UNAVAILABLE on Prisma error', async () => {
    prisma.integrationDoc.updateMany.mockRejectedValueOnce(new Error('db down'));
    await expect(repo.save(doc)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });

  // ─── Data round-trip ───────────────────────────────────────

  it('list maps stored data back to the row type', async () => {
    prisma.integrationDoc.findMany.mockResolvedValueOnce([{ data: doc }]);
    const rows = await repo.list(TENANT);
    expect(rows).toEqual([doc]);
  });

  it('get maps stored data back to the row type', async () => {
    prisma.integrationDoc.findFirst.mockResolvedValueOnce({ data: doc });
    expect(await repo.get(doc.id, TENANT)).toEqual(doc);
  });
});
