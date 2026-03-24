import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

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
    });

    it('includes service name', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(body.service).toBe('reporting-service');
    });

    it('includes queue name', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(body.queue).toBe('etip-report-generate');
    });

    it('includes timestamp', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(body.timestamp).toBeTruthy();
      expect(() => new Date(body.timestamp)).not.toThrow();
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
      expect(body.service).toBe('reporting-service');
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/nonexistent' });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
