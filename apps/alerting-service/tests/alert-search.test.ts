import { describe, it, expect, beforeEach } from 'vitest';
import { AlertStore } from '../src/services/alert-store.js';

describe('AlertStore.search', () => {
  let store: AlertStore;

  beforeEach(async () => {
    store = new AlertStore(undefined, 100);
    await store.create({
      ruleId: 'r1', ruleName: 'High IOC Rate', tenantId: 'tenant-1', severity: 'critical',
      title: '[CRITICAL] High IOC Rate', description: 'IOC ingestion spike detected',
    });
    await store.create({
      ruleId: 'r2', ruleName: 'Feed Absence', tenantId: 'tenant-1', severity: 'high',
      title: '[HIGH] Feed Absence', description: 'No feed data received in 2 hours',
    });
    await store.create({
      ruleId: 'r3', ruleName: 'APT Pattern', tenantId: 'tenant-1', severity: 'critical',
      title: '[CRITICAL] APT Pattern', description: 'APT28 actor detected in IOC data',
    });
    await store.create({
      ruleId: 'r4', ruleName: 'Other Rule', tenantId: 'tenant-2', severity: 'low',
      title: '[LOW] Other', description: 'Something else',
    });
  });

  it('searches by title keyword', async () => {
    const result = await store.search('tenant-1', 'ingestion spike', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].title).toContain('IOC');
  });

  it('searches by description keyword', async () => {
    const result = await store.search('tenant-1', 'feed data', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].ruleName).toBe('Feed Absence');
  });

  it('searches by ruleName keyword', async () => {
    const result = await store.search('tenant-1', 'APT Pattern', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].ruleName).toBe('APT Pattern');
  });

  it('search is case-insensitive', async () => {
    const result = await store.search('tenant-1', 'apt', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('returns multiple matches', async () => {
    const result = await store.search('tenant-1', 'CRITICAL', { page: 1, limit: 20 });
    expect(result.total).toBe(2);
  });

  it('returns empty for no matches', async () => {
    const result = await store.search('tenant-1', 'nonexistent', { page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  it('respects tenant isolation', async () => {
    const result = await store.search('tenant-2', 'IOC', { page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  it('paginates search results', async () => {
    const result = await store.search('tenant-1', 'CRITICAL', { page: 1, limit: 1 });
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(2);
  });
});
