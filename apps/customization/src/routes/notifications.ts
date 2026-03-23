import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { NotificationStore } from '../services/notification-store.js';
import {
  SetNotificationPrefsSchema,
  SetChannelSchema,
  ChannelParamSchema,
  SetQuietHoursSchema,
  SetDigestSchema,
} from '../schemas/customization.js';

export interface NotificationRouteDeps {
  notificationStore: NotificationStore;
}

export function notificationRoutes(deps: NotificationRouteDeps) {
  const { notificationStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET / — Get notification preferences. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const prefs = notificationStore.getPreferences(tenantId, userId);
      return reply.send({ data: prefs });
    });

    /** PUT / — Update notification preferences. */
    app.put('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const input = SetNotificationPrefsSchema.parse(req.body);
      const prefs = notificationStore.setPreferences(tenantId, userId, input);
      return reply.send({ data: prefs });
    });

    /** PUT /channels/:channel — Configure a notification channel. */
    app.put('/channels/:channel', async (req: FastifyRequest<{ Params: { channel: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const { channel } = ChannelParamSchema.parse(req.params);
      const input = SetChannelSchema.parse(req.body);
      const result = notificationStore.setChannel(tenantId, userId, channel, input);
      return reply.send({ data: result });
    });

    /** DELETE /channels/:channel — Remove a notification channel. */
    app.delete('/channels/:channel', async (req: FastifyRequest<{ Params: { channel: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const { channel } = ChannelParamSchema.parse(req.params);
      notificationStore.removeChannel(tenantId, userId, channel);
      return reply.status(204).send();
    });

    /** PUT /quiet-hours — Set quiet hours. */
    app.put('/quiet-hours', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const input = SetQuietHoursSchema.parse(req.body);
      const result = notificationStore.setQuietHours(tenantId, userId, input);
      return reply.send({ data: result });
    });

    /** GET /digest — Get digest configuration. */
    app.get('/digest', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const digest = notificationStore.getDigestConfig(tenantId, userId);
      return reply.send({ data: digest });
    });

    /** PUT /digest — Update digest configuration. */
    app.put('/digest', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const input = SetDigestSchema.parse(req.body);
      const digest = notificationStore.setDigestConfig(tenantId, userId, input);
      return reply.send({ data: digest });
    });
  };
}
