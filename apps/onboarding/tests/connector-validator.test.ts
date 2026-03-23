import { describe, it, expect, beforeEach } from 'vitest';
import { WizardStore } from '../src/services/wizard-store.js';
import { ConnectorValidator } from '../src/services/connector-validator.js';

describe('ConnectorValidator', () => {
  let wizardStore: WizardStore;
  let validator: ConnectorValidator;

  beforeEach(() => {
    wizardStore = new WizardStore();
    validator = new ConnectorValidator(wizardStore);
    wizardStore.getOrCreate('t1');
  });

  describe('validate', () => {
    it('passes for valid RSS feed', () => {
      const result = validator.validate({
        name: 'CISA Alerts',
        type: 'rss_feed',
        url: 'https://www.cisa.gov/feeds/current-activity.xml',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when URL missing for RSS feed', () => {
      const result = validator.validate({ name: 'Bad Feed', type: 'rss_feed' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('URL is required');
    });

    it('passes for CSV upload without URL', () => {
      const result = validator.validate({ name: 'CSV Import', type: 'csv_upload' });
      expect(result.valid).toBe(true);
    });

    it('fails when API key missing for STIX/TAXII', () => {
      const result = validator.validate({
        name: 'TAXII Server',
        type: 'stix_taxii',
        url: 'https://taxii.example.com/taxii2/',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('API key is required');
    });

    it('passes for STIX/TAXII with URL and API key', () => {
      const result = validator.validate({
        name: 'TAXII Server',
        type: 'stix_taxii',
        url: 'https://taxii.example.com/taxii2/',
        apiKey: 'test-api-key-123',
      });
      expect(result.valid).toBe(true);
    });

    it('fails when API key missing for Splunk SIEM', () => {
      const result = validator.validate({
        name: 'Splunk',
        type: 'siem_splunk',
        url: 'https://splunk.corp.com:8089',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('API key is required');
    });

    it('passes for Splunk with URL and API key', () => {
      const result = validator.validate({
        name: 'Splunk',
        type: 'siem_splunk',
        url: 'https://splunk.corp.com:8089',
        apiKey: 'splunk-token',
      });
      expect(result.valid).toBe(true);
    });

    it('passes for webhook with URL only', () => {
      const result = validator.validate({
        name: 'Webhook',
        type: 'webhook',
        url: 'https://hooks.example.com/etip',
      });
      expect(result.valid).toBe(true);
    });

    it('fails when URL missing for REST API', () => {
      const result = validator.validate({ name: 'OTX', type: 'rest_api' });
      expect(result.valid).toBe(false);
    });

    it('fails when API key missing for Sentinel', () => {
      const result = validator.validate({
        name: 'Sentinel',
        type: 'siem_sentinel',
        url: 'https://management.azure.com',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('API key');
    });

    it('fails when API key missing for Elastic', () => {
      const result = validator.validate({
        name: 'Elastic',
        type: 'siem_elastic',
        url: 'https://elastic.corp.com:9200',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('addSource', () => {
    it('creates a data source record', () => {
      const source = validator.addSource('t1', {
        name: 'CISA',
        type: 'rss_feed',
        url: 'https://www.cisa.gov/feeds/current-activity.xml',
      });
      expect(source.id).toBeDefined();
      expect(source.name).toBe('CISA');
      expect(source.type).toBe('rss_feed');
      expect(source.status).toBe('pending');
    });

    it('adds source to wizard state', () => {
      validator.addSource('t1', {
        name: 'Feed1',
        type: 'rss_feed',
        url: 'https://feed1.test/rss',
      });
      const wizard = wizardStore.get('t1');
      expect(wizard.dataSources).toHaveLength(1);
    });

    it('throws for invalid source', () => {
      expect(() =>
        validator.addSource('t1', { name: 'Bad', type: 'rest_api' })
      ).toThrow('URL is required');
    });
  });

  describe('testConnection', () => {
    it('marks RSS feed as connected', async () => {
      const source = validator.addSource('t1', {
        name: 'Feed',
        type: 'rss_feed',
        url: 'https://feed.test/rss',
      });
      const result = await validator.testConnection('t1', source.id);
      expect(result.status).toBe('connected');
    });

    it('marks CSV upload as connected', async () => {
      const source = validator.addSource('t1', {
        name: 'CSV',
        type: 'csv_upload',
      });
      const result = await validator.testConnection('t1', source.id);
      expect(result.status).toBe('connected');
    });

    it('marks webhook as connected', async () => {
      const source = validator.addSource('t1', {
        name: 'Webhook',
        type: 'webhook',
        url: 'https://hooks.test/in',
      });
      const result = await validator.testConnection('t1', source.id);
      expect(result.status).toBe('connected');
    });

    it('throws for nonexistent source', async () => {
      await expect(validator.testConnection('t1', 'nonexistent')).rejects.toThrow('Data source');
    });
  });

  describe('listSources', () => {
    it('returns empty array initially', () => {
      const sources = validator.listSources('t1');
      expect(sources).toEqual([]);
    });

    it('returns added sources', () => {
      validator.addSource('t1', { name: 'A', type: 'rss_feed', url: 'https://a.test/rss' });
      validator.addSource('t1', { name: 'B', type: 'webhook', url: 'https://b.test/hook' });
      const sources = validator.listSources('t1');
      expect(sources).toHaveLength(2);
    });
  });

  describe('getSupportedTypes', () => {
    it('returns 8 data source types', () => {
      const types = validator.getSupportedTypes();
      expect(types).toHaveLength(8);
      expect(types.map((t) => t.type)).toContain('rss_feed');
      expect(types.map((t) => t.type)).toContain('stix_taxii');
    });

    it('each type has label and requirement flags', () => {
      const types = validator.getSupportedTypes();
      for (const t of types) {
        expect(t.label).toBeDefined();
        expect(typeof t.requiresUrl).toBe('boolean');
        expect(typeof t.requiresApiKey).toBe('boolean');
      }
    });
  });
});
