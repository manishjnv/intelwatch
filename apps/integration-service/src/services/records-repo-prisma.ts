import type { PrismaClient, Prisma } from '@prisma/client';
import type { IntegrationLog, WebhookDelivery, Ticket, LogStatus } from '../schemas/integration.js';
import type { IntegrationRecordsRepo } from './records-repo.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `s` looks like a Postgres uuid column value. */
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// ─── Row <-> domain mappers ──────────────────────────────────────

interface LogRow {
  id: string; tenantId: string; integrationId: string; event: string; status: string;
  statusCode: number | null; errorMessage: string | null; attempt: number;
  payload: unknown; responseBody: string | null; createdAt: Date;
}

function logFromRow(row: LogRow): IntegrationLog {
  return {
    id: row.id,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    event: row.event as IntegrationLog['event'],
    status: row.status as LogStatus,
    statusCode: row.statusCode,
    errorMessage: row.errorMessage,
    attempt: row.attempt,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    responseBody: row.responseBody,
    createdAt: row.createdAt.toISOString(),
  };
}

interface DeliveryRow {
  id: string; tenantId: string; integrationId: string; event: string; payload: unknown;
  attempts: number; maxAttempts: number; status: string; nextRetryAt: Date | null;
  lastError: string | null; createdAt: Date;
}

function deliveryFromRow(row: DeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    event: row.event as WebhookDelivery['event'],
    payload: (row.payload ?? {}) as Record<string, unknown>,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextRetryAt: row.nextRetryAt ? row.nextRetryAt.toISOString() : null,
    status: row.status as LogStatus,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

interface TicketRow {
  id: string; tenantId: string; integrationId: string; externalId: string; externalUrl: string;
  alertId: string; title: string; status: string; priority: string; createdAt: Date; updatedAt: Date;
}

function ticketFromRow(row: TicketRow): Ticket {
  return {
    id: row.id,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    externalId: row.externalId,
    externalUrl: row.externalUrl,
    alertId: row.alertId,
    title: row.title,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Prisma-backed IntegrationRecordsRepo (Step 3 S156). The store decides throw-vs-best-effort — this never wraps errors. */
export function createPrismaRecordsRepo(prisma: PrismaClient): IntegrationRecordsRepo {
  return {
    async addLog(log) {
      await prisma.integrationLog.create({
        data: {
          id: log.id,
          tenantId: log.tenantId,
          integrationId: log.integrationId,
          event: log.event,
          status: log.status,
          statusCode: log.statusCode,
          errorMessage: log.errorMessage,
          attempt: log.attempt,
          payload: log.payload as Prisma.InputJsonValue,
          responseBody: log.responseBody,
          createdAt: new Date(log.createdAt),
        },
      });
    },

    async listLogs(tenantId, integrationId, page, limit) {
      if (!isUuid(tenantId) || !isUuid(integrationId)) return { data: [], total: 0 };
      const where = { tenantId, integrationId };
      const [rows, total] = await Promise.all([
        prisma.integrationLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.integrationLog.count({ where }),
      ]);
      return { data: rows.map(logFromRow), total };
    },

    async countLogs(tenantId, status) {
      if (!isUuid(tenantId)) return 0;
      return prisma.integrationLog.count({ where: { tenantId, ...(status ? { status } : {}) } });
    },

    async deleteLogsForIntegration(tenantId, integrationId) {
      if (!isUuid(tenantId) || !isUuid(integrationId)) return;
      await prisma.integrationLog.deleteMany({ where: { tenantId, integrationId } });
    },

    async insertDelivery(d) {
      await prisma.integrationDelivery.create({
        data: {
          id: d.id,
          tenantId: d.tenantId,
          integrationId: d.integrationId,
          event: d.event,
          payload: d.payload as Prisma.InputJsonValue,
          attempts: d.attempts,
          maxAttempts: d.maxAttempts,
          status: d.status,
          nextRetryAt: d.nextRetryAt ? new Date(d.nextRetryAt) : null,
          lastError: d.lastError,
          createdAt: new Date(d.createdAt),
        },
      });
    },

    async updateDelivery(id, patch) {
      if (!isUuid(id)) return null;
      try {
        const row = await prisma.integrationDelivery.update({
          where: { id },
          data: {
            ...(patch.event !== undefined ? { event: patch.event } : {}),
            ...(patch.payload !== undefined ? { payload: patch.payload as Prisma.InputJsonValue } : {}),
            ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
            ...(patch.maxAttempts !== undefined ? { maxAttempts: patch.maxAttempts } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.nextRetryAt !== undefined ? { nextRetryAt: patch.nextRetryAt ? new Date(patch.nextRetryAt) : null } : {}),
            ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
          },
        });
        return deliveryFromRow(row);
      } catch {
        return null; // not found
      }
    },

    async getDelivery(id) {
      if (!isUuid(id)) return null;
      const row = await prisma.integrationDelivery.findUnique({ where: { id } });
      return row ? deliveryFromRow(row) : null;
    },

    async listDeliveries(tenantId, status, page, limit) {
      if (!isUuid(tenantId)) return { data: [], total: 0 };
      const where = { tenantId, status };
      const [rows, total] = await Promise.all([
        prisma.integrationDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.integrationDelivery.count({ where }),
      ]);
      return { data: rows.map(deliveryFromRow), total };
    },

    async countDeliveries(tenantId, status) {
      if (!isUuid(tenantId)) return 0;
      return prisma.integrationDelivery.count({ where: { tenantId, status } });
    },

    async insertTicket(t) {
      await prisma.integrationTicket.create({
        data: {
          id: t.id,
          tenantId: t.tenantId,
          integrationId: t.integrationId,
          externalId: t.externalId,
          externalUrl: t.externalUrl,
          alertId: t.alertId,
          title: t.title,
          status: t.status,
          priority: t.priority,
          createdAt: new Date(t.createdAt),
          updatedAt: new Date(t.updatedAt),
        },
      });
    },

    async getTicket(id) {
      if (!isUuid(id)) return null;
      const row = await prisma.integrationTicket.findUnique({ where: { id } });
      return row ? ticketFromRow(row) : null;
    },

    async updateTicket(id, patch) {
      if (!isUuid(id)) return null;
      try {
        const row = await prisma.integrationTicket.update({
          where: { id },
          data: { status: patch.status, updatedAt: new Date(patch.updatedAt) },
        });
        return ticketFromRow(row);
      } catch {
        return null; // not found
      }
    },

    async listTickets(tenantId, integrationId, page, limit) {
      if (!isUuid(tenantId)) return { data: [], total: 0 };
      const where = { tenantId, ...(integrationId ? { integrationId } : {}) };
      const [rows, total] = await Promise.all([
        prisma.integrationTicket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.integrationTicket.count({ where }),
      ]);
      return { data: rows.map(ticketFromRow), total };
    },

    async countTickets(tenantId) {
      if (!isUuid(tenantId)) return 0;
      return prisma.integrationTicket.count({ where: { tenantId } });
    },

    async purgeOlderThan(before) {
      const [logs, deliveries] = await Promise.all([
        prisma.integrationLog.deleteMany({ where: { createdAt: { lt: before } } }),
        prisma.integrationDelivery.deleteMany({ where: { status: 'success', createdAt: { lt: before } } }),
      ]);
      return logs.count + deliveries.count;
    },
  };
}
