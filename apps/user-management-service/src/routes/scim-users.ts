import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ScimUserBodySchema,
  ScimPatchBodySchema,
  ScimListQuerySchema,
  buildScimError,
} from '@etip/shared-types';
import type { ScimUserService } from '../services/scim-user-service.js';
import type { ScimTokenService } from '../services/scim-token-service.js';
import type { AuditLogger } from '../services/audit-logger.js';
import { createScimAuth } from '../plugins/scim-auth.js';

export interface ScimUserRouteDeps {
  scimUserService: ScimUserService;
  scimTokenService: ScimTokenService;
  auditLogger: AuditLogger;
}

/** Get base URL from request for SCIM meta.location fields. */
function getBaseUrl(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.hostname;
  return `${proto}://${host}`;
}

/**
 * SCIM 2.0 /Users endpoints per RFC 7643/7644.
 * Authenticated via SCIM bearer token (not JWT).
 * Registered at /scim/v2/Users.
 */
export function scimUserRoutes(deps: ScimUserRouteDeps) {
  const { scimUserService, scimTokenService, auditLogger } = deps;
  const scimAuth = createScimAuth(scimTokenService);

  return async function (app: FastifyInstance): Promise<void> {
    // All routes require SCIM bearer token auth
    app.addHook('preHandler', scimAuth);

    // Set SCIM content type on all responses
    app.addHook('onSend', async (_req, reply, payload) => {
      reply.header('Content-Type', 'application/scim+json');
      return payload;
    });

    /** GET / — List users with optional filter + pagination. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;
      const query = ScimListQuerySchema.parse(req.query);
      const baseUrl = getBaseUrl(req);

      const result = await scimUserService.listUsers(
        tenantId,
        baseUrl,
        query.filter,
        query.startIndex,
        query.count,
      );
      return reply.send(result);
    });

    /** GET /:id — Get single user. */
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;
      const baseUrl = getBaseUrl(req);

      const user = await scimUserService.getUser(req.params.id, tenantId, baseUrl);
      return reply.send(user);
    });

    /** POST / — Create (provision) user. */
    app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;
      const baseUrl = getBaseUrl(req);
      const body = ScimUserBodySchema.parse(req.body);

      const user = await scimUserService.createUser(tenantId, body, baseUrl);

      auditLogger.log({
        tenantId,
        userId: null,
        action: 'scim.user.provisioned',
        riskLevel: 'medium',
        details: { userId: user.id, email: user.userName, externalId: user.externalId },
      });

      return reply
        .status(201)
        .header('Location', user.meta.location)
        .send(user);
    });

    /** PUT /:id — Full replace user. */
    app.put('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;
      const baseUrl = getBaseUrl(req);
      const body = ScimUserBodySchema.parse(req.body);

      const user = await scimUserService.replaceUser(req.params.id, tenantId, body, baseUrl);

      auditLogger.log({
        tenantId,
        userId: null,
        action: 'scim.user.replaced',
        riskLevel: 'medium',
        details: { userId: user.id, active: user.active },
      });

      return reply.send(user);
    });

    /** PATCH /:id — Partial update (RFC 7644 PATCH operations). */
    app.patch('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;
      const baseUrl = getBaseUrl(req);
      const patchBody = ScimPatchBodySchema.parse(req.body);

      const user = await scimUserService.patchUser(
        req.params.id,
        tenantId,
        patchBody.Operations,
        baseUrl,
      );

      const wasDeactivated = patchBody.Operations.some(
        (op) => op.path === 'active' && op.value === false,
      );
      if (wasDeactivated) {
        auditLogger.log({
          tenantId,
          userId: null,
          action: 'scim.user.deprovisioned',
          riskLevel: 'high',
          details: { userId: user.id, email: user.userName },
        });
      }

      return reply.send(user);
    });

    /** DELETE /:id — De-provision user (soft delete). */
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;

      await scimUserService.deleteUser(req.params.id, tenantId);

      auditLogger.log({
        tenantId,
        userId: null,
        action: 'scim.user.deprovisioned',
        riskLevel: 'high',
        details: { userId: req.params.id },
      });

      return reply.status(204).send();
    });

    // ─── Error handler (SCIM error format) ──────────────────────────
    app.setErrorHandler(async (error, _req, reply) => {
      // Zod validation errors
      if (error.name === 'ZodError') {
        return reply
          .status(400)
          .header('Content-Type', 'application/scim+json')
          .send(buildScimError(400, `Validation error: ${error.message}`, 'invalidValue'));
      }

      // AppError with SCIM details
      const status = 'statusCode' in error ? (error.statusCode as number) : 500;
      const detail = error.message || 'Internal server error';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scimDetails = (error as any).details;

      if (scimDetails && typeof scimDetails === 'object' && 'schemas' in scimDetails) {
        return reply.status(status).header('Content-Type', 'application/scim+json').send(scimDetails);
      }

      return reply
        .status(status)
        .header('Content-Type', 'application/scim+json')
        .send(buildScimError(status, detail));
    });
  };
}
