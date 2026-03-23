import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DashboardStore } from '../services/dashboard-store.js';
import { SetLayoutSchema, SaveFilterSchema, SetPreferencesSchema } from '../schemas/customization.js';

export interface DashboardRouteDeps {
  dashboardStore: DashboardStore;
}

export function dashboardRoutes(deps: DashboardRouteDeps) {
  const { dashboardStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /dashboard/layout — Get widget layout (per-user). */
    app.get('/layout', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const layout = dashboardStore.getLayout(tenantId, userId);
      return reply.send({ data: layout });
    });

    /** PUT /dashboard/layout — Update widget layout. */
    app.put('/layout', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const input = SetLayoutSchema.parse(req.body);
      const layout = dashboardStore.setLayout(tenantId, userId, input);
      return reply.send({ data: layout });
    });

    /** GET /dashboard/filters — Get saved filters. */
    app.get('/filters', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const filters = dashboardStore.getFilters(tenantId, userId);
      return reply.send({ data: filters, total: filters.length });
    });

    /** PUT /dashboard/filters — Save a filter preset. */
    app.put('/filters', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const input = SaveFilterSchema.parse(req.body);
      const filter = dashboardStore.saveFilter(tenantId, userId, input);
      return reply.status(201).send({ data: filter });
    });

    /** GET /dashboard/preferences — Get display preferences. */
    app.get('/preferences', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const prefs = dashboardStore.getPreferences(tenantId, userId);
      return reply.send({ data: prefs });
    });

    /** PUT /dashboard/preferences — Update display preferences. */
    app.put('/preferences', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'default';
      const input = SetPreferencesSchema.parse(req.body);
      const prefs = dashboardStore.setPreferences(tenantId, userId, input);
      return reply.send({ data: prefs });
    });
  };
}
