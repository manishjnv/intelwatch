import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from '../src/routes/health.js';

// Mock the Neo4j driver verification
vi.mock('../src/driver.js', () => ({
  verifyNeo4jConnection: vi.fn().mockResolvedValue(true),
}));

describe('Threat Graph — Health Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health — returns ok with service name', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('threat-graph');
    expect(body.version).toBe('1.0.0');
    expect(body.uptime).toBeGreaterThan(0);
    expect(body.timestamp).toBeDefined();
  });

  it('GET /ready — returns ok with neo4j check', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.checks.server).toBe('ok');
    expect(body.checks.neo4j).toBe('ok');
  });

  it('GET /ready — returns degraded when Neo4j is down', async () => {
    const { verifyNeo4jConnection } = await import('../src/driver.js');
    (verifyNeo4jConnection as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.neo4j).toBe('unavailable');
  });
});
