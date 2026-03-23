import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SsoService } from '../services/sso-service.js';
import type { AuditLogger } from '../services/audit-logger.js';
import { SamlConfigSchema, OidcConfigSchema } from '../schemas/user-management.js';

export interface SsoRouteDeps {
  ssoService: SsoService;
  auditLogger: AuditLogger;
}

/** Create SSO configuration route plugin. */
export function ssoRoutes(deps: SsoRouteDeps) {
  const { ssoService, auditLogger } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /sso — Get tenant SSO configuration. */
    app.get('/sso', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const config = ssoService.getConfig(tenantId);
      if (!config) return reply.send({ data: null });
      // Mask OIDC client secret in response
      const safeConfig = {
        ...config,
        oidc: config.oidc ? { ...config.oidc, clientSecret: '***' } : null,
      };
      return reply.send({ data: safeConfig });
    });

    /** PUT /sso/saml — Configure SAML 2.0 for tenant. */
    app.put('/sso/saml', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'system';
      const input = SamlConfigSchema.parse(req.body);
      const config = ssoService.configureSaml(tenantId, input, userId);
      auditLogger.log({
        tenantId, userId,
        action: 'sso.saml_configured', riskLevel: 'high',
        details: { enabled: input.enabled, entityId: input.entityId, domains: input.allowedDomains },
      });
      return reply.send({ data: config });
    });

    /** PUT /sso/oidc — Configure OIDC for tenant. */
    app.put('/sso/oidc', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'system';
      const input = OidcConfigSchema.parse(req.body);
      const config = ssoService.configureOidc(tenantId, input, userId);
      auditLogger.log({
        tenantId, userId,
        action: 'sso.oidc_configured', riskLevel: 'high',
        details: { enabled: input.enabled, issuerUrl: input.issuerUrl, domains: input.allowedDomains },
      });
      // Mask client secret in response
      const safeConfig = {
        ...config,
        oidc: config.oidc ? { ...config.oidc, clientSecret: '***' } : null,
      };
      return reply.send({ data: safeConfig });
    });

    /** POST /sso/test — Test SSO connection. */
    app.post('/sso/test', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const result = ssoService.testConnection(tenantId);
      return reply.send({ data: result });
    });

    /** DELETE /sso — Disable SSO for tenant. */
    app.delete('/sso', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      ssoService.disableSso(tenantId);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'sso.disabled', riskLevel: 'critical',
        details: {},
      });
      return reply.status(204).send();
    });
  };
}
