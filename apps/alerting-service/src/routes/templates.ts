import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { RuleStore } from '../services/rule-store.js';
import { getTemplates, getTemplateById } from '../services/rule-templates.js';

export interface TemplateRouteDeps {
  ruleStore: RuleStore;
}

export function templateRoutes(deps: TemplateRouteDeps) {
  const { ruleStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/alerts/templates — List available rule templates
    app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ data: getTemplates() });
    });

    // GET /api/v1/alerts/templates/:id — Get a specific template
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const template = getTemplateById(req.params.id);
      if (!template) throw new AppError(404, `Template not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: template });
    });

    // POST /api/v1/alerts/templates/:id/apply — Create a rule from a template
    app.post(
      '/:id/apply',
      async (
        req: FastifyRequest<{ Params: { id: string }; Body: { tenantId?: string } }>,
        reply: FastifyReply,
      ) => {
        const template = getTemplateById(req.params.id);
        if (!template) throw new AppError(404, `Template not found: ${req.params.id}`, 'NOT_FOUND');

        const tenantId = req.body?.tenantId ?? 'default';
        const rule = ruleStore.create({ ...template.rule, tenantId });

        return reply.status(201).send({ data: rule });
      },
    );
  };
}
