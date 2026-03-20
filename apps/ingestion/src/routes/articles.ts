import type { FastifyInstance } from 'fastify';
import { PERMISSIONS } from '@etip/shared-auth';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import { ArticleIdParamsSchema, ListArticlesQuerySchema } from '../schema.js';
import type { FeedRepository } from '../repository.js';

export function articleRoutes(repo: FeedRepository) {
  return async function (app: FastifyInstance): Promise<void> {

    // GET /api/v1/articles — List processed articles (paginated)
    app.get('/', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const query = ListArticlesQuerySchema.parse(req.query);

      const [data, total] = await Promise.all([
        repo.findArticles(user.tenantId, query),
        repo.countArticles(user.tenantId, query),
      ]);

      return reply.send({
        data,
        total,
        page: query.page,
        limit: query.limit,
      });
    });

    // GET /api/v1/articles/:id — Article detail with full pipeline status
    app.get('/:id', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ArticleIdParamsSchema.parse(req.params);

      const article = await repo.findArticleById(user.tenantId, id);
      if (!article) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Article not found' } });
      }

      return reply.send({ data: article });
    });
  };
}
