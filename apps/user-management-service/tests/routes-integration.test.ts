import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { PermissionStore } from '../src/services/permission-store.js';
import { TeamStore } from '../src/services/team-store.js';
import { SsoService } from '../src/services/sso-service.js';
import { MfaService } from '../src/services/mfa-service.js';
import { AuditLogger } from '../src/services/audit-logger.js';
import { BreakGlassService } from '../src/services/break-glass-service.js';
import { SessionManager } from '../src/services/session-manager.js';
import type { FastifyInstance } from 'fastify';

const TEST_CONFIG = {
  TI_NODE_ENV: 'test' as const,
  TI_USER_MANAGEMENT_PORT: 0,
  TI_USER_MANAGEMENT_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379',
  TI_JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-chars',
  TI_SERVICE_JWT_SECRET: 'test-service-secret-16',
  TI_CORS_ORIGINS: 'http://localhost:3002',
  TI_RATE_LIMIT_MAX: 200,
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_LOG_LEVEL: 'silent' as const,
  TI_MFA_ISSUER: 'ETIP Test',
  TI_MFA_BACKUP_CODE_COUNT: 10,
  TI_BREAK_GLASS_SESSION_TTL_MIN: 30,
  TI_SSO_CALLBACK_BASE_URL: 'http://localhost:3016',
};

describe('Route integration tests', () => {
  let app: FastifyInstance;
  let auditLogger: AuditLogger;

  beforeAll(async () => {
    auditLogger = new AuditLogger();
    const permissionStore = new PermissionStore();
    const teamStore = new TeamStore(permissionStore);
    const ssoService = new SsoService();
    const mfaService = new MfaService('ETIP Test', 10);
    const breakGlassService = new BreakGlassService(auditLogger, 30);
    const sessionManager = new SessionManager(15);

    app = await buildApp({
      config: TEST_CONFIG,
      permissionDeps: { permissionStore, auditLogger },
      teamDeps: { teamStore, auditLogger },
      ssoDeps: { ssoService, auditLogger },
      mfaDeps: { mfaService, auditLogger, teamStore },
      breakGlassDeps: { breakGlassService },
      sessionDeps: { sessionManager, auditLogger },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = { 'x-tenant-id': 'test-tenant', 'x-user-id': 'test-admin' };

  // ─── Permission routes ──────────────────────────────────────
  describe('Permission routes', () => {
    it('GET /api/v1/users/permissions — lists catalog', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/permissions', headers });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toContain('ioc:read');
      expect(body.data).toContain('integration:*');
    });

    it('GET /api/v1/users/roles — lists built-in roles', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/roles', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThanOrEqual(6);
    });

    it('POST /api/v1/users/roles — creates custom role', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/roles', headers,
        payload: { name: 'soc_analyst', permissions: ['ioc:read', 'alert:*'] },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.name).toBe('soc_analyst');
    });

    it('POST /api/v1/users/roles/check — checks permission', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/roles/check', headers,
        payload: { role: 'admin', permission: 'ioc:read' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.allowed).toBe(true);
    });

    it('POST /api/v1/users/roles — rejects invalid permission', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/roles', headers,
        payload: { name: 'bad_role', permissions: ['nonexistent:read'] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Team routes ────────────────────────────────────────────
  describe('Team routes', () => {
    let memberId: string;

    it('POST /api/v1/users/team/invite — invites user', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/team/invite', headers,
        payload: { email: 'newuser@test.com', role: 'analyst' },
      });
      expect(res.statusCode).toBe(201);
      memberId = res.json().data.id;
      expect(res.json().data.status).toBe('pending');
    });

    it('POST /api/v1/users/team/:id/accept — accepts invite', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/users/team/${memberId}/accept`, headers,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('active');
    });

    it('GET /api/v1/users/team — lists members', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/team', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/users/team/stats — returns counts', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/team/stats', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.total).toBeGreaterThanOrEqual(1);
    });

    it('PUT /api/v1/users/team/:id/role — changes role', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/users/team/${memberId}/role`, headers,
        payload: { role: 'hunter' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.role).toBe('hunter');
    });

    it('POST /api/v1/users/team/:id/deactivate — deactivates', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/users/team/${memberId}/deactivate`, headers,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('inactive');
    });

    it('POST /api/v1/users/team/:id/reactivate — reactivates', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/users/team/${memberId}/reactivate`, headers,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('active');
    });

    it('POST invite — rejects duplicate email', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/team/invite', headers,
        payload: { email: 'newuser@test.com', role: 'viewer' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ─── SSO routes ─────────────────────────────────────────────
  describe('SSO routes', () => {
    it('GET /api/v1/users/sso — returns null when not configured', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/sso', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBeNull();
    });

    it('PUT /api/v1/users/sso/saml — configures SAML', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/users/sso/saml', headers,
        payload: {
          enabled: true, entityId: 'https://idp.test.com', ssoUrl: 'https://idp.test.com/sso',
          certificate: 'MIIC-test-cert', allowedDomains: ['test.com'],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.saml.enabled).toBe(true);
    });

    it('PUT /api/v1/users/sso/oidc — configures OIDC (masks secret)', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/users/sso/oidc', headers,
        payload: {
          enabled: true, issuerUrl: 'https://auth.test.com', clientId: 'c1',
          clientSecret: 'super-secret', allowedDomains: ['test.com'],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.oidc.clientSecret).toBe('***');
    });

    it('POST /api/v1/users/sso/test — tests connection', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/users/sso/test', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.provider).toBeDefined();
    });

    it('DELETE /api/v1/users/sso — disables SSO', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/sso', headers });
      expect(res.statusCode).toBe(204);
    });
  });

  // ─── MFA routes ─────────────────────────────────────────────
  describe('MFA routes', () => {
    it('GET /api/v1/users/mfa/status — returns default status', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/users/mfa/status',
        headers: { ...headers, 'x-user-id': 'mfa-user-1', 'x-user-email': 'mfa@test.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enabled).toBe(false);
    });

    it('GET /api/v1/users/mfa/policy — returns default policy', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/mfa/policy', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enforcement).toBe('optional');
    });

    it('PUT /api/v1/users/mfa/policy — sets policy', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/users/mfa/policy', headers,
        payload: { enforcement: 'required', gracePeriodDays: 0 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enforcement).toBe('required');
    });

    it('POST /api/v1/users/mfa/setup — generates secret', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/mfa/setup',
        headers: { ...headers, 'x-user-id': 'mfa-test-user', 'x-user-email': 'mfa@test.com' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.secret).toBeDefined();
      expect(res.json().data.otpauthUrl).toContain('otpauth://');
    });

    it('POST /api/v1/users/mfa/verify — rejects invalid code', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/mfa/verify',
        headers: { ...headers, 'x-user-id': 'mfa-test-user' },
        payload: { code: '000000' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── Break-glass routes ─────────────────────────────────────
  describe('Break-glass routes', () => {
    it('POST /api/v1/users/break-glass/setup — creates account', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/break-glass/setup', headers,
        payload: { reason: 'Initial break-glass setup for emergency access' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.codes).toHaveLength(5);
    });

    it('POST /api/v1/users/break-glass/login — authenticates with code', async () => {
      // Setup a fresh tenant for this test
      const freshHeaders = { ...headers, 'x-tenant-id': 'bg-test-tenant' };
      const setup = await app.inject({
        method: 'POST', url: '/api/v1/users/break-glass/setup', headers: freshHeaders,
        payload: { reason: 'Setup for login test' },
      });
      const code = setup.json().data.codes[0];
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/break-glass/login', headers: freshHeaders,
        payload: { code, reason: 'Emergency IdP failure testing' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.sessionId).toBeDefined();
    });

    it('GET /api/v1/users/break-glass/log — returns usage log', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/break-glass/log', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.account).toBeDefined();
    });
  });

  // ─── Session routes ─────────────────────────────────────────
  describe('Session routes', () => {
    it('GET /api/v1/users/sessions — returns empty list', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/sessions', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('GET /api/v1/users/sessions/count — returns 0', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/sessions/count', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.active).toBe(0);
    });

    it('DELETE /api/v1/users/sessions — revokes all (returns 0)', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/sessions', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.revoked).toBe(0);
    });
  });
});
