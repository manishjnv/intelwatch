import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { EscalationStore } from '../services/escalation-store.js';
import {
  CreateEscalationSchema,
  UpdateEscalationSchema,
  ListEscalationsQuerySchema,
  type CreateEscalationDto,
  type UpdateEscalationDto,
  type ListEscalationsQuery,
} from '../schemas/alert.js';
import { validate } from '../utils/validate.js';

export interface EscalationRouteDeps {
  escalationStore: EscalationStore;
}

export function escalationRoutes(deps: EscalationRouteDeps) {
  const { escalationStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/alerts/escalations — Create escalation policy
    app.post('/', async (req: FastifyRequest<{ Body: CreateEscalationDto }>, reply: FastifyReply) => {
      const body = validate(CreateEscalationSchema, req.body);
      const policy = escalationStore.create(body);
      return reply.status(201).send({ data: policy });
    });

    // GET /api/v1/alerts/escalations — List policies
    app.get('/', async (req: FastifyRequest<{ Querystring: ListEscalationsQuery }>, reply: FastifyReply) => {
      const query = validate(ListEscalationsQuerySchema, req.query);
      const result = escalationStore.list(query.tenantId, {
        page: query.page,
        limit: query.limit,
      });

      return reply.send({
        data: result.data,
        meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      });
    });

    // PUT /api/v1/alerts/escalations/:id — Update policy
    app.put(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string }; Body: UpdateEscalationDto }>, reply: FastifyReply) => {
        const body = validate(UpdateEscalationSchema, req.body);
        const policy = escalationStore.update(req.params.id, body);
        if (!policy) throw new AppError(404, `Escalation policy not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: policy });
      },
    );

    // DELETE /api/v1/alerts/escalations/:id — Delete policy
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = escalationStore.delete(req.params.id);
      if (!deleted) throw new AppError(404, `Escalation policy not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.status(204).send();
    });
  };
}
