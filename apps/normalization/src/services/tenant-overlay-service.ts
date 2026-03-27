/**
 * @module TenantOverlayService
 * @description Multi-tenant IOC overlay — tenants see global IOCs with their own
 * customizations (severity, confidence, lifecycle, tags, notes).
 * Overlay values WIN over global defaults when set.
 * DECISION-029 Phase B2.
 */

import type { PrismaClient } from '@prisma/client';

export interface TenantIocView {
  id: string;
  iocType: string;
  value: string;
  normalizedValue: string;
  severity: string;
  confidence: number;
  lifecycle: string;
  tags: string[];
  notes: string | null;
  firstSeen: Date;
  lastSeen: Date;
  crossFeedCorroboration: number;
  stixConfidenceTier: string;
  enrichmentQuality: number;
  warninglistMatch: string | null;
  affectedCPEs: string[];
  enrichmentData?: unknown;
  hasOverlay: boolean;
  overriddenBy: string | null;
  overriddenAt: Date | null;
}

export interface OverlayInput {
  customSeverity?: string;
  customConfidence?: number;
  customLifecycle?: string;
  customTags?: string[];
  customNotes?: string;
  overriddenBy: string;
}

export interface OverlayStats {
  totalGlobalIocs: number;
  overlayCount: number;
  customSeverityCount: number;
  customConfidenceCount: number;
  customTagsCount: number;
}

export interface TenantIocFilters {
  iocType?: string;
  severity?: string;
  minConfidence?: number;
  lifecycle?: string;
  limit?: number;
  offset?: number;
}

export class TenantOverlayService {
  constructor(private readonly prisma: PrismaClient) {}

  async getIocsForTenant(tenantId: string, filters?: TenantIocFilters): Promise<TenantIocView[]> {
    const limit = Math.min(filters?.limit ?? 50, 500);
    const offset = filters?.offset ?? 0;

    // Build where clause for global IOCs
    const where: Record<string, unknown> = {};
    if (filters?.iocType) where['iocType'] = filters.iocType;
    if (filters?.lifecycle) where['lifecycle'] = filters.lifecycle;
    if (filters?.severity) where['severity'] = filters.severity;
    if (filters?.minConfidence != null) where['confidence'] = { gte: filters.minConfidence };

    const globalIocs = await this.prisma.globalIoc.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { lastSeen: 'desc' },
      include: {
        overlays: { where: { tenantId } },
      },
    });

    return globalIocs.map((ioc) => {
      const overlay = ioc.overlays[0] ?? null;
      const globalTags = ioc.tags ?? [];
      const customTags = overlay?.customTags ?? [];
      const mergedTags = [...new Set([...globalTags, ...customTags])];

      return {
        id: ioc.id,
        iocType: ioc.iocType,
        value: ioc.value,
        normalizedValue: ioc.normalizedValue,
        severity: overlay?.customSeverity ?? ioc.severity,
        confidence: overlay?.customConfidence ?? ioc.confidence,
        lifecycle: overlay?.customLifecycle ?? ioc.lifecycle,
        tags: mergedTags,
        notes: overlay?.customNotes ?? null,
        firstSeen: ioc.firstSeen,
        lastSeen: ioc.lastSeen,
        crossFeedCorroboration: ioc.crossFeedCorroboration,
        stixConfidenceTier: ioc.stixConfidenceTier,
        enrichmentQuality: ioc.enrichmentQuality,
        warninglistMatch: ioc.warninglistMatch,
        affectedCPEs: ioc.affectedCPEs ?? [],
        hasOverlay: !!overlay,
        overriddenBy: overlay?.overriddenBy ?? null,
        overriddenAt: overlay?.overriddenAt ?? null,
      };
    });
  }

  async getIocDetail(tenantId: string, globalIocId: string): Promise<TenantIocView | null> {
    const ioc = await this.prisma.globalIoc.findUnique({
      where: { id: globalIocId },
      include: { overlays: { where: { tenantId } } },
    });
    if (!ioc) return null;

    const overlay = ioc.overlays[0] ?? null;
    const globalTags = ioc.tags ?? [];
    const customTags = overlay?.customTags ?? [];
    const mergedTags = [...new Set([...globalTags, ...customTags])];

    return {
      id: ioc.id,
      iocType: ioc.iocType,
      value: ioc.value,
      normalizedValue: ioc.normalizedValue,
      severity: overlay?.customSeverity ?? ioc.severity,
      confidence: overlay?.customConfidence ?? ioc.confidence,
      lifecycle: overlay?.customLifecycle ?? ioc.lifecycle,
      tags: mergedTags,
      notes: overlay?.customNotes ?? null,
      firstSeen: ioc.firstSeen,
      lastSeen: ioc.lastSeen,
      crossFeedCorroboration: ioc.crossFeedCorroboration,
      stixConfidenceTier: ioc.stixConfidenceTier,
      enrichmentQuality: ioc.enrichmentQuality,
      warninglistMatch: ioc.warninglistMatch,
      affectedCPEs: ioc.affectedCPEs ?? [],
      enrichmentData: ioc.enrichmentData,
      hasOverlay: !!overlay,
      overriddenBy: overlay?.overriddenBy ?? null,
      overriddenAt: overlay?.overriddenAt ?? null,
    };
  }

  async setOverlay(tenantId: string, globalIocId: string, overlay: OverlayInput) {
    return this.prisma.tenantIocOverlay.upsert({
      where: {
        tenantId_globalIocId: { tenantId, globalIocId },
      },
      create: {
        tenantId,
        globalIocId,
        customSeverity: overlay.customSeverity,
        customConfidence: overlay.customConfidence,
        customLifecycle: overlay.customLifecycle,
        customTags: overlay.customTags ?? [],
        customNotes: overlay.customNotes,
        overriddenBy: overlay.overriddenBy,
        overriddenAt: new Date(),
      },
      update: {
        ...(overlay.customSeverity !== undefined && { customSeverity: overlay.customSeverity }),
        ...(overlay.customConfidence !== undefined && { customConfidence: overlay.customConfidence }),
        ...(overlay.customLifecycle !== undefined && { customLifecycle: overlay.customLifecycle }),
        ...(overlay.customTags !== undefined && { customTags: overlay.customTags }),
        ...(overlay.customNotes !== undefined && { customNotes: overlay.customNotes }),
        overriddenBy: overlay.overriddenBy,
        overriddenAt: new Date(),
      },
    });
  }

  async removeOverlay(tenantId: string, globalIocId: string): Promise<void> {
    await this.prisma.tenantIocOverlay.deleteMany({
      where: { tenantId, globalIocId },
    });
  }

  async getOverlay(tenantId: string, globalIocId: string) {
    return this.prisma.tenantIocOverlay.findUnique({
      where: { tenantId_globalIocId: { tenantId, globalIocId } },
    });
  }

  async bulkSetOverlay(tenantId: string, globalIocIds: string[], overlay: OverlayInput): Promise<number> {
    let count = 0;
    for (const globalIocId of globalIocIds) {
      await this.setOverlay(tenantId, globalIocId, overlay);
      count++;
    }
    return count;
  }

  async getOverlayStats(tenantId: string): Promise<OverlayStats> {
    const [totalGlobalIocs, overlays] = await Promise.all([
      this.prisma.globalIoc.count(),
      this.prisma.tenantIocOverlay.findMany({ where: { tenantId } }),
    ]);

    let customSeverityCount = 0;
    let customConfidenceCount = 0;
    let customTagsCount = 0;

    for (const o of overlays) {
      if (o.customSeverity) customSeverityCount++;
      if (o.customConfidence != null) customConfidenceCount++;
      if (o.customTags && o.customTags.length > 0) customTagsCount++;
    }

    return {
      totalGlobalIocs,
      overlayCount: overlays.length,
      customSeverityCount,
      customConfidenceCount,
      customTagsCount,
    };
  }
}
