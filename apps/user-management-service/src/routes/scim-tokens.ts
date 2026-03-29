import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ScimTokenCreateSchema } from '@etip/shared-types';
import type { ScimTokenService } from '../services/scim-token-service.js';
import type { AuditLogger } from '../services/audit-logger.js';

export interface ScimTokenRouteDeps {
  scimTokenService: ScimTokenService;
  auditLogger: AuditLogger;
}

/**
 * SCIM token management routes for tenant admins.
 * Registered at /api/v1/settings/scim/tokens (uses x-tenant-id header auth from gateway).
 */
export function scimTokenRoutes(deps: ScimTokenRouteDeps) {
  const { scimTokenService, auditLogger } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST / — Generate a new SCIM bearer token (shown once). */
    app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const userId = (req.headers['x-user-id'] as string) || '';

      if (!tenantId) {
        return reply.status(400).send({ error: { code: 'MISSING_TENANT', message: 'x-tenant-id header required' } });
      }

      const input = ScimTokenCreateSchema.parse(req.body);
      const result = await scimTokenService.createToken(
        tenantId,
        input.description,
        userId,
        input.expiresInDays,
      );

      auditLogger.log({
        tenantId,
        userId,
        action: 'scim.token_created',
        riskLevel: 'high',
        details: { tokenId: result.id, description: input.description },
      });

      return reply.status(201).send({
        data: {
          id: result.id,
          token: result.token, // Shown once — never retrievable again
          description: input.description,
        },
      });
    });

    /** GET / — List all SCIM tokens (hash redacted). */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      if (!tenantId) {
        return reply.status(400).send({ error: { code: 'MISSING_TENANT', message: 'x-tenant-id header required' } });
      }

      const tokens = await scimTokenService.listTokens(tenantId);
      return reply.send({ data: tokens, total: tokens.length });
    });

    /** DELETE /:tokenId — Revoke a SCIM token. */
    app.delete('/:tokenId', async (req: FastifyRequest<{ Params: { tokenId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const userId = (req.headers['x-user-id'] as string) || '';

      if (!tenantId) {
        return reply.status(400).send({ error: { code: 'MISSING_TENANT', message: 'x-tenant-id header required' } });
      }

      await scimTokenService.revokeToken(req.params.tokenId, tenantId);

      auditLogger.log({
        tenantId,
        userId,
        action: 'scim.token_revoked',
        riskLevel: 'high',
        details: { tokenId: req.params.tokenId },
      });

      return reply.status(204).send();
    });
  };
}
