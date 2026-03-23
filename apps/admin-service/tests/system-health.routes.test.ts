import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { HealthStore } from '../src/services/health-store.js';

const config = loadConfig({ TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!' });

describe('System Health Routes', () => {
  let app: FastifyInstance;
  let healthStore: HealthStore;

  beforeEach(async () => {
    healthStore = new HealthStore();
    app = await buildApp({ config, systemHealthDeps: { healthStore } });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/system/health', () => {
    it('returns 200 with overall health status', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(['healthy', 'degraded', 'critical']).toContain(body.data.overall);
      expect(Array.isArray(body.data.services)).toBe(true);
    });

    it('includes metrics in the response', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system/health' });
      const body = JSON.parse(res.body);
      expect(body.data.metrics).toBeDefined();
      expect(typeof body.data.metrics.cpuPercent).toBe('number');
    });

    it('includes queues in the response', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system/health' });
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data.queues)).toBe(true);
    });
  });

  describe('GET /api/v1/admin/system/services', () => {
    it('returns 200 with array of services', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system/services' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/admin/system/metrics', () => {
    it('returns 200 with metrics snapshot', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system/metrics' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.data.cpuPercent).toBe('number');
      expect(typeof body.data.memoryPercent).toBe('number');
      expect(typeof body.data.diskPercent).toBe('number');
    });
  });

  describe('GET /api/v1/admin/system/dependency-map', () => {
    it('returns 200 with dependency map', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system/dependency-map' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data.nodes)).toBe(true);
      expect(Array.isArray(body.data.edges)).toBe(true);
    });
  });
});
