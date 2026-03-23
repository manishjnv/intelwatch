import { describe, it, expect, beforeEach } from 'vitest';
import { AssetManager } from '../src/services/asset-manager.js';
import { DRPStore } from '../src/schemas/store.js';

describe('DRP Service — #1 Asset Manager', () => {
  let store: DRPStore;
  let manager: AssetManager;
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    store = new DRPStore();
    manager = new AssetManager(store, { maxAssetsPerTenant: 5 });
  });

  function createAsset(value = 'example.com') {
    return manager.create(tenantId, userId, {
      type: 'domain',
      value,
      displayName: 'Example Domain',
      tags: ['test'],
    });
  }

  // 1.1 creates asset with correct fields
  it('1.1 creates asset with correct fields', () => {
    const asset = createAsset();
    expect(asset.id).toBeDefined();
    expect(asset.tenantId).toBe(tenantId);
    expect(asset.type).toBe('domain');
    expect(asset.value).toBe('example.com');
    expect(asset.displayName).toBe('Example Domain');
    expect(asset.enabled).toBe(true);
    expect(asset.criticality).toBe(0.5);
    expect(asset.scanFrequencyHours).toBe(24);
    expect(asset.lastScannedAt).toBeNull();
    expect(asset.alertCount).toBe(0);
    expect(asset.tags).toEqual(['test']);
    expect(asset.createdBy).toBe(userId);
    expect(asset.createdAt).toBeDefined();
    expect(asset.updatedAt).toBeDefined();
  });

  // 1.2 normalizes domain to lowercase
  it('1.2 normalizes domain to lowercase', () => {
    const asset = createAsset('EXAMPLE.COM');
    expect(asset.value).toBe('example.com');
  });

  // 1.3 strips trailing dot from domain
  it('1.3 strips trailing dot from domain', () => {
    const asset = createAsset('example.com.');
    expect(asset.value).toBe('example.com');
  });

  // 1.4 strips @ from social handle
  it('1.4 strips @ from social handle', () => {
    const asset = manager.create(tenantId, userId, {
      type: 'social_handle',
      value: '@myhandle',
      displayName: 'My Handle',
    });
    expect(asset.value).toBe('myhandle');
  });

  // 1.5 generates unique IDs
  it('1.5 generates unique IDs', () => {
    const a1 = createAsset('one.com');
    const a2 = createAsset('two.com');
    expect(a1.id).not.toBe(a2.id);
  });

  // 1.6 rejects duplicate asset
  it('1.6 rejects duplicate asset', () => {
    createAsset('example.com');
    expect(() => createAsset('example.com')).toThrow('Asset already exists');
  });

  // 1.7 validates domain format
  it('1.7 validates domain format', () => {
    const asset = createAsset('valid-domain.co.uk');
    expect(asset.value).toBe('valid-domain.co.uk');
  });

  // 1.8 rejects invalid domain
  it('1.8 rejects invalid domain', () => {
    expect(() => createAsset('not a domain!')).toThrow('Invalid domain');
  });

  // 1.9 enforces max assets per tenant
  it('1.9 enforces max assets per tenant', () => {
    createAsset('a.com');
    createAsset('b.com');
    createAsset('c.com');
    createAsset('d.com');
    createAsset('e.com');
    expect(() => createAsset('f.com')).toThrow('Maximum assets per tenant');
  });

  // 1.10 gets asset by ID
  it('1.10 gets asset by ID', () => {
    const created = createAsset();
    const fetched = manager.get(tenantId, created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.value).toBe('example.com');
  });

  // 1.11 throws 404 for non-existent asset
  it('1.11 throws 404 for non-existent asset', () => {
    expect(() => manager.get(tenantId, 'nonexistent-id')).toThrow('Asset not found');
  });

  // 1.12 tenant isolation — different tenant cannot access
  it('1.12 tenant isolation — different tenant cannot access', () => {
    const asset = createAsset();
    expect(() => manager.get('tenant-other', asset.id)).toThrow('Asset not found');
  });

  // 1.13 updates asset fields
  it('1.13 updates asset fields', () => {
    const asset = createAsset();
    const updated = manager.update(tenantId, asset.id, {
      displayName: 'Updated Name',
      enabled: false,
      criticality: 0.9,
      tags: ['updated', 'important'],
    });
    expect(updated.displayName).toBe('Updated Name');
    expect(updated.enabled).toBe(false);
    expect(updated.criticality).toBe(0.9);
    expect(updated.tags).toEqual(['updated', 'important']);
    // updatedAt should be a valid ISO string (may equal createdAt if same ms)
    expect(updated.updatedAt).toBeDefined();
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(asset.createdAt).getTime(),
    );
  });

  // 1.14 deletes asset
  it('1.14 deletes asset', () => {
    const asset = createAsset();
    manager.delete(tenantId, asset.id);
    expect(() => manager.get(tenantId, asset.id)).toThrow('Asset not found');
  });

  // 1.15 getStats returns correct counts
  it('1.15 getStats returns correct counts', () => {
    createAsset('one.com');
    createAsset('two.com');
    manager.create(tenantId, userId, {
      type: 'brand_name',
      value: 'MyBrand',
      displayName: 'My Brand',
    });
    // Disable one asset
    const assets = Array.from(store.getTenantAssets(tenantId).values());
    manager.update(tenantId, assets[0]!.id, { enabled: false });

    const stats = manager.getStats(tenantId);
    expect(stats.total).toBe(3);
    expect(stats.byType['domain']).toBe(2);
    expect(stats.byType['brand_name']).toBe(1);
    expect(stats.enabled).toBe(2);
    expect(stats.disabled).toBe(1);
    expect(stats.totalAlerts).toBe(0);
  });
});
