import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationStore } from '../src/services/integration-store.js';
import { FieldMapper } from '../src/services/field-mapper.js';

const TENANT = 'tenant-1';

describe('P0 #2: Field Mapping Defaults', () => {
  let store: IntegrationStore;
  let mapper: FieldMapper;

  beforeEach(() => {
    store = new IntegrationStore();
    mapper = new FieldMapper();
    store.setFieldMapper(mapper);
  });

  it('auto-populates default mappings for splunk_hec', () => {
    const int = store.createIntegration(TENANT, {
      name: 'Splunk', type: 'splunk_hec', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });
    expect(int.fieldMappings.length).toBeGreaterThan(0);
    expect(int.fieldMappings.some(m => m.targetField.includes('event.'))).toBe(true);
  });

  it('auto-populates default mappings for sentinel', () => {
    const int = store.createIntegration(TENANT, {
      name: 'Sentinel', type: 'sentinel', triggers: ['ioc.created'],
      fieldMappings: [], credentials: {},
    });
    expect(int.fieldMappings.some(m => m.targetField === 'IndicatorType')).toBe(true);
  });

  it('auto-populates default mappings for elastic_siem', () => {
    const int = store.createIntegration(TENANT, {
      name: 'Elastic', type: 'elastic_siem', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });
    expect(int.fieldMappings.some(m => m.targetField.includes('threat.indicator'))).toBe(true);
  });

  it('auto-populates default mappings for servicenow', () => {
    const int = store.createIntegration(TENANT, {
      name: 'SNOW', type: 'servicenow', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });
    expect(int.fieldMappings.some(m => m.targetField === 'short_description')).toBe(true);
  });

  it('auto-populates default mappings for jira', () => {
    const int = store.createIntegration(TENANT, {
      name: 'Jira', type: 'jira', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });
    expect(int.fieldMappings.some(m => m.targetField === 'summary')).toBe(true);
  });

  it('preserves user-provided mappings (does not override)', () => {
    const custom = [{ sourceField: 'custom_src', targetField: 'custom_tgt', transform: 'none' as const }];
    const int = store.createIntegration(TENANT, {
      name: 'Custom', type: 'splunk_hec', triggers: ['alert.created'],
      fieldMappings: custom, credentials: {},
    });
    expect(int.fieldMappings).toEqual(custom);
  });

  it('returns empty mappings for webhook (no defaults)', () => {
    const int = store.createIntegration(TENANT, {
      name: 'Hook', type: 'webhook', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });
    // Webhooks have no default field mappings
    expect(int.fieldMappings).toEqual([]);
  });

  it('works without field mapper set (backward compatible)', () => {
    const plainStore = new IntegrationStore();
    // No setFieldMapper call
    const int = plainStore.createIntegration(TENANT, {
      name: 'Plain', type: 'splunk_hec', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });
    expect(int.fieldMappings).toEqual([]);
  });
});
