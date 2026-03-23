import { randomUUID } from 'node:crypto';
import type { SocialProfile } from '../schemas/p1-p2.js';
import type { AlertManager, CreateAlertInput } from './alert-manager.js';
import type { DRPStore } from '../schemas/store.js';
import type { ScanResult } from '../schemas/drp.js';

/** #10 Social media impersonation — detect fake profiles via handle variation, name similarity. */
export class SocialImpersonationDetector {
  private readonly alertManager: AlertManager;
  private readonly store: DRPStore;

  constructor(alertManager: AlertManager, store: DRPStore) {
    this.alertManager = alertManager;
    this.store = store;
  }

  /** Scan for social impersonation profiles across platforms. */
  scan(
    tenantId: string,
    brandName: string,
    handles: string[],
    platforms: string[],
  ): { profiles: SocialProfile[]; alertsCreated: number; scanId: string; durationMs: number } {
    const startTime = Date.now();
    const profiles: SocialProfile[] = [];

    for (const platform of platforms) {
      const platformProfiles = this.generateSuspiciousProfiles(brandName, handles, platform);
      profiles.push(...platformProfiles);
    }

    // Sort by risk score descending
    profiles.sort((a, b) => b.riskScore - a.riskScore);

    // Create alerts for suspicious profiles
    let alertsCreated = 0;
    for (const profile of profiles.filter((p) => p.isSuspicious)) {
      const alertInput = this.profileToAlertInput(brandName, profile);
      const alert = this.alertManager.create(tenantId, alertInput);
      if (alert) alertsCreated++;
    }

    // Record scan
    const scan: ScanResult = {
      id: randomUUID(),
      tenantId,
      assetId: brandName,
      scanType: 'social_impersonation',
      status: 'completed',
      findingsCount: profiles.length,
      alertsCreated,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    this.store.setScan(tenantId, scan);

    return { profiles, alertsCreated, scanId: scan.id, durationMs: scan.durationMs };
  }

  /** Generate simulated suspicious profiles for a platform. */
  private generateSuspiciousProfiles(
    brandName: string,
    officialHandles: string[],
    platform: string,
  ): SocialProfile[] {
    const profiles: SocialProfile[] = [];
    const variations = this.generateHandleVariations(brandName, officialHandles);

    for (const handle of variations) {
      const nameSim = this.nameSimilarity(brandName, handle);
      const handleSim = this.handleSimilarity(officialHandles, handle);
      const avatarSim = 0.3 + Math.random() * 0.6; // simulated
      const followers = Math.floor(Math.random() * 50000);
      const isVerified = Math.random() < 0.02;
      const riskScore = this.computeRiskScore(nameSim, handleSim, avatarSim, isVerified, followers);

      profiles.push({
        id: randomUUID(),
        platform,
        handle,
        displayName: this.generateDisplayName(brandName, handle),
        bio: `Official ${brandName} support`,
        followersCount: followers,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 180 * 86400000)).toISOString(),
        profileUrl: `https://${platform}.example/profile/${handle}`,
        avatarSimilarity: avatarSim,
        nameSimilarity: nameSim,
        handleSimilarity: handleSim,
        riskScore,
        isVerified,
        isSuspicious: riskScore >= 0.5 && !isVerified,
      });
    }

    return profiles;
  }

  /** Generate handle variations of a brand name. */
  private generateHandleVariations(brandName: string, officialHandles: string[]): string[] {
    const base = brandName.toLowerCase().replace(/\s+/g, '');
    const variations: string[] = [];
    const officialSet = new Set(officialHandles.map((h) => h.toLowerCase()));

    const patterns = [
      `${base}_official`, `${base}_support`, `${base}_help`,
      `${base}hq`, `real${base}`, `the${base}`,
      `${base}1`, `${base}_io`, `${base}team`,
    ];

    for (const v of patterns) {
      if (!officialSet.has(v)) variations.push(v);
    }

    // Add character substitution variants
    if (base.includes('o')) variations.push(base.replace('o', '0'));
    if (base.includes('i')) variations.push(base.replace('i', '1'));
    if (base.includes('l')) variations.push(base.replace('l', '1'));

    return variations.slice(0, 12);
  }

  /** Name similarity using normalized Levenshtein distance. */
  private nameSimilarity(brand: string, handle: string): number {
    const a = brand.toLowerCase().replace(/\s+/g, '');
    const b = handle.toLowerCase().replace(/[_\-0-9]/g, '');
    if (a === b) return 1.0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    const dist = this.levenshteinDistance(a, b);
    return Math.max(0, 1 - dist / maxLen);
  }

  /** Handle similarity against known official handles. */
  private handleSimilarity(officialHandles: string[], candidate: string): number {
    if (officialHandles.length === 0) return 0;
    const sims = officialHandles.map((h) => {
      const a = h.toLowerCase();
      const b = candidate.toLowerCase();
      const maxLen = Math.max(a.length, b.length);
      if (maxLen === 0) return 1;
      return 1 - this.levenshteinDistance(a, b) / maxLen;
    });
    return Math.max(...sims);
  }

  /** Compute composite risk score for a suspicious profile. */
  private computeRiskScore(
    nameSim: number,
    handleSim: number,
    avatarSim: number,
    isVerified: boolean,
    followers: number,
  ): number {
    if (isVerified) return 0.1;
    let score = nameSim * 0.30 + handleSim * 0.25 + avatarSim * 0.20;
    // Recent accounts with few followers are riskier
    if (followers < 100) score += 0.15;
    else if (followers < 1000) score += 0.08;
    score += 0.10; // baseline
    return Math.min(1, Math.max(0, score));
  }

  /** Convert profile to alert creation input. */
  private profileToAlertInput(brandName: string, profile: SocialProfile): CreateAlertInput {
    return {
      assetId: brandName,
      type: 'social_impersonation',
      title: `Impersonation on ${profile.platform}: @${profile.handle}`,
      description: `Suspicious profile @${profile.handle} on ${profile.platform}. ` +
        `Name similarity: ${(profile.nameSimilarity * 100).toFixed(0)}%. ` +
        `Handle similarity: ${(profile.handleSimilarity * 100).toFixed(0)}%. ` +
        `Followers: ${profile.followersCount}.`,
      detectedValue: profile.handle,
      sourceUrl: profile.profileUrl,
      evidence: [{
        id: randomUUID(),
        type: 'scan_result',
        title: `Social profile: @${profile.handle}`,
        data: {
          platform: profile.platform,
          handle: profile.handle,
          nameSimilarity: profile.nameSimilarity,
          handleSimilarity: profile.handleSimilarity,
          avatarSimilarity: profile.avatarSimilarity,
          followersCount: profile.followersCount,
          isVerified: profile.isVerified,
        },
        collectedAt: new Date().toISOString(),
      }],
      signals: [
        { signalType: 'name_similarity', rawValue: profile.nameSimilarity, description: `Name match: ${(profile.nameSimilarity * 100).toFixed(0)}%` },
        { signalType: 'handle_similarity', rawValue: profile.handleSimilarity, description: `Handle match: ${(profile.handleSimilarity * 100).toFixed(0)}%` },
        { signalType: 'avatar_similarity', rawValue: profile.avatarSimilarity, description: `Avatar match: ${(profile.avatarSimilarity * 100).toFixed(0)}%` },
      ],
    };
  }

  /** Generate a display name variation. */
  private generateDisplayName(brand: string, handle: string): string {
    const variants = [brand, `${brand} Official`, `${brand} Support`, `${brand} HQ`];
    const idx = Math.abs(hashCode(handle)) % variants.length;
    return variants[idx] ?? brand;
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

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}
