/**
 * @module integration-service/tests/routes-p2-rbac
 * @description RBAC regression test for p2-routes.ts (security fix: preHandler only
 * verified the JWT, no role check — any analyst could read integration audit logs,
 * rotate credentials, and edit alert-routing rules).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@etip/shared-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@etip/shared-auth')>();
  return {
    ...actual,
    verifyAccessToken: (token: string) => {
      if (token === 'valid-token') return { userId: 'user-1', tenantId: 'tenant-1', role: 'tenant_admin' };
      if (token === 'analyst-token') return { userId: 'user-3', tenantId: 'tenant-1', role: 'analyst' };
      throw new Error('Invalid token');
    },
    loadJwtConfig: () => {},
    loadServiceJwtSecret: () => {},
  };
});

import { buildApp } from '../src/app.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { HealthScoring } from '../src/services/health-scoring.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { RateLimitTracker } from '../src/services/rate-limit-tracker.js';
import { CredentialRotationService } from '../src/services/credential-rotation.js';
import { AlertRoutingEngine } from '../src/services/alert-routing-engine.js';
import { IntegrationRateLimiter } from '../src/services/rate-limiter.js';
import type { IntegrationConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

const TEST_CONFIG: IntegrationConfig = {
  TI_NODE_ENV: 'test',
  TI_INTEGRATION_PORT: 0,
  TI_INTEGRATION_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long',
  TI_SERVICE_JWT_SECRET: 'test-service-jwt-secret',
  TI_CORS_ORIGINS: 'http://localhost:3002',
  TI_RATE_LIMIT_MAX: 1000,
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_LOG_LEVEL: 'error',
  TI_INTEGRATION_SIEM_RETRY_MAX: 2,
  TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 10,
  TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: 5000,
  TI_INTEGRATION_WEBHOOK_MAX_PER_TENANT: 10,
  TI_INTEGRATION_TAXII_PAGE_SIZE: 100,
  TI_IOC_SERVICE_URL: 'http://localhost:3007',
  TI_GRAPH_SERVICE_URL: 'http://localhost:3012',
  TI_CORRELATION_SERVICE_URL: 'http://localhost:3013',
  TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: false,
};

describe('P2 routes — RBAC', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const store = new IntegrationStore();
    const rateLimiter = new IntegrationRateLimiter();
    app = await buildApp({
      config: TEST_CONFIG,
      p2Deps: {
        store,
        healthScoring: new HealthScoring(store, rateLimiter),
        auditTrail: new AuditTrail(),
        rateLimitTracker: new RateLimitTracker(rateLimiter),
        credentialRotation: new CredentialRotationService(store, null),
        alertRoutingEngine: new AlertRoutingEngine(),
      },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('GET /audit-log — analyst 403 (no integration:read), tenant_admin 200', async () => {
    const analystRes = await app.inject({
      method: 'GET', url: '/api/v1/integrations/audit-log',
      headers: { authorization: 'Bearer analyst-token' },
    });
    expect(analystRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: 'GET', url: '/api/v1/integrations/audit-log',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(adminRes.statusCode).toBe(200);
  });
});
