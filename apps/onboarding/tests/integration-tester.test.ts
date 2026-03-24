import { describe, it, expect, beforeEach } from 'vitest';
import { WizardStore } from '../src/services/wizard-store.js';
import { ConnectorValidator } from '../src/services/connector-validator.js';
import { IntegrationTester } from '../src/services/integration-tester.js';

describe('IntegrationTester', () => {
  let wizardStore: WizardStore;
  let connector: ConnectorValidator;
  let tester: IntegrationTester;

  beforeEach(async () => {
    wizardStore = new WizardStore();
    connector = new ConnectorValidator(wizardStore);
    tester = new IntegrationTester(wizardStore);
    await wizardStore.getOrCreate('t1');
  });

  describe('testSource', () => {
    it('runs multi-step test for RSS feed', async () => {
      const source = await connector.addSource('t1', {
        name: 'CISA',
        type: 'rss_feed',
        url: 'https://www.cisa.gov/feeds/current-activity.xml',
      });
      const result = await tester.testSource('t1', source.id);
      expect(result.success).toBe(true);
      expect(result.sourceId).toBe(source.id);
      expect(result.sourceName).toBe('CISA');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.testedAt).toBeDefined();
    });

    it('includes DNS, TCP, and data pull steps', async () => {
      const source = await connector.addSource('t1', {
        name: 'Feed',
        type: 'rss_feed',
        url: 'https://feed.test/rss',
      });
      const result = await tester.testSource('t1', source.id);
      const stepNames = result.steps.map((s) => s.name);
      expect(stepNames).toContain('dns_resolve');
      expect(stepNames).toContain('tcp_connect');
      expect(stepNames).toContain('data_pull');
    });

    it('includes authentication step for SIEM sources', async () => {
      const source = await connector.addSource('t1', {
        name: 'Splunk',
        type: 'siem_splunk',
        url: 'https://splunk.test:8089',
        apiKey: 'token-123',
      });
      const result = await tester.testSource('t1', source.id);
      const stepNames = result.steps.map((s) => s.name);
      expect(stepNames).toContain('authentication');
    });

    it('each step has name, passed, durationMs, message', async () => {
      const source = await connector.addSource('t1', {
        name: 'Feed',
        type: 'rss_feed',
        url: 'https://feed.test/rss',
      });
      const result = await tester.testSource('t1', source.id);
      for (const step of result.steps) {
        expect(step.name).toBeDefined();
        expect(typeof step.passed).toBe('boolean');
        expect(typeof step.durationMs).toBe('number');
        expect(step.message).toBeDefined();
      }
    });

    it('calculates total latency', async () => {
      const source = await connector.addSource('t1', {
        name: 'Feed',
        type: 'rss_feed',
        url: 'https://feed.test/rss',
      });
      const result = await tester.testSource('t1', source.id);
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('marks source as connected on success', async () => {
      const source = await connector.addSource('t1', {
        name: 'Feed',
        type: 'rss_feed',
        url: 'https://feed.test/rss',
      });
      await tester.testSource('t1', source.id);
      const wizard = await wizardStore.get('t1');
      const updated = wizard.dataSources.find((s) => s.id === source.id);
      expect(updated?.status).toBe('connected');
    });

    it('throws for nonexistent source', async () => {
      await expect(tester.testSource('t1', 'nonexistent')).rejects.toThrow('Data source');
    });
  });

  describe('getLastResult', () => {
    it('returns null for untested source', () => {
      expect(tester.getLastResult('t1', 'src-1')).toBeNull();
    });

    it('returns last result after test', async () => {
      const source = await connector.addSource('t1', {
        name: 'Feed',
        type: 'rss_feed',
        url: 'https://feed.test/rss',
      });
      await tester.testSource('t1', source.id);
      const result = tester.getLastResult('t1', source.id);
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });
  });

  describe('testAll', () => {
    it('tests all data sources', async () => {
      await connector.addSource('t1', { name: 'A', type: 'rss_feed', url: 'https://a.test/rss' });
      await connector.addSource('t1', { name: 'B', type: 'webhook', url: 'https://b.test/hook' });
      const results = await tester.testAll('t1');
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('returns empty array when no sources', async () => {
      const results = await tester.testAll('t1');
      expect(results).toEqual([]);
    });
  });
});
