import { describe, it, expect } from 'vitest';
import { HealthChecker } from '../src/services/health-checker.js';

describe('HealthChecker', () => {
  const checker = new HealthChecker();

  describe('checkPipeline', () => {
    it('returns overall status', async () => {
      const result = await checker.checkPipeline();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.overall);
      expect(result.lastCheckedAt).toBeDefined();
    });

    it('returns all 6 pipeline stages', async () => {
      const result = await checker.checkPipeline();
      expect(result.stages).toHaveLength(6);
    });

    it('core stages (ingestion, normalization, enrichment) are healthy', async () => {
      const result = await checker.checkPipeline();
      const coreStages = result.stages.filter((s) =>
        ['Feed Ingestion', 'IOC Normalization', 'AI Enrichment'].includes(s.name),
      );
      expect(coreStages).toHaveLength(3);
      for (const stage of coreStages) {
        expect(stage.status).toBe('healthy');
        expect(stage.latencyMs).toBeGreaterThan(0);
      }
    });

    it('each stage has name, status, latency, message', async () => {
      const result = await checker.checkPipeline();
      for (const stage of result.stages) {
        expect(stage.name).toBeDefined();
        expect(['healthy', 'unhealthy', 'unknown']).toContain(stage.status);
        expect(stage.message).toBeDefined();
      }
    });
  });

  describe('checkStage', () => {
    it('returns healthy for deployed stage', async () => {
      const stage = await checker.checkStage('ingestion', 3004, 'Feed Ingestion');
      expect(stage.status).toBe('healthy');
      expect(stage.name).toBe('Feed Ingestion');
    });

    it('returns unknown for non-deployed stage', async () => {
      const stage = await checker.checkStage('correlation', 3013, 'Correlation Engine');
      expect(stage.status).toBe('unknown');
    });
  });

  describe('isCoreHealthy', () => {
    it('returns true when core pipeline stages healthy', async () => {
      const healthy = await checker.isCoreHealthy();
      expect(healthy).toBe(true);
    });
  });

  describe('getStages', () => {
    it('returns 6 pipeline stages with ports', () => {
      const stages = checker.getStages();
      expect(stages).toHaveLength(6);
      expect(stages[0].port).toBe(3004);
      expect(stages[1].port).toBe(3005);
      expect(stages[2].port).toBe(3006);
    });
  });
});
