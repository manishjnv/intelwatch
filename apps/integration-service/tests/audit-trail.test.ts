import { describe, it, expect, beforeEach } from 'vitest';
import { AuditTrail } from '../src/services/audit-trail.js';

const TENANT = 'tenant-audit';

describe('AuditTrail', () => {
  let trail: AuditTrail;

  beforeEach(() => {
    trail = new AuditTrail();
  });

  it('records an audit entry', async () => {
    const entry = await trail.record({
      tenantId: TENANT,
      integrationId: 'int-1',
      action: 'integration.created',
      actor: 'user-1',
      details: { name: 'New SIEM' },
    });
    expect(entry.id).toBeDefined();
    expect(entry.action).toBe('integration.created');
    expect(entry.actor).toBe('user-1');
    expect(entry.tenantId).toBe(TENANT);
  });

  it('records with previous and new values', async () => {
    const entry = await trail.record({
      tenantId: TENANT,
      integrationId: 'int-1',
      action: 'config.changed',
      actor: 'user-1',
      previousValue: { enabled: true },
      newValue: { enabled: false },
    });
    expect(entry.previousValue).toEqual({ enabled: true });
    expect(entry.newValue).toEqual({ enabled: false });
  });

  it('queries entries by tenant', async () => {
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });
    await trail.record({ tenantId: TENANT, integrationId: 'int-2', action: 'integration.deleted', actor: 'u1' });
    await trail.record({ tenantId: 'other', integrationId: 'int-3', action: 'integration.created', actor: 'u2' });

    const result = await trail.query(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
  });

  it('filters by integrationId', async () => {
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });
    await trail.record({ tenantId: TENANT, integrationId: 'int-2', action: 'integration.created', actor: 'u1' });

    const result = await trail.query(TENANT, { integrationId: 'int-1', page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0]!.integrationId).toBe('int-1');
  });

  it('filters by action type', async () => {
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'credentials.rotated', actor: 'u1' });
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.deleted', actor: 'u1' });

    const result = await trail.query(TENANT, { action: 'credentials.rotated', page: 1, limit: 50 });
    expect(result.total).toBe(1);
  });

  it('filters by date range', async () => {
    const e1 = await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });

    const result = await trail.query(TENANT, {
      dateFrom: new Date(Date.now() - 60000).toISOString(),
      dateTo: new Date(Date.now() + 60000).toISOString(),
      page: 1,
      limit: 50,
    });
    expect(result.total).toBe(1);
  });

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await trail.record({ tenantId: TENANT, integrationId: `int-${i}`, action: 'integration.created', actor: 'u1' });
    }
    const page1 = await trail.query(TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });

  it('sorts results newest first', async () => {
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });
    await trail.record({ tenantId: TENANT, integrationId: 'int-2', action: 'integration.deleted', actor: 'u1' });

    const result = await trail.query(TENANT, { page: 1, limit: 50 });
    expect(result.data[0]!.createdAt >= result.data[1]!.createdAt).toBe(true);
  });

  it('gets entry by ID', async () => {
    const entry = await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });
    expect(await trail.getEntry(entry.id, TENANT)).toEqual(entry);
  });

  it('returns undefined for wrong tenant on getEntry', async () => {
    const entry = await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });
    expect(await trail.getEntry(entry.id, 'other')).toBeUndefined();
  });

  it('gets recent entries for an integration', async () => {
    for (let i = 0; i < 15; i++) {
      await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.updated', actor: 'u1' });
    }
    const recent = await trail.getRecentForIntegration('int-1', TENANT, 5);
    expect(recent).toHaveLength(5);
  });

  it('counts entries by action type', async () => {
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'integration.created', actor: 'u1' });
    await trail.record({ tenantId: TENANT, integrationId: 'int-2', action: 'integration.created', actor: 'u1' });
    await trail.record({ tenantId: TENANT, integrationId: 'int-1', action: 'credentials.rotated', actor: 'u1' });

    const counts = await trail.countByAction(TENANT);
    expect(counts['integration.created']).toBe(2);
    expect(counts['credentials.rotated']).toBe(1);
  });

  it('records null integrationId for non-integration events', async () => {
    const entry = await trail.record({ tenantId: TENANT, integrationId: null, action: 'rule.created', actor: 'u1' });
    expect(entry.integrationId).toBeNull();
  });
});
