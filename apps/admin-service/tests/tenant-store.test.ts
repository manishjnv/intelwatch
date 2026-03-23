import { describe, it, expect, beforeEach } from 'vitest';
import { TenantStore } from '../src/services/tenant-store.js';

describe('TenantStore', () => {
  let store: TenantStore;

  beforeEach(() => {
    store = new TenantStore();
  });

  describe('create', () => {
    it('creates a tenant with active status', () => {
      const tenant = store.create({ name: 'Acme Corp', plan: 'pro', ownerEmail: 'admin@acme.com' });
      expect(tenant.id).toBeTruthy();
      expect(tenant.name).toBe('Acme Corp');
      expect(tenant.status).toBe('active');
      expect(tenant.plan).toBe('pro');
    });

    it('defaults to free plan when not specified', () => {
      const tenant = store.create({ name: 'StartupCo', ownerEmail: 'ceo@startup.io' });
      expect(tenant.plan).toBe('free');
    });

    it('sets createdAt timestamp', () => {
      const tenant = store.create({ name: 'Beta Corp', ownerEmail: 'admin@beta.com' });
      expect(new Date(tenant.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('list', () => {
    it('returns all tenants', () => {
      store.create({ name: 'A', ownerEmail: 'a@a.com' });
      store.create({ name: 'B', ownerEmail: 'b@b.com' });
      expect(store.list().length).toBe(2);
    });

    it('filters by status', () => {
      const t = store.create({ name: 'X', ownerEmail: 'x@x.com' });
      store.create({ name: 'Y', ownerEmail: 'y@y.com' });
      store.suspend(t.id, 'Violation');
      const active = store.list({ status: 'active' });
      expect(active.every((ten) => ten.status === 'active')).toBe(true);
    });

    it('filters by plan', () => {
      store.create({ name: 'F', ownerEmail: 'f@f.com', plan: 'free' });
      store.create({ name: 'P', ownerEmail: 'p@p.com', plan: 'pro' });
      const pro = store.list({ plan: 'pro' });
      expect(pro.every((t) => t.plan === 'pro')).toBe(true);
    });
  });

  describe('getById', () => {
    it('returns the tenant by id', () => {
      const tenant = store.create({ name: 'Corp', ownerEmail: 'e@e.com' });
      expect(store.getById(tenant.id)?.id).toBe(tenant.id);
    });

    it('returns undefined for unknown id', () => {
      expect(store.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('suspend / reinstate', () => {
    it('suspends an active tenant', () => {
      const tenant = store.create({ name: 'Bad Actor', ownerEmail: 'bad@corp.com' });
      store.suspend(tenant.id, 'ToS violation');
      expect(store.getById(tenant.id)?.status).toBe('suspended');
      expect(store.getById(tenant.id)?.suspensionReason).toBe('ToS violation');
    });

    it('reinstates a suspended tenant', () => {
      const tenant = store.create({ name: 'Pardoned', ownerEmail: 'p@corp.com' });
      store.suspend(tenant.id, 'Test');
      store.reinstate(tenant.id);
      expect(store.getById(tenant.id)?.status).toBe('active');
    });

    it('throws when suspending non-existent tenant', () => {
      expect(() => store.suspend('bad', 'reason')).toThrow();
    });
  });

  describe('changePlan', () => {
    it('changes the plan for a tenant', () => {
      const tenant = store.create({ name: 'Growing', ownerEmail: 'g@g.com', plan: 'free' });
      store.changePlan(tenant.id, 'enterprise');
      expect(store.getById(tenant.id)?.plan).toBe('enterprise');
    });

    it('throws for unknown tenant', () => {
      expect(() => store.changePlan('bad', 'pro')).toThrow();
    });
  });

  describe('delete', () => {
    it('removes the tenant', () => {
      const tenant = store.create({ name: 'ToDelete', ownerEmail: 'd@d.com' });
      expect(store.delete(tenant.id)).toBe(true);
      expect(store.getById(tenant.id)).toBeUndefined();
    });

    it('returns false for unknown id', () => {
      expect(store.delete('bad-id')).toBe(false);
    });
  });

  describe('getUsage', () => {
    it('returns usage overview for tenant', () => {
      const tenant = store.create({ name: 'Metrics', ownerEmail: 'm@m.com' });
      const usage = store.getUsage(tenant.id);
      expect(typeof usage.iocCount).toBe('number');
      expect(typeof usage.apiCallCount).toBe('number');
      expect(typeof usage.storageBytes).toBe('number');
    });

    it('throws for unknown tenant', () => {
      expect(() => store.getUsage('bad')).toThrow();
    });
  });
});
