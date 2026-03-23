import type { DRPStore } from '../schemas/store.js';
import type { DRPAlert } from '../schemas/drp.js';
import type { AssetRiskScore } from '../schemas/p1-p2.js';
import { AppError } from '@etip/shared-utils';

const TYPE_WEIGHT: Record<string, number> = {
  typosquatting: 0.25,
  credential_leak: 0.30,
  dark_web_mention: 0.20,
  social_impersonation: 0.10,
  rogue_app: 0.05,
  exposed_service: 0.10,
};

const SEVERITY_MULTIPLIER: Record<string, number> = {
  critical: 1.0,
  high: 0.8,
  medium: 0.5,
  low: 0.2,
  info: 0.05,
};

/** #14 Per-asset risk aggregation — composite risk score across all open alerts per asset. */
export class RiskAggregator {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /** Calculate composite risk score for an asset. */
  calculate(tenantId: string, assetId: string): AssetRiskScore {
    const asset = this.store.getAsset(tenantId, assetId);
    if (!asset) throw new AppError(404, 'Asset not found', 'ASSET_NOT_FOUND');

    const alerts = this.store.getAlertsByAsset(tenantId, assetId);
    const openAlerts = alerts.filter((a) => a.status === 'open' || a.status === 'investigating');

    const componentScores = this.computeComponentScores(openAlerts);
    const compositeScore = this.computeComposite(componentScores, asset.criticality);
    const previousScore = this.store.getAssetRisk(tenantId, assetId);
    const trend = this.computeTrend(previousScore?.compositeScore, compositeScore);

    const result: AssetRiskScore = {
      assetId,
      assetValue: asset.value,
      assetType: asset.type,
      compositeScore,
      componentScores,
      openAlertCount: openAlerts.length,
      criticalAlertCount: openAlerts.filter((a) => a.severity === 'critical').length,
      trend,
      lastCalculated: new Date().toISOString(),
    };

    this.store.setAssetRisk(tenantId, result);
    return result;
  }

  /** Calculate risk for all assets in tenant. */
  calculateAll(tenantId: string): AssetRiskScore[] {
    const assets = Array.from(this.store.getTenantAssets(tenantId).values());
    return assets.map((a) => this.calculate(tenantId, a.id));
  }

  /** Compute per-type component scores from open alerts. */
  private computeComponentScores(alerts: DRPAlert[]): AssetRiskScore['componentScores'] {
    const components: AssetRiskScore['componentScores'] = {
      typosquatting: 0,
      credentialLeak: 0,
      darkWeb: 0,
      socialImpersonation: 0,
      rogueApp: 0,
      exposedService: 0,
    };

    const typeMap: Record<string, keyof typeof components> = {
      typosquatting: 'typosquatting',
      credential_leak: 'credentialLeak',
      dark_web_mention: 'darkWeb',
      social_impersonation: 'socialImpersonation',
      rogue_app: 'rogueApp',
      exposed_service: 'exposedService',
    };

    for (const alert of alerts) {
      const key = typeMap[alert.type];
      if (!key) continue;
      const sevMult = SEVERITY_MULTIPLIER[alert.severity] ?? 0.5;
      const score = alert.confidence * sevMult;
      // Take maximum across alerts of same type (don't sum — avoids >1)
      components[key] = Math.max(components[key], score);
    }

    return components;
  }

  /** Weighted composite from component scores, adjusted by asset criticality. */
  private computeComposite(
    components: AssetRiskScore['componentScores'],
    criticality: number,
  ): number {
    let weighted = 0;
    weighted += components.typosquatting * (TYPE_WEIGHT['typosquatting'] ?? 0);
    weighted += components.credentialLeak * (TYPE_WEIGHT['credential_leak'] ?? 0);
    weighted += components.darkWeb * (TYPE_WEIGHT['dark_web_mention'] ?? 0);
    weighted += components.socialImpersonation * (TYPE_WEIGHT['social_impersonation'] ?? 0);
    weighted += components.rogueApp * (TYPE_WEIGHT['rogue_app'] ?? 0);
    weighted += components.exposedService * (TYPE_WEIGHT['exposed_service'] ?? 0);

    // Criticality amplification: high-criticality assets score higher
    const amplified = weighted * (0.5 + criticality * 0.5);
    return Math.min(1, Math.max(0, amplified));
  }

  private computeTrend(
    previous: number | undefined,
    current: number,
  ): 'increasing' | 'decreasing' | 'stable' {
    if (previous === undefined) return 'stable';
    const diff = current - previous;
    if (diff > 0.05) return 'increasing';
    if (diff < -0.05) return 'decreasing';
    return 'stable';
  }
}
