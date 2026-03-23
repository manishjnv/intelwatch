import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuditStore } from '../services/audit-store.js';
import { AuditListQuerySchema, AuditExportSchema } from '../schemas/admin.js';
import { validate } from '../utils/validate.js';

export interface AuditRouteDeps {
  auditStore: AuditStore;
}

/** Audit log viewer routes (core feature 5). */
export function auditRoutes(deps: AuditRouteDeps) {
  const { auditStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET / — list audit events with filtering and pagination. */
    app.get(
      '/',
      async (req: FastifyRequest, reply: FastifyReply) => {
        const query = validate(AuditListQuerySchema, req.query);
        const result = auditStore.list(query);
        return reply.send({ data: result });
      },
    );

    /** GET /stats — audit statistics. */
    app.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ data: auditStore.getStats() });
    });

    /** POST /export — export audit log as CSV. */
    app.post(
      '/export',
      async (req: FastifyRequest, reply: FastifyReply) => {
        const body = validate(AuditExportSchema, req.body ?? {});
        const csv = auditStore.exportCsv(body);
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`)
          .send(csv);
      },
    );
  };
}
