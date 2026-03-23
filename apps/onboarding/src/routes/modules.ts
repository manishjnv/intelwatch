import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PlatformModule } from '../schemas/onboarding.js';
import type { ModuleReadinessChecker } from '../services/module-readiness.js';
import type { PrerequisiteValidator } from '../services/prerequisite-validator.js';

export interface ModuleRouteDeps {
  moduleReadiness: ModuleReadinessChecker;
  prerequisiteValidator: PrerequisiteValidator;
}

export function moduleRoutes(deps: ModuleRouteDeps) {
  const { moduleReadiness, prerequisiteValidator } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /modules — List all modules with readiness status. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const modules = moduleReadiness.checkAll(tenantId);
      return reply.send({ data: modules, total: modules.length });
    });

    /** GET /modules/:module — Get single module readiness. */
    app.get('/:module', async (req: FastifyRequest<{ Params: { module: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { module } = req.params;
      const readiness = moduleReadiness.checkModule(tenantId, module as PlatformModule);
      return reply.send({ data: readiness });
    });

    /** POST /modules/:module/enable — Enable a module with prerequisite check. */
    app.post('/:module/enable', async (req: FastifyRequest<{ Params: { module: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { module } = req.params;
      const result = prerequisiteValidator.enableWithValidation(tenantId, module as PlatformModule);
      const status = result.enabled ? 200 : 400;
      return reply.status(status).send({ data: result });
    });

    /** POST /modules/:module/disable — Disable a module. */
    app.post('/:module/disable', async (req: FastifyRequest<{ Params: { module: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { module } = req.params;
      const readiness = moduleReadiness.disableModule(tenantId, module as PlatformModule);
      return reply.send({ data: readiness });
    });

    /** GET /modules/prerequisites — Get all prerequisite rules. */
    app.get('/prerequisites/rules', async (_req: FastifyRequest, reply: FastifyReply) => {
      const rules = prerequisiteValidator.getRules();
      return reply.send({ data: rules, total: rules.length });
    });

    /** GET /modules/:module/dependencies — Get dependency chain. */
    app.get('/:module/dependencies', async (req: FastifyRequest<{ Params: { module: string } }>, reply: FastifyReply) => {
      const { module } = req.params;
      const chain = prerequisiteValidator.getDependencyChain(module as PlatformModule);
      return reply.send({ data: chain });
    });
  };
}
