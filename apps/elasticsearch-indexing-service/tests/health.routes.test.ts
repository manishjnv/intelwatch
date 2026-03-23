import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// Minimal mocks so buildApp doesn't connect to real ES/Redis
vi.mock('../src/es-client.js', () => ({
  EsIndexClient: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue(true),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    indexDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ total: 0, hits: [], aggregations: {} }),
    bulkIndex: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    countDocs: vi.fn().mockResolvedValue(0),
  })),
  getIndexName: vi.fn((t: string) => `etip_${t}_iocs`),
}));

vi.mock('../src/worker.js', () => ({
  IocIndexWorker: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    getQueueDepth: vi.fn().mockResolvedValue(0),
  })),
}));

const config = loadConfig({
  TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'dev-service-secret!!',
});

describe('Health Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('elasticsearch-indexing-service');
    });

    it('includes esConnected in response', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(typeof body.esConnected).toBe('boolean');
    });

    it('includes queueDepth in response', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(typeof body.queueDepth).toBe('number');
    });

    it('includes timestamp in response', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /ready', () => {
    it('returns 200 with ready true', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ready).toBe(true);
    });

    it('includes service name', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      const body = JSON.parse(res.body);
      expect(body.service).toBe('elasticsearch-indexing-service');
    });
  });
});
