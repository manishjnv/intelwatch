/**
 * Step 3 S159 — cross-tenant isolation regression test. Every by-id route must
 * 404 (not leak another tenant's data) when tenant B requests tenant A's hunt,
 * including the three playbook routes which previously had no tenant check at
 * all (playbook executions were keyed by huntId alone, global across tenants).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@etip/shared-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@etip/shared-auth')>();
  return {
    ...actual,
    verifyAccessToken: (token: string) => {
      if (token === 'tenant-a-token') return { userId: 'user-a', tenantId: 'tenant-a', role: 'tenant_admin', permissions: [] };
      if (token === 'tenant-b-token') return { userId: 'user-b', tenantId: 'tenant-b', role: 'tenant_admin', permissions: [] };
      throw new Error('Invalid token');
    },
    hasPermission: () => true,
    loadJwtConfig: () => {},
    loadServiceJwtSecret: () => {},
  };
});

import { buildApp } from '../src/app.js';
import { HuntingStore } from '../src/schemas/store.js';
import { HuntSessionManager } from '../src/services/hunt-session-manager.js';
import { HuntQueryBuilder } from '../src/services/hunt-query-builder.js';
import { IOCPivotChains } from '../src/services/ioc-pivot-chains.js';
import { SavedHuntLibrary } from '../src/services/saved-hunt-library.js';
import { CorrelationIntegration } from '../src/services/correlation-integration.js';
import { HypothesisEngine } from '../src/services/hypothesis-engine.js';
import { AISuggestions } from '../src/services/ai-suggestions.js';
import { TimelineService } from '../src/services/timeline-service.js';
import { EvidenceCollection } from '../src/services/evidence-collection.js';
import { Collaboration } from '../src/services/collaboration.js';
import { AIPatternRecognition } from '../src/services/ai-pattern-recognition.js';
import { HuntPlaybooks } from '../src/services/hunt-playbooks.js';
import { HuntScoring } from '../src/services/hunt-scoring.js';
import { BulkImport } from '../src/services/bulk-import.js';
import { HuntExport } from '../src/services/hunt-export.js';
import type { HuntingConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

const TEST_CONFIG: HuntingConfig = {
  TI_NODE_ENV: 'test',
  TI_HUNTING_PORT: 0,
  TI_HUNTING_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long',
  TI_SERVICE_JWT_SECRET: 'test-service-jwt-secret',
  TI_CORS_ORIGINS: 'http://localhost:3002',
  TI_RATE_LIMIT_MAX: 1000,
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_LOG_LEVEL: 'error',
  TI_HUNT_DEFAULT_TIME_RANGE_DAYS: 30,
  TI_HUNT_MAX_RESULTS: 1000,
  TI_HUNT_SESSION_TIMEOUT_HOURS: 72,
  TI_HUNT_MAX_ACTIVE_SESSIONS: 20,
  TI_GRAPH_SERVICE_URL: 'http://localhost:3012',
  TI_HUNT_MAX_PIVOT_HOPS: 3,
  TI_HUNT_MAX_PIVOT_RESULTS: 100,
  TI_CORRELATION_SERVICE_URL: 'http://localhost:3013',
  TI_HUNT_CORRELATION_ENABLED: true,
};

describe('Cross-tenant isolation — by-id routes', () => {
  let app: FastifyInstance;
  let huntId: string;

  beforeAll(async () => {
    const store = new HuntingStore();
    const sessionManager = new HuntSessionManager(store, {
      sessionTimeoutHours: TEST_CONFIG.TI_HUNT_SESSION_TIMEOUT_HOURS,
      maxActiveSessions: TEST_CONFIG.TI_HUNT_MAX_ACTIVE_SESSIONS,
    });
    const huntLibrary = new SavedHuntLibrary(store);
    const correlationIntegration = new CorrelationIntegration(store, {
      correlationServiceUrl: TEST_CONFIG.TI_CORRELATION_SERVICE_URL, enabled: false,
    });
    const hypothesisEngine = new HypothesisEngine(store);
    const aiSuggestions = new AISuggestions(store, {
      enabled: false, model: 'claude-haiku-4-5-20251001', maxTokens: 1024, budgetCentsPerDay: 50,
    });
    const timelineService = new TimelineService(store);
    const evidenceCollection = new EvidenceCollection(store);
    const collaboration = new Collaboration(store);
    const patternRecognition = new AIPatternRecognition(store, {
      enabled: false, model: 'claude-sonnet-4-20250514', maxTokens: 2048, budgetCentsPerDay: 100,
    });
    const playbooks = new HuntPlaybooks();
    const huntScoring = new HuntScoring(store);
    const bulkImport = new BulkImport(sessionManager);
    const huntExport = new HuntExport(store);

    const hunt = await sessionManager.create('tenant-a', 'user-a', {
      title: 'Tenant A Hunt', hypothesis: 'Testing cross-tenant isolation',
    });
    huntId = hunt.id;
    await collaboration.addComment('tenant-a', huntId, 'user-a', 'A comment');
    await evidenceCollection.add('tenant-a', huntId, 'user-a', { type: 'note', title: 'T', description: 'D' });
    await hypothesisEngine.create('tenant-a', huntId, 'user-a', { statement: 'S', rationale: 'R' });

    app = await buildApp({
      config: TEST_CONFIG,
      routeDeps: {
        sessionManager,
        queryBuilder: new HuntQueryBuilder({
          defaultTimeRangeDays: TEST_CONFIG.TI_HUNT_DEFAULT_TIME_RANGE_DAYS,
          maxResults: TEST_CONFIG.TI_HUNT_MAX_RESULTS,
        }),
        pivotChains: new IOCPivotChains({
          graphServiceUrl: TEST_CONFIG.TI_GRAPH_SERVICE_URL,
          maxHops: TEST_CONFIG.TI_HUNT_MAX_PIVOT_HOPS,
          maxResults: TEST_CONFIG.TI_HUNT_MAX_PIVOT_RESULTS,
        }),
        huntLibrary,
        correlationIntegration,
      },
      advancedDeps: {
        hypothesisEngine, aiSuggestions, timelineService, evidenceCollection, collaboration,
      },
      p2Deps: {
        patternRecognition, playbooks, huntScoring, bulkImport, huntExport, sessionManager,
      },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  const asA = { authorization: 'Bearer tenant-a-token' };
  const asB = { authorization: 'Bearer tenant-b-token' };

  it('GET /hunts/:huntId — tenant B gets 404 for tenant A hunt', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/hunts/${huntId}`, headers: asB });
    expect(res.statusCode).toBe(404);
    const own = await app.inject({ method: 'GET', url: `/api/v1/hunts/${huntId}`, headers: asA });
    expect(own.statusCode).toBe(200);
  });

  it('GET /hunts/:huntId/comments — tenant B gets 404 for tenant A hunt', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/hunts/${huntId}/comments`, headers: asB });
    expect(res.statusCode).toBe(404);
  });

  it('GET /hunts/:huntId/evidence — tenant B gets 404 for tenant A hunt', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/hunts/${huntId}/evidence`, headers: asB });
    expect(res.statusCode).toBe(404);
  });

  it('GET /hunts/:huntId/hypotheses — tenant B gets 404 for tenant A hunt', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/hunts/${huntId}/hypotheses`, headers: asB });
    expect(res.statusCode).toBe(404);
  });

  // ─── Playbook routes — previously had NO tenant check at all ─────

  it('POST /hunts/:huntId/playbook/:playbookId/start — tenant B gets 404 for tenant A hunt', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/hunts/${huntId}/playbook/playbook-phishing/start`, headers: asB,
    });
    expect(res.statusCode).toBe(404);

    const own = await app.inject({
      method: 'POST', url: `/api/v1/hunts/${huntId}/playbook/playbook-phishing/start`, headers: asA,
    });
    expect(own.statusCode).toBe(201);
  });

  it('POST /hunts/:huntId/playbook/step — tenant B gets 404 for tenant A hunt', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/hunts/${huntId}/playbook/step`, headers: asB,
      payload: { stepId: 'nonexistent' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /hunts/:huntId/playbook/progress — tenant B gets 404 for tenant A hunt', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/hunts/${huntId}/playbook/progress`, headers: asB,
    });
    expect(res.statusCode).toBe(404);

    const own = await app.inject({
      method: 'GET', url: `/api/v1/hunts/${huntId}/playbook/progress`, headers: asA,
    });
    expect(own.statusCode).toBe(200);
  });
});
