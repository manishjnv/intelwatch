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

  async function createAsset(value = 'example.com') {
    return manager.create(tenantId, userId, {
      type: 'domain',
      value,
      displayName: 'Example Domain',
      tags: ['test'],
    });
  }

  // 1.1 creates asset with correct fields
  it('1.1 creates asset with correct fields', async () => {
    const asset = await createAsset();
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
  it('1.2 normalizes domain to lowercase', async () => {
    const asset = await createAsset('EXAMPLE.COM');
    expect(asset.value).toBe('example.com');
  });

  // 1.3 strips trailing dot from domain
  it('1.3 strips trailing dot from domain', async () => {
    const asset = await createAsset('example.com.');
    expect(asset.value).toBe('example.com');
  });

  // 1.4 strips @ from social handle
  it('1.4 strips @ from social handle', async () => {
    const asset = await manager.create(tenantId, userId, {
      type: 'social_handle',
      value: '@myhandle',
      displayName: 'My Handle',
    });
    expect(asset.value).toBe('myhandle');
  });

  // 1.5 generates unique IDs
  it('1.5 generates unique IDs', async () => {
    const a1 = await createAsset('one.com');
    const a2 = await createAsset('two.com');
    expect(a1.id).not.toBe(a2.id);
  });

  // 1.6 rejects duplicate asset
  it('1.6 rejects duplicate asset', async () => {
    await createAsset('example.com');
    await expect(createAsset('example.com')).rejects.toThrow('Asset already exists');
  });

  // 1.7 validates domain format
  it('1.7 validates domain format', async () => {
    const asset = await createAsset('valid-domain.co.uk');
    expect(asset.value).toBe('valid-domain.co.uk');
  });

  // 1.8 rejects invalid domain
  it('1.8 rejects invalid domain', async () => {
    await expect(createAsset('not a domain!')).rejects.toThrow('Invalid domain');
  });

  // 1.9 enforces max assets per tenant
  it('1.9 enforces max assets per tenant', async () => {
    await createAsset('a.com');
    await createAsset('b.com');
    await createAsset('c.com');
    await createAsset('d.com');
    await createAsset('e.com');
    await expect(createAsset('f.com')).rejects.toThrow('Maximum assets per tenant');
  });

  // 1.10 gets asset by ID
  it('1.10 gets asset by ID', async () => {
    const created = await createAsset();
    const fetched = await manager.get(tenantId, created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.value).toBe('example.com');
  });

  // 1.11 throws 404 for non-existent asset
  it('1.11 throws 404 for non-existent asset', async () => {
    await expect(manager.get(tenantId, 'nonexistent-id')).rejects.toThrow('Asset not found');
  });

  // 1.12 tenant isolation — different tenant cannot access
  it('1.12 tenant isolation — different tenant cannot access', async () => {
    const asset = await createAsset();
    await expect(manager.get('tenant-other', asset.id)).rejects.toThrow('Asset not found');
  });

  // 1.13 updates asset fields
  it('1.13 updates asset fields', async () => {
    const asset = await createAsset();
    const updated = await manager.update(tenantId, asset.id, {
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
  it('1.14 deletes asset', async () => {
    const asset = await createAsset();
    await manager.delete(tenantId, asset.id);
    await expect(manager.get(tenantId, asset.id)).rejects.toThrow('Asset not found');
  });

  // 1.15 getStats returns correct counts
  it('1.15 getStats returns correct counts', async () => {
    await createAsset('one.com');
    await createAsset('two.com');
    await manager.create(tenantId, userId, {
      type: 'brand_name',
      value: 'MyBrand',
      displayName: 'My Brand',
    });
    // Disable one asset
    const assets = await store.listAllAssets(tenantId);
    await manager.update(tenantId, assets[0]!.id, { enabled: false });

    const stats = await manager.getStats(tenantId);
    expect(stats.total).toBe(3);
    expect(stats.byType['domain']).toBe(2);
    expect(stats.byType['brand_name']).toBe(1);
    expect(stats.enabled).toBe(2);
    expect(stats.disabled).toBe(1);
    expect(stats.totalAlerts).toBe(0);
  });
});
