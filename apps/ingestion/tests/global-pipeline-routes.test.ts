import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { globalPipelineRoutes } from '../src/routes/global-pipeline.js';
import { GLOBAL_QUEUE_NAMES } from '../src/services/global-pipeline-orchestrator.js';

// Mock auth
vi.mock('../src/plugins/auth.js', () => ({
  authenticate: async () => {},
  getUser: () => ({ sub: 'user-1', tenantId: 'tenant-1', role: 'super_admin' }),
  rbac: () => async () => {},
}));

function mockOrchestrator() {
  return {
    getQueueHealth: vi.fn().mockResolvedValue({
      queues: GLOBAL_QUEUE_NAMES.map(name => ({
        name, waiting: 3, active: 1, completed: 500, failed: 2, delayed: 0,
      })),
      pipeline: { articlesProcessed24h: 100, iocsCreated24h: 50, iocsEnriched24h: 30, avgNormalizeLatencyMs: 200, avgEnrichLatencyMs: 1000 },
    }),
    retriggerFailed: vi.fn().mockResolvedValue(5),
    pauseGlobalPipeline: vi.fn().mockResolvedValue(undefined),
    resumeGlobalPipeline: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('Global Pipeline Routes', () => {
  const originalEnv = process.env['TI_GLOBAL_PROCESSING_ENABLED'];

  beforeAll(() => {
    process.env['TI_GLOBAL_PROCESSING_ENABLED'] = 'true';
  });

  afterAll(() => {
    if (originalEnv !== undefined) process.env['TI_GLOBAL_PROCESSING_ENABLED'] = originalEnv;
    else delete process.env['TI_GLOBAL_PROCESSING_ENABLED'];
  });

  it('GET /health returns queue health, 200', async () => {
    const orch = mockOrchestrator();
    const app = Fastify();
    await app.register(globalPipelineRoutes(orch), { prefix: '/api/v1/ingestion/global-pipeline' });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ingestion/global-pipeline/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.queues).toHaveLength(GLOBAL_QUEUE_NAMES.length);
    expect(body.data.pipeline.articlesProcessed24h).toBe(100);
    expect(orch.getQueueHealth).toHaveBeenCalled();
    await app.close();
  });

  it('GET /health: feature flag off → 503', async () => {
    process.env['TI_GLOBAL_PROCESSING_ENABLED'] = 'false';
    const orch = mockOrchestrator();
    const app = Fastify();
    await app.register(globalPipelineRoutes(orch), { prefix: '/api/v1/ingestion/global-pipeline' });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ingestion/global-pipeline/health' });
    expect(res.statusCode).toBe(503);
    process.env['TI_GLOBAL_PROCESSING_ENABLED'] = 'true';
    await app.close();
  });

  it('POST /retrigger/:queue: valid → 200', async () => {
    const orch = mockOrchestrator();
    const app = Fastify();
    await app.register(globalPipelineRoutes(orch), { prefix: '/api/v1/ingestion/global-pipeline' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/global-pipeline/retrigger/${GLOBAL_QUEUE_NAMES[0]}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.retriggered).toBe(5);
    expect(orch.retriggerFailed).toHaveBeenCalledWith(GLOBAL_QUEUE_NAMES[0]);
    await app.close();
  });

  it('POST /retrigger/:queue: invalid queue → 400', async () => {
    const orch = mockOrchestrator();
    const app = Fastify();
    await app.register(globalPipelineRoutes(orch), { prefix: '/api/v1/ingestion/global-pipeline' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/global-pipeline/retrigger/fake-queue',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /pause → 200', async () => {
    const orch = mockOrchestrator();
    const app = Fastify();
    await app.register(globalPipelineRoutes(orch), { prefix: '/api/v1/ingestion/global-pipeline' });

    const res = await app.inject({ method: 'POST', url: '/api/v1/ingestion/global-pipeline/pause' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('paused');
    expect(orch.pauseGlobalPipeline).toHaveBeenCalled();
    await app.close();
  });

  it('POST /resume → 200', async () => {
    const orch = mockOrchestrator();
    const app = Fastify();
    await app.register(globalPipelineRoutes(orch), { prefix: '/api/v1/ingestion/global-pipeline' });

    const res = await app.inject({ method: 'POST', url: '/api/v1/ingestion/global-pipeline/resume' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('resumed');
    expect(orch.resumeGlobalPipeline).toHaveBeenCalled();
    await app.close();
  });

  it('Route verifies orchestrator methods called with correct args', async () => {
    const orch = mockOrchestrator();
    const app = Fastify();
    await app.register(globalPipelineRoutes(orch), { prefix: '/api/v1/ingestion/global-pipeline' });

    await app.inject({ method: 'GET', url: '/api/v1/ingestion/global-pipeline/health' });
    expect(orch.getQueueHealth).toHaveBeenCalledTimes(1);

    await app.inject({ method: 'POST', url: '/api/v1/ingestion/global-pipeline/pause' });
    expect(orch.pauseGlobalPipeline).toHaveBeenCalledTimes(1);

    await app.inject({ method: 'POST', url: '/api/v1/ingestion/global-pipeline/resume' });
    expect(orch.resumeGlobalPipeline).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
