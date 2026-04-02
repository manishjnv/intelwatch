import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { IOCRepository } from '../repository.js';
import { ListIOCsQuerySchema, IOCIdParamsSchema } from '../schema.js';
import { authenticate, getUser } from '../plugins/auth.js';
import { getUnknownTypeStats } from '../stats-counter.js';

export function iocRoutes(repo: IOCRepository) {
  return async function (app: FastifyInstance): Promise<void> {

    /** GET /api/v1/iocs — List IOCs with search, filter, pagination */
    app.get('/', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const query = ListIOCsQuerySchema.parse(req.query);
      const result = await repo.findMany(user.tenantId, query);

      return reply.send({
        data: {
          data: result.data,
          total: result.total,
          page: query.page,
          limit: query.limit,
        },
      });
    });

    /** GET /api/v1/iocs/stats — IOC statistics for tenant */
    app.get('/stats', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const stats = await repo.getStats(user.tenantId);
      return reply.send({ data: { ...stats, ...getUnknownTypeStats() } });
    });

    /** GET /api/v1/iocs/:id — Get single IOC by ID */
    app.get('/:id', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = IOCIdParamsSchema.parse(req.params);
      const ioc = await repo.findById(user.tenantId, id);

      if (!ioc) {
        throw new AppError(404, `IOC not found: ${id}`, 'NOT_FOUND');
      }

      return reply.send({ data: ioc });
    });
  };
}
