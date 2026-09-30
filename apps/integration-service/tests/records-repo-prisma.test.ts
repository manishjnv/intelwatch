import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaRecordsRepo } from '../src/services/records-repo-prisma.js';
import type { IntegrationLog, WebhookDelivery, Ticket } from '../src/schemas/integration.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const INTEGRATION = '22222222-2222-2222-2222-222222222222';
const NOT_UUID = 'tenant-legacy';

function makeMockPrisma() {
  return {
    integrationLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    integrationDelivery: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    integrationTicket: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

describe('createPrismaRecordsRepo', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let repo: ReturnType<typeof createPrismaRecordsRepo>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    repo = createPrismaRecordsRepo(prisma as unknown as Parameters<typeof createPrismaRecordsRepo>[0]);
  });

  const log: IntegrationLog = {
    id: '33333333-3333-3333-3333-333333333333',
    tenantId: TENANT, integrationId: INTEGRATION, event: 'alert.created', status: 'success',
    statusCode: 200, errorMessage: null, attempt: 1, payload: { a: 1 }, responseBody: 'ok',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const delivery: WebhookDelivery = {
    id: '44444444-4444-4444-4444-444444444444',
    tenantId: TENANT, integrationId: INTEGRATION, event: 'alert.created', payload: { a: 1 },
    attempts: 1, maxAttempts: 3, nextRetryAt: null, status: 'retrying', lastError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const ticket: Ticket = {
    id: '55555555-5555-5555-5555-555555555555',
    tenantId: TENANT, integrationId: INTEGRATION, externalId: 'INC1', externalUrl: 'https://x',
    alertId: 'alert-1', title: 'T', status: 'open', priority: 'high',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // ─── Mapping both ways (dates included) ─────────────────────

  it('addLog maps ISO string createdAt to a Date for Prisma', async () => {
    await repo.addLog(log);
    const data = prisma.integrationLog.create.mock.calls[0]![0].data;
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(data.tenantId).toBe(TENANT);
  });

  it('listLogs maps Date rows back to ISO strings', async () => {
    prisma.integrationLog.findMany.mockResolvedValueOnce([
      { ...log, createdAt: new Date(log.createdAt) },
    ]);
    const result = await repo.listLogs(TENANT, INTEGRATION, 1, 50);
    expect(result.data[0]!.createdAt).toBe(log.createdAt);
    expect(typeof result.data[0]!.createdAt).toBe('string');
  });

  it('insertDelivery / listDeliveries round-trip nullable nextRetryAt', async () => {
    await repo.insertDelivery(delivery);
    expect(prisma.integrationDelivery.create.mock.calls[0]![0].data.nextRetryAt).toBeNull();

    prisma.integrationDelivery.findMany.mockResolvedValueOnce([
      { ...delivery, nextRetryAt: new Date('2026-01-02T00:00:00.000Z'), createdAt: new Date(delivery.createdAt) },
    ]);
    const result = await repo.listDeliveries(TENANT, 'retrying', 1, 50);
    expect(result.data[0]!.nextRetryAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('insertTicket / getTicket round-trip createdAt and updatedAt', async () => {
    await repo.insertTicket(ticket);
    const data = prisma.integrationTicket.create.mock.calls[0]![0].data;
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(data.updatedAt).toBeInstanceOf(Date);

    prisma.integrationTicket.findUnique.mockResolvedValueOnce({
      ...ticket, createdAt: new Date(ticket.createdAt), updatedAt: new Date(ticket.updatedAt),
    });
    const got = await repo.getTicket(ticket.id);
    expect(got?.createdAt).toBe(ticket.createdAt);
    expect(got?.updatedAt).toBe(ticket.updatedAt);
  });

  // ─── tenantId in every tenant-facing where ───────────────────

  it('listLogs / listDeliveries / listTickets scope by tenantId', async () => {
    await repo.listLogs(TENANT, INTEGRATION, 1, 50);
    expect(prisma.integrationLog.findMany.mock.calls[0]![0].where).toMatchObject({ tenantId: TENANT });

    await repo.listDeliveries(TENANT, 'dead_letter', 1, 50);
    expect(prisma.integrationDelivery.findMany.mock.calls[0]![0].where).toMatchObject({ tenantId: TENANT });

    await repo.listTickets(TENANT, undefined, 1, 50);
    expect(prisma.integrationTicket.findMany.mock.calls[0]![0].where).toMatchObject({ tenantId: TENANT });
  });

  it('countLogs / countDeliveries / countTickets scope by tenantId', async () => {
    await repo.countLogs(TENANT, 'failure');
    expect(prisma.integrationLog.count.mock.calls[0]![0].where).toMatchObject({ tenantId: TENANT, status: 'failure' });

    await repo.countDeliveries(TENANT, 'dead_letter');
    expect(prisma.integrationDelivery.count.mock.calls[0]![0].where).toMatchObject({ tenantId: TENANT, status: 'dead_letter' });

    await repo.countTickets(TENANT);
    expect(prisma.integrationTicket.count.mock.calls[0]![0].where).toMatchObject({ tenantId: TENANT });
  });

  it('deleteLogsForIntegration scopes by tenantId and integrationId', async () => {
    await repo.deleteLogsForIntegration(TENANT, INTEGRATION);
    expect(prisma.integrationLog.deleteMany.mock.calls[0]![0].where).toEqual({ tenantId: TENANT, integrationId: INTEGRATION });
  });

  // ─── Non-UUID guards make no Prisma call ─────────────────────

  it('non-UUID tenantId/integrationId short-circuits reads without calling Prisma', async () => {
    expect(await repo.listLogs(NOT_UUID, INTEGRATION, 1, 50)).toEqual({ data: [], total: 0 });
    expect(prisma.integrationLog.findMany).not.toHaveBeenCalled();

    expect(await repo.listDeliveries(NOT_UUID, 'dead_letter', 1, 50)).toEqual({ data: [], total: 0 });
    expect(prisma.integrationDelivery.findMany).not.toHaveBeenCalled();

    expect(await repo.listTickets(NOT_UUID, undefined, 1, 50)).toEqual({ data: [], total: 0 });
    expect(prisma.integrationTicket.findMany).not.toHaveBeenCalled();

    expect(await repo.getTicket('not-a-uuid')).toBeNull();
    expect(prisma.integrationTicket.findUnique).not.toHaveBeenCalled();

    expect(await repo.countLogs(NOT_UUID)).toBe(0);
    expect(prisma.integrationLog.count).not.toHaveBeenCalled();
  });

  // ─── purgeOlderThan ───────────────────────────────────────────

  it('purgeOlderThan deletes only logs and successful deliveries older than the cutoff', async () => {
    prisma.integrationLog.deleteMany.mockResolvedValueOnce({ count: 3 });
    prisma.integrationDelivery.deleteMany.mockResolvedValueOnce({ count: 2 });

    const cutoff = new Date('2026-01-01T00:00:00.000Z');
    const deleted = await repo.purgeOlderThan(cutoff);

    expect(deleted).toBe(5);
    expect(prisma.integrationLog.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: cutoff } } });
    expect(prisma.integrationDelivery.deleteMany).toHaveBeenCalledWith({
      where: { status: 'success', createdAt: { lt: cutoff } },
    });
  });
});
