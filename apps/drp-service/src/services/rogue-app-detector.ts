import { randomUUID } from 'node:crypto';
import type { RogueApp } from '../schemas/p1-p2.js';
import type { AlertManager, CreateAlertInput } from './alert-manager.js';
import type { DRPStore } from '../schemas/store.js';
import type { ScanResult } from '../schemas/drp.js';

/** #13 Rogue mobile app detection — unauthorized app detection via name/icon similarity. */
export class RogueAppDetector {
  private readonly alertManager: AlertManager;
  private readonly store: DRPStore;

  constructor(alertManager: AlertManager, store: DRPStore) {
    this.alertManager = alertManager;
    this.store = store;
  }

  /** Scan app stores for rogue apps impersonating the brand. */
  scan(
    tenantId: string,
    appName: string,
    packageName: string | undefined,
    stores: string[],
  ): { apps: RogueApp[]; alertsCreated: number; scanId: string; durationMs: number } {
    const startTime = Date.now();
    const apps: RogueApp[] = [];

    for (const storeName of stores) {
      const storeApps = this.generateRogueApps(appName, packageName, storeName);
      apps.push(...storeApps);
    }

    // Sort by risk
    apps.sort((a, b) => b.riskScore - a.riskScore);

    // Create alerts for suspicious apps
    let alertsCreated = 0;
    for (const app of apps.filter((a) => a.isSuspicious)) {
      const alertInput = this.appToAlertInput(appName, app);
      const alert = this.alertManager.create(tenantId, alertInput);
      if (alert) alertsCreated++;
    }

    const scan: ScanResult = {
      id: randomUUID(),
      tenantId,
      assetId: appName,
      scanType: 'rogue_app',
      status: 'completed',
      findingsCount: apps.length,
      alertsCreated,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    this.store.setScan(tenantId, scan);

    return { apps, alertsCreated, scanId: scan.id, durationMs: scan.durationMs };
  }

  /** Generate simulated rogue apps for a store. */
  private generateRogueApps(
    appName: string,
    officialPackage: string | undefined,
    storeName: string,
  ): RogueApp[] {
    const apps: RogueApp[] = [];
    const base = appName.toLowerCase().replace(/\s+/g, '');
    const variants = [
      `${base} Pro`, `${base} Free`, `${base} Premium`, `${base} Lite`,
      `${base} Plus`, `${appName} Helper`, `${appName} Tool`, `My ${appName}`,
    ];

    for (const name of variants) {
      const nameSim = this.nameSimilarity(appName, name);
      const iconSim = 0.2 + Math.random() * 0.7; // simulated
      const pkg = `com.${base.slice(0, 10)}.${name.replace(/\s+/g, '').toLowerCase().slice(0, 15)}`;
      const isOfficial = officialPackage ? pkg === officialPackage : false;
      const downloads = Math.floor(Math.random() * 100000);
      const rating = 1 + Math.random() * 4;
      const riskScore = this.computeRiskScore(nameSim, iconSim, isOfficial, downloads, rating);

      apps.push({
        id: randomUUID(),
        storeName,
        appName: name,
        packageName: pkg,
        developer: this.randomDeveloper(base),
        nameSimilarity: nameSim,
        iconSimilarity: iconSim,
        downloadCount: downloads,
        rating: Math.round(rating * 10) / 10,
        lastUpdated: new Date(Date.now() - Math.floor(Math.random() * 90 * 86400000)).toISOString(),
        storeUrl: `https://${storeName}.example/app/${pkg}`,
        riskScore,
        isOfficial,
        isSuspicious: riskScore >= 0.5 && !isOfficial,
      });
    }

    return apps;
  }

  private nameSimilarity(official: string, candidate: string): number {
    const a = official.toLowerCase().replace(/\s+/g, '');
    const b = candidate.toLowerCase().replace(/\s+/g, '');
    if (a === b) return 1.0;
    // Check if candidate contains the official name
    if (b.includes(a)) return 0.85;
    const maxLen = Math.max(a.length, b.length);
    const dist = this.levenshteinDistance(a, b);
    return Math.max(0, 1 - dist / maxLen);
  }

  private computeRiskScore(
    nameSim: number,
    iconSim: number,
    isOfficial: boolean,
    downloads: number,
    rating: number,
  ): number {
    if (isOfficial) return 0.05;
    let score = nameSim * 0.35 + iconSim * 0.25;
    // Low-quality apps are riskier
    if (rating < 3.0) score += 0.10;
    if (downloads < 1000) score += 0.10;
    else if (downloads > 50000) score -= 0.05;
    score += 0.15; // baseline
    return Math.min(1, Math.max(0, score));
  }

  private appToAlertInput(brandApp: string, app: RogueApp): CreateAlertInput {
    return {
      assetId: brandApp,
      type: 'rogue_app',
      title: `Rogue app on ${app.storeName}: ${app.appName}`,
      description: `Unauthorized app "${app.appName}" by ${app.developer} on ${app.storeName}. ` +
        `Name similarity: ${(app.nameSimilarity * 100).toFixed(0)}%. ` +
        `Downloads: ${app.downloadCount}. Rating: ${app.rating}.`,
      detectedValue: app.packageName,
      sourceUrl: app.storeUrl,
      evidence: [{
        id: randomUUID(),
        type: 'scan_result',
        title: `Rogue app: ${app.appName}`,
        data: {
          storeName: app.storeName,
          packageName: app.packageName,
          developer: app.developer,
          nameSimilarity: app.nameSimilarity,
          iconSimilarity: app.iconSimilarity,
          downloads: app.downloadCount,
          rating: app.rating,
        },
        collectedAt: new Date().toISOString(),
      }],
      signals: [
        { signalType: 'app_name_similarity', rawValue: app.nameSimilarity, description: `Name: ${(app.nameSimilarity * 100).toFixed(0)}%` },
        { signalType: 'icon_similarity', rawValue: app.iconSimilarity, description: `Icon: ${(app.iconSimilarity * 100).toFixed(0)}%` },
      ],
    };
  }

  private randomDeveloper(base: string): string {
    const devs = [`${base}_dev`, `${base}apps`, `Tech Solutions Ltd`, `MobileDev Inc`, `AppFactory`];
    return devs[Math.floor(Math.random() * devs.length)] ?? devs[0]!;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i]![j] = a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
    return dp[m]![n]!;
  }
}
