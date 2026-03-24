import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { ChannelStore } from '../services/channel-store.js';
import type { Notifier } from '../services/notifier.js';
import {
  CreateChannelSchema,
  UpdateChannelSchema,
  ListChannelsQuerySchema,
  type CreateChannelDto,
  type UpdateChannelDto,
  type ListChannelsQuery,
} from '../schemas/alert.js';
import { validate } from '../utils/validate.js';

export interface ChannelRouteDeps {
  channelStore: ChannelStore;
  notifier: Notifier;
}

export function channelRoutes(deps: ChannelRouteDeps) {
  const { channelStore, notifier } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/alerts/channels — Create channel
    app.post('/', async (req: FastifyRequest<{ Body: CreateChannelDto }>, reply: FastifyReply) => {
      const body = validate(CreateChannelSchema, req.body);
      const channel = channelStore.create(body);
      return reply.status(201).send({ data: channel });
    });

    // GET /api/v1/alerts/channels — List channels
    app.get('/', async (req: FastifyRequest<{ Querystring: ListChannelsQuery }>, reply: FastifyReply) => {
      const query = validate(ListChannelsQuerySchema, req.query);
      const result = channelStore.list(query.tenantId, {
        type: query.type,
        page: query.page,
        limit: query.limit,
      });

      return reply.send({
        data: result.data,
        meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      });
    });

    // PUT /api/v1/alerts/channels/:id — Update channel
    app.put(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string }; Body: UpdateChannelDto }>, reply: FastifyReply) => {
        const body = validate(UpdateChannelSchema, req.body);
        const channel = channelStore.update(req.params.id, body);
        if (!channel) throw new AppError(404, `Channel not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: channel });
      },
    );

    // DELETE /api/v1/alerts/channels/:id — Delete channel
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = channelStore.delete(req.params.id);
      if (!deleted) throw new AppError(404, `Channel not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.status(204).send();
    });

    // POST /api/v1/alerts/channels/:id/test — Send test notification
    app.post(
      '/:id/test',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const channel = channelStore.getById(req.params.id);
        if (!channel) throw new AppError(404, `Channel not found: ${req.params.id}`, 'NOT_FOUND');

        const result = await notifier.sendTest(channel);
        channelStore.recordTest(channel.id, result.success);

        return reply.send({ data: result });
      },
    );
  };
}
