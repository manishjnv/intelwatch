import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TemplateStore } from '../services/template-store.js';

export interface TemplateRouteDeps {
  templateStore: TemplateStore;
}

export function templateRoutes(deps: TemplateRouteDeps) {
  const { templateStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/reports/templates — List available report templates
    app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
      const templates = templateStore.list();
      return reply.send({ data: templates });
    });
  };
}
