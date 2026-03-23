import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { BreakGlassService } from '../services/break-glass-service.js';
import { BreakGlassSetupSchema, BreakGlassLoginSchema } from '../schemas/user-management.js';

export interface BreakGlassRouteDeps {
  breakGlassService: BreakGlassService;
}

/** Create break-glass route plugin. */
export function breakGlassRoutes(deps: BreakGlassRouteDeps) {
  const { breakGlassService } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /break-glass/setup — Create break-glass account + recovery codes. */
    app.post('/break-glass/setup', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'system';
      const { reason } = BreakGlassSetupSchema.parse(req.body);
      const result = breakGlassService.setup(tenantId, reason, userId);
      return reply.status(201).send({ data: result });
    });

    /** POST /break-glass/login — Login with recovery code (bypasses SSO+MFA). */
    app.post('/break-glass/login', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { code, reason } = BreakGlassLoginSchema.parse(req.body);
      const session = breakGlassService.login(tenantId, code, reason, req.ip);
      return reply.send({ data: session });
    });

    /** POST /break-glass/rotate — Rotate recovery codes. */
    app.post('/break-glass/rotate', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'system';
      const { reason } = BreakGlassSetupSchema.parse(req.body);
      const codes = breakGlassService.rotateCodes(tenantId, reason, userId);
      return reply.send({ data: { codes, count: codes.length } });
    });

    /** GET /break-glass/log — Get break-glass usage history. */
    app.get('/break-glass/log', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const log = breakGlassService.getUsageLog(tenantId);
      return reply.send({ data: log });
    });
  };
}
