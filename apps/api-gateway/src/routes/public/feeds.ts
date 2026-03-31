/**
 * @module routes/public/feeds
 * @description Public API feed endpoints — list feeds, list articles.
 * Auth: API key (feed:read scope).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { CursorPaginationQuerySchema } from '@etip/shared-types';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';
import { toPublicFeed, toPublicArticle, FEED_PUBLIC_SELECT, ARTICLE_PUBLIC_SELECT } from './dto.js';
import {
  decodeCursor,
  buildCursorWhere,
  buildCursorOrderBy,
  extractPaginationMeta,
} from './cursor.js';

const FeedFilterSchema = z.object({
  status: z.enum(['active', 'paused', 'error', 'disabled']).optional(),
  feedType: z.string().optional(),
});

export async function publicFeedRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth('feed:read');

  // ── GET /feeds — List tenant's feeds ──────────────────────────────
  app.get('/feeds', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const filters = FeedFilterSchema.parse(req.query);

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      enabled: true,
    };
    if (filters.status) where.status = filters.status;
    if (filters.feedType) where.feedType = filters.feedType;

    const feeds = await prisma.feedSource.findMany({
      where,
      select: FEED_PUBLIC_SELECT,
      orderBy: { name: 'asc' },
    });

    return reply.send({ data: feeds.map(toPublicFeed), total: feeds.length });
  });

  // ── GET /feeds/:id/articles — Recent articles from a feed ────────
  app.get('/feeds/:id/articles', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id: feedId } = req.params as { id: string };
    const pagination = CursorPaginationQuerySchema.parse(req.query);

    // Verify feed belongs to tenant
    const feed = await prisma.feedSource.findFirst({
      where: { id: feedId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!feed) throw new AppError(404, 'Feed not found', 'NOT_FOUND');

    const sortField = pagination.sort === 'confidence' ? 'publishedAt' : pagination.sort;
    const cursor = pagination.cursor ? decodeCursor(pagination.cursor) : null;
    const cursorWhere = buildCursorWhere(sortField === 'lastSeen' ? 'publishedAt' : sortField, pagination.order, cursor);

    const rows = await prisma.article.findMany({
      where: {
        feedSourceId: feedId,
        tenantId: user.tenantId,
        archivedAt: null,
        ...cursorWhere,
      },
      select: ARTICLE_PUBLIC_SELECT,
      orderBy: buildCursorOrderBy('publishedAt', pagination.order),
      take: pagination.limit + 1,
    });

    const { data, hasMore, nextCursor } = extractPaginationMeta(rows, pagination.limit, 'publishedAt');

    return reply.send({
      data: data.map(toPublicArticle),
      pagination: { limit: pagination.limit, hasMore, nextCursor },
    });
  });
}
