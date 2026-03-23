import { describe, it, expect, beforeEach } from 'vitest';
import { HealthStore } from '../src/services/health-store.js';

describe('HealthStore', () => {
  let store: HealthStore;

  beforeEach(() => {
    store = new HealthStore();
  });

  describe('getSystemHealth', () => {
    it('returns overall healthy when all services report healthy', () => {
      const health = store.getSystemHealth();
      expect(health.overall).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });

    it('returns services array with all known services', () => {
      const health = store.getSystemHealth();
      expect(Array.isArray(health.services)).toBe(true);
      expect(health.services.length).toBeGreaterThan(0);
    });

    it('each service entry has name, status, port, lastCheck', () => {
      const health = store.getSystemHealth();
      for (const svc of health.services) {
        expect(svc.name).toBeTruthy();
        expect(['healthy', 'degraded', 'critical', 'unknown']).toContain(svc.status);
        expect(typeof svc.port).toBe('number');
        expect(svc.lastCheck).toBeTruthy();
      }
    });

    it('returns metrics snapshot with cpu, memory, disk fields', () => {
      const health = store.getSystemHealth();
      expect(health.metrics).toBeDefined();
      expect(typeof health.metrics.cpuPercent).toBe('number');
      expect(typeof health.metrics.memoryPercent).toBe('number');
      expect(typeof health.metrics.diskPercent).toBe('number');
    });

    it('returns queues array with depth info', () => {
      const health = store.getSystemHealth();
      expect(Array.isArray(health.queues)).toBe(true);
    });
  });

  describe('updateServiceStatus', () => {
    it('updates an existing service status', () => {
      store.updateServiceStatus('api-gateway', 'degraded', 'High latency detected');
      const health = store.getSystemHealth();
      const svc = health.services.find((s) => s.name === 'api-gateway');
      expect(svc?.status).toBe('degraded');
      expect(svc?.message).toBe('High latency detected');
    });

    it('creates a new service entry if unknown service name', () => {
      store.updateServiceStatus('new-service', 'healthy');
      const health = store.getSystemHealth();
      const svc = health.services.find((s) => s.name === 'new-service');
      expect(svc).toBeDefined();
      expect(svc?.status).toBe('healthy');
    });

    it('overall becomes degraded when any service is degraded', () => {
      store.updateServiceStatus('api-gateway', 'degraded');
      const health = store.getSystemHealth();
      expect(health.overall).toBe('degraded');
    });

    it('overall becomes critical when any service is critical', () => {
      store.updateServiceStatus('api-gateway', 'critical');
      const health = store.getSystemHealth();
      expect(health.overall).toBe('critical');
    });
  });

  describe('getServiceList', () => {
    it('returns array of all known services', () => {
      const services = store.getServiceList();
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(5);
    });

    it('includes api-gateway in the service list', () => {
      const services = store.getServiceList();
      expect(services.some((s) => s.name === 'api-gateway')).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('returns system metrics object', () => {
      const metrics = store.getMetrics();
      expect(metrics.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(metrics.cpuPercent).toBeLessThanOrEqual(100);
      expect(metrics.memoryPercent).toBeGreaterThanOrEqual(0);
      expect(metrics.diskPercent).toBeGreaterThanOrEqual(0);
    });

    it('returns uptime in seconds as positive number', () => {
      const metrics = store.getMetrics();
      expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});
