/**
 * @module routes/public/iocs
 * @description Public API IOC endpoints — list, detail, search.
 * Auth: API key (ioc:read scope). TLP:RED always excluded.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import {
  CursorPaginationQuerySchema,
  PublicIocFilterSchema,
  PublicIocSearchBodySchema,
} from '@etip/shared-types';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';
import { toPublicIoc, IOC_PUBLIC_SELECT } from './dto.js';
import { buildIocWhere } from './filters.js';
import {
  decodeCursor,
  buildCursorWhere,
  buildCursorOrderBy,
  extractPaginationMeta,
} from './cursor.js';

/** Optional updatedSince query param for delta sync. */
const DeltaSyncSchema = z.object({
  updatedSince: z.string().datetime().optional(),
});

export async function publicIocRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth('ioc:read');

  // ── GET /iocs — List IOCs with cursor pagination + filters ────────
  app.get('/iocs', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const pagination = CursorPaginationQuerySchema.parse(req.query);
    const filters = PublicIocFilterSchema.parse(req.query);
    const { updatedSince } = DeltaSyncSchema.parse(req.query);

    const cursor = pagination.cursor ? decodeCursor(pagination.cursor) : null;
    const cursorWhere = buildCursorWhere(pagination.sort, pagination.order, cursor);

    // Delta sync: only return IOCs updated after the given timestamp
    const extra: Record<string, unknown> = { ...cursorWhere };
    if (updatedSince) {
      extra.updatedAt = { gte: new Date(updatedSince) };
    }

    const where = buildIocWhere(user.tenantId, filters, extra);

    const rows = await prisma.ioc.findMany({
      where,
      select: IOC_PUBLIC_SELECT,
      orderBy: buildCursorOrderBy(pagination.sort, pagination.order),
      take: pagination.limit + 1,
    });

    const { data, hasMore, nextCursor } = extractPaginationMeta(rows, pagination.limit, pagination.sort);

    return reply.send({
      data: data.map(toPublicIoc),
      pagination: { limit: pagination.limit, hasMore, nextCursor },
    });
  });

  // ── GET /iocs/:id — IOC detail ───────────────────────────────────
  app.get('/iocs/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };

    const ioc = await prisma.ioc.findFirst({
      where: { id, tenantId: user.tenantId, tlp: { not: 'red' } },
      select: IOC_PUBLIC_SELECT,
    });

    if (!ioc) throw new AppError(404, 'IOC not found', 'NOT_FOUND');

    return reply.send({ data: toPublicIoc(ioc) });
  });

  // ── POST /iocs/search — Search IOCs by value ────────────────────
  app.post('/iocs/search', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const body = PublicIocSearchBodySchema.parse(req.body);

    const cursor = body.cursor ? decodeCursor(body.cursor) : null;
    const cursorWhere = buildCursorWhere('lastSeen', 'desc', cursor);

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      tlp: { not: 'red' },
      archivedAt: null,
      ...cursorWhere,
    };

    if (body.iocType) where.iocType = body.iocType;

    if (body.exact) {
      where.value = body.query;
    } else {
      where.value = { contains: body.query, mode: 'insensitive' };
    }

    const rows = await prisma.ioc.findMany({
      where,
      select: IOC_PUBLIC_SELECT,
      orderBy: buildCursorOrderBy('lastSeen', 'desc'),
      take: body.limit + 1,
    });

    const { data, hasMore, nextCursor } = extractPaginationMeta(rows, body.limit, 'lastSeen');

    return reply.send({
      data: data.map(toPublicIoc),
      pagination: { limit: body.limit, hasMore, nextCursor },
    });
  });
}
