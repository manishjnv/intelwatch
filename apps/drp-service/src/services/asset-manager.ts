import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { DRPStore } from '../schemas/store.js';
import type { MonitoredAsset, AssetType } from '../schemas/drp.js';

export interface AssetManagerConfig {
  maxAssetsPerTenant: number;
}

const ASSET_VALIDATORS: Record<string, (v: string) => boolean> = {
  domain: (v) => /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(v),
  email_domain: (v) => /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(v),
  brand_name: (v) => v.length >= 2 && v.length <= 200,
  social_handle: (v) => /^@?[\w.]{1,100}$/.test(v),
  mobile_app: (v) => v.length >= 2 && v.length <= 200,
};

/** Manages monitored assets — CRUD, validation, lifecycle. */
export class AssetManager {
  private readonly store: DRPStore;
  private readonly config: AssetManagerConfig;

  constructor(store: DRPStore, config: AssetManagerConfig) {
    this.store = store;
    this.config = config;
  }

  /** Create a new monitored asset. */
  create(
    tenantId: string,
    userId: string,
    input: {
      type: AssetType;
      value: string;
      displayName: string;
      criticality?: number;
      scanFrequencyHours?: number;
      tags?: string[];
    },
  ): MonitoredAsset {
    const tenantAssets = this.store.getTenantAssets(tenantId);
    if (tenantAssets.size >= this.config.maxAssetsPerTenant) {
      throw new AppError(
        429,
        `Maximum assets per tenant (${this.config.maxAssetsPerTenant}) reached`,
        'MAX_ASSETS_REACHED',
      );
    }

    const normalizedValue = this.normalizeValue(input.type, input.value);

    if (!this.validateAssetValue(input.type, normalizedValue)) {
      throw new AppError(400, `Invalid ${input.type} value: ${input.value}`, 'INVALID_ASSET_VALUE');
    }

    // Check for duplicate
    for (const existing of tenantAssets.values()) {
      if (existing.type === input.type && existing.value === normalizedValue) {
        throw new AppError(409, `Asset already exists: ${normalizedValue}`, 'ASSET_DUPLICATE');
      }
    }

    const now = new Date().toISOString();
    const asset: MonitoredAsset = {
      id: randomUUID(),
      tenantId,
      type: input.type,
      value: normalizedValue,
      displayName: input.displayName,
      enabled: true,
      criticality: input.criticality ?? 0.5,
      scanFrequencyHours: input.scanFrequencyHours ?? 24,
      lastScannedAt: null,
      alertCount: 0,
      tags: input.tags ?? [],
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    this.store.setAsset(tenantId, asset);
    return asset;
  }

  /** Get an asset by ID or throw 404. */
  get(tenantId: string, assetId: string): MonitoredAsset {
    const asset = this.store.getAsset(tenantId, assetId);
    if (!asset) throw new AppError(404, 'Asset not found', 'ASSET_NOT_FOUND');
    return asset;
  }

  /** Update an existing asset. */
  update(
    tenantId: string,
    assetId: string,
    updates: {
      displayName?: string;
      enabled?: boolean;
      criticality?: number;
      scanFrequencyHours?: number;
      tags?: string[];
    },
  ): MonitoredAsset {
    const asset = this.get(tenantId, assetId);
    const updated: MonitoredAsset = {
      ...asset,
      ...(updates.displayName !== undefined && { displayName: updates.displayName }),
      ...(updates.enabled !== undefined && { enabled: updates.enabled }),
      ...(updates.criticality !== undefined && { criticality: updates.criticality }),
      ...(updates.scanFrequencyHours !== undefined && { scanFrequencyHours: updates.scanFrequencyHours }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      updatedAt: new Date().toISOString(),
    };
    this.store.setAsset(tenantId, updated);
    return updated;
  }

  /** Delete an asset. */
  delete(tenantId: string, assetId: string): void {
    const exists = this.store.getAsset(tenantId, assetId);
    if (!exists) throw new AppError(404, 'Asset not found', 'ASSET_NOT_FOUND');
    this.store.deleteAsset(tenantId, assetId);
  }

  /** List assets with pagination and optional type filter. */
  list(
    tenantId: string,
    page: number,
    limit: number,
    type?: string,
  ): { data: MonitoredAsset[]; total: number; page: number; limit: number } {
    return this.store.listAssets(tenantId, page, limit, type);
  }

  /** Get asset statistics. */
  getStats(tenantId: string): {
    total: number;
    byType: Record<string, number>;
    enabled: number;
    disabled: number;
    totalAlerts: number;
  } {
    const assets = Array.from(this.store.getTenantAssets(tenantId).values());
    const byType: Record<string, number> = {};
    let enabled = 0;
    let disabled = 0;
    let totalAlerts = 0;
    for (const a of assets) {
      byType[a.type] = (byType[a.type] ?? 0) + 1;
      if (a.enabled) enabled++;
      else disabled++;
      totalAlerts += a.alertCount;
    }
    return { total: assets.length, byType, enabled, disabled, totalAlerts };
  }

  /** Mark asset as scanned now. */
  markScanned(tenantId: string, assetId: string): void {
    const asset = this.get(tenantId, assetId);
    asset.lastScannedAt = new Date().toISOString();
    asset.updatedAt = asset.lastScannedAt;
    this.store.setAsset(tenantId, asset);
  }

  /** Increment alert count for an asset. */
  incrementAlertCount(tenantId: string, assetId: string): void {
    const asset = this.store.getAsset(tenantId, assetId);
    if (asset) {
      asset.alertCount++;
      this.store.setAsset(tenantId, asset);
    }
  }

  /** Validate an asset value based on its type. */
  validateAssetValue(type: AssetType, value: string): boolean {
    const validator = ASSET_VALIDATORS[type];
    return validator ? validator(value) : value.length > 0;
  }

  /** Normalize asset value (lowercase domains, strip @ from handles). */
  private normalizeValue(type: AssetType, value: string): string {
    switch (type) {
      case 'domain':
      case 'email_domain':
        return value.toLowerCase().replace(/\.$/, '');
      case 'social_handle':
        return value.startsWith('@') ? value.slice(1).toLowerCase() : value.toLowerCase();
      default:
        return value.trim();
    }
  }
}
