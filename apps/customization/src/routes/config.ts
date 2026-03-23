import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ConfigPortability } from '../services/config-portability.js';
import type { AuditTrail } from '../services/audit-trail.js';
import type { ConfigVersioning } from '../services/config-versioning.js';
import { ExportSchema, ImportSchema, AuditQuerySchema, VersionQuerySchema } from '../schemas/customization.js';

export interface ConfigRouteDeps {
  configPortability: ConfigPortability;
  auditTrail: AuditTrail;
  configVersioning: ConfigVersioning;
}

export function configRoutes(deps: ConfigRouteDeps) {
  const { configPortability, auditTrail, configVersioning } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /export — Export configuration as JSON. */
    app.post('/export', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = ExportSchema.parse(req.body);
      const payload = configPortability.exportConfig(tenantId, input.sections);
      return reply.send({ data: payload });
    });

    /** POST /import — Import configuration from JSON. */
    app.post('/import', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'unknown';
      const input = ImportSchema.parse(req.body);

      const payload = {
        version: (input.config.version as string) ?? '1.0',
        exportedAt: (input.config.exportedAt as string) ?? new Date().toISOString(),
        tenantId,
        sections: (input.config.sections as Record<string, unknown>) ?? input.config,
      };

      const result = configPortability.importConfig(tenantId, payload, input.merge, userId);
      return reply.send({ data: result });
    });

    /** GET /audit — Get configuration change audit log. */
    app.get('/audit', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const opts = AuditQuerySchema.parse(req.query);
      const result = auditTrail.query(tenantId, opts);
      return reply.send({
        data: result.data,
        total: result.total,
        page: opts.page,
        limit: opts.limit,
      });
    });

    /** GET /versions — List configuration versions. */
    app.get('/versions', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const opts = VersionQuerySchema.parse(req.query);
      const result = configVersioning.listVersions(tenantId, opts.section, opts.page, opts.limit);
      return reply.send({
        data: result.data,
        total: result.total,
        page: opts.page,
        limit: opts.limit,
      });
    });
  };
}
