import type { FastifyRequest, FastifyReply } from 'fastify';
import { buildScimError } from '@etip/shared-types';
import type { ScimTokenService } from '../services/scim-token-service.js';

/** Extend FastifyRequest with SCIM auth context. */
declare module 'fastify' {
  interface FastifyRequest {
    scimTenantId?: string;
    scimTokenId?: string;
  }
}

/**
 * SCIM Bearer token authentication middleware.
 * Extracts Bearer token from Authorization header, validates against scim_tokens table.
 * Sets req.scimTenantId and req.scimTokenId on success.
 */
export function createScimAuth(scimTokenService: ScimTokenService) {
  return async function scimAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply
        .status(401)
        .header('Content-Type', 'application/scim+json')
        .send(buildScimError(401, 'Missing or invalid Authorization header. Expected: Bearer <token>'));
      return;
    }

    const rawToken = authHeader.slice(7);
    if (!rawToken || rawToken.length !== 64) {
      reply
        .status(401)
        .header('Content-Type', 'application/scim+json')
        .send(buildScimError(401, 'Invalid SCIM bearer token format'));
      return;
    }

    const result = await scimTokenService.authenticateToken(rawToken);
    if (!result) {
      reply
        .status(401)
        .header('Content-Type', 'application/scim+json')
        .send(buildScimError(401, 'SCIM token is invalid, expired, or revoked'));
      return;
    }

    req.scimTenantId = result.tenantId;
    req.scimTokenId = result.tokenId;
  };
}
