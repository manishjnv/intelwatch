import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ModuleToggleStore } from '../services/module-toggle-store.js';
import {
  SetToggleSchema,
  BulkToggleSchema,
  ModuleParamSchema,
} from '../schemas/customization.js';

export interface ModuleToggleRouteDeps {
  moduleToggleStore: ModuleToggleStore;
}

export function moduleToggleRoutes(deps: ModuleToggleRouteDeps) {
  const { moduleToggleStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /modules — List all module toggles for tenant. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const toggles = moduleToggleStore.listToggles(tenantId);
      return reply.send({ data: toggles, total: toggles.length });
    });

    /** GET /modules/dependencies — Get module dependency graph. */
    app.get('/dependencies', async (_req: FastifyRequest, reply: FastifyReply) => {
      const graph = moduleToggleStore.getDependencyGraph();
      return reply.send({ data: graph });
    });

    /** POST /modules/validate — Validate toggle configuration. */
    app.post('/validate', async (req: FastifyRequest, reply: FastifyReply) => {
      const input = BulkToggleSchema.parse(req.body);
      const result = moduleToggleStore.validateConfiguration(input.modules);
      return reply.send({ data: result });
    });

    /** POST /modules/bulk — Bulk update toggles. */
    app.post('/bulk', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'unknown';
      const input = BulkToggleSchema.parse(req.body);
      const toggles = moduleToggleStore.bulkUpdate(tenantId, input.modules, userId);
      return reply.send({ data: toggles });
    });

    /** GET /modules/:module — Get single module toggle. */
    app.get('/:module', async (req: FastifyRequest<{ Params: { module: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { module } = ModuleParamSchema.parse(req.params);
      const toggle = moduleToggleStore.getToggle(tenantId, module);
      return reply.send({ data: toggle });
    });

    /** PUT /modules/:module — Enable/disable module. */
    app.put('/:module', async (req: FastifyRequest<{ Params: { module: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'unknown';
      const { module } = ModuleParamSchema.parse(req.params);
      const input = SetToggleSchema.parse(req.body);
      const toggle = moduleToggleStore.setToggle(tenantId, module, input, userId);
      return reply.send({ data: toggle });
    });
  };
}
