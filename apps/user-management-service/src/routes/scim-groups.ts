import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { buildScimError } from '@etip/shared-types';
import type { ScimGroupService } from '../services/scim-group-service.js';
import type { ScimTokenService } from '../services/scim-token-service.js';
import { createScimAuth } from '../plugins/scim-auth.js';

export interface ScimGroupRouteDeps {
  scimGroupService: ScimGroupService;
  scimTokenService: ScimTokenService;
}

/** Get base URL from request for SCIM meta.location fields. */
function getBaseUrl(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.hostname;
  return `${proto}://${host}`;
}

/**
 * SCIM 2.0 /Groups endpoints — read-only.
 * Groups are virtual, derived from ETIP roles (tenant_admin, analyst).
 * Registered at /scim/v2/Groups.
 */
export function scimGroupRoutes(deps: ScimGroupRouteDeps) {
  const { scimGroupService, scimTokenService } = deps;
  const scimAuth = createScimAuth(scimTokenService);

  return async function (app: FastifyInstance): Promise<void> {
    // All routes require SCIM bearer token auth
    app.addHook('preHandler', scimAuth);

    // Set SCIM content type
    app.addHook('onSend', async (_req, reply, payload) => {
      reply.header('Content-Type', 'application/scim+json');
      return payload;
    });

    /** GET / — List virtual groups. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;
      const baseUrl = getBaseUrl(req);
      const result = await scimGroupService.listGroups(tenantId, baseUrl);
      return reply.send(result);
    });

    /** GET /:id — Get a single virtual group. */
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = req.scimTenantId!;
      const baseUrl = getBaseUrl(req);
      const group = await scimGroupService.getGroup(req.params.id, tenantId, baseUrl);
      return reply.send(group);
    });

    /** POST/PUT/PATCH/DELETE — Groups are read-only via SCIM. */
    const readOnlyHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply
        .status(405)
        .header('Content-Type', 'application/scim+json')
        .send(buildScimError(
          405,
          'Groups are read-only in ETIP. Use role assignments via the management API.',
          'mutability',
        ));
    };

    app.post('/', readOnlyHandler);
    app.put('/:id', readOnlyHandler);
    app.patch('/:id', readOnlyHandler);
    app.delete('/:id', readOnlyHandler);

    // SCIM error handler
    app.setErrorHandler(async (error, _req, reply) => {
      const status = 'statusCode' in error ? (error.statusCode as number) : 500;
      return reply
        .status(status)
        .header('Content-Type', 'application/scim+json')
        .send(buildScimError(status, error.message || 'Internal server error'));
    });
  };
}
