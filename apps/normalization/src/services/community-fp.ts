/**
 * @module CommunityFpService
 * @description Community false-positive reporting. Tenants report benign IOCs,
 * building consensus. Auto-actions: >50% downgrades severity, >75% marks false_positive.
 * DECISION-029 Phase G.
 */

import type { PrismaClient } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────

export interface FpReport {
  tenantId: string;
  reason: 'benign_service' | 'internal_infra' | 'test_data' | 'other';
  notes?: string;
  reportedBy: string;
  reportedAt: string;
}

export interface FpReportResult {
  fpCount: number;
  fpRate: number;
  autoAction: 'downgraded' | 'marked_fp' | null;
}

export interface FpSummary {
  fpCount: number;
  fpRate: number;
  totalTenants: number;
  reports: Array<{ tenantId: string; reason: string; reportedAt: string }>;
  autoAction: 'downgraded' | 'marked_fp' | null;
}

export interface FpCandidate {
  id: string;
  iocType: string;
  value: string;
  fpCount: number;
  fpRate: number;
}

// ── Service ──────────────────────────────────────────────────

export class CommunityFpService {
  constructor(private prisma: PrismaClient) {}

  async reportFalsePositive(
    globalIocId: string,
    report: {
      tenantId: string;
      reason: 'benign_service' | 'internal_infra' | 'test_data' | 'other';
      notes?: string;
      reportedBy: string;
    },
  ): Promise<FpReportResult> {
    const ioc = await this.prisma.globalIoc.findUnique({ where: { id: globalIocId } });
    if (!ioc) throw new Error(`GlobalIoc not found: ${globalIocId}`);

    const enrichmentData = (ioc.enrichmentData as Record<string, unknown>) ?? {};
    const fpReports: FpReport[] = (enrichmentData.fpReports as FpReport[]) ?? [];

    // Deduplicate: one report per tenant per IOC
    if (fpReports.some(r => r.tenantId === report.tenantId)) {
      throw Object.assign(new Error('Tenant has already reported this IOC'), { statusCode: 409 });
    }

    // Add report
    fpReports.push({
      tenantId: report.tenantId,
      reason: report.reason,
      notes: report.notes,
      reportedBy: report.reportedBy,
      reportedAt: new Date().toISOString(),
    });

    // Count total subscribed tenants
    const totalTenants = await this.prisma.tenantFeedSubscription.groupBy({
      by: ['tenantId'],
    }).then(rows => rows.length).catch(() => 1);

    const fpCount = fpReports.length;
    const fpRate = totalTenants > 0 ? Math.round(fpCount / totalTenants * 100) : 0;

    // Confidence adjustment: -5 per FP report, cap at -30
    const confidenceAdjustment = Math.max(-fpCount * 5, -30);
    const newConfidence = Math.max(Math.min((ioc.confidence ?? 50) + confidenceAdjustment, 100), 0);

    // Auto-actions
    let autoAction: 'downgraded' | 'marked_fp' | null = null;
    let severity = ioc.severity;
    let lifecycle = ioc.lifecycle;

    if (fpRate > 75) {
      autoAction = 'marked_fp';
      lifecycle = 'false_positive';
      severity = 'info';
    } else if (fpRate > 50) {
      autoAction = 'downgraded';
      severity = 'info';
    }

    await this.prisma.globalIoc.update({
      where: { id: globalIocId },
      data: {
        communityFpCount: fpCount,
        communityFpRate: fpRate,
        confidence: newConfidence,
        severity,
        lifecycle,
        enrichmentData: { ...enrichmentData, fpReports } as any,
      },
    });

    return { fpCount, fpRate, autoAction };
  }

  async withdrawFpReport(globalIocId: string, tenantId: string): Promise<void> {
    const ioc = await this.prisma.globalIoc.findUnique({ where: { id: globalIocId } });
    if (!ioc) throw new Error(`GlobalIoc not found: ${globalIocId}`);

    const enrichmentData = (ioc.enrichmentData as Record<string, unknown>) ?? {};
    const fpReports: FpReport[] = (enrichmentData.fpReports as FpReport[]) ?? [];

    const filtered = fpReports.filter(r => r.tenantId !== tenantId);
    if (filtered.length === fpReports.length) return; // nothing to withdraw

    const totalTenants = await this.prisma.tenantFeedSubscription.groupBy({
      by: ['tenantId'],
    }).then(rows => rows.length).catch(() => 1);

    const fpCount = filtered.length;
    const fpRate = totalTenants > 0 ? Math.round(fpCount / totalTenants * 100) : 0;

    await this.prisma.globalIoc.update({
      where: { id: globalIocId },
      data: {
        communityFpCount: fpCount,
        communityFpRate: fpRate,
        enrichmentData: { ...enrichmentData, fpReports: filtered } as any,
      },
    });
  }

  async getFpSummary(globalIocId: string): Promise<FpSummary> {
    const ioc = await this.prisma.globalIoc.findUnique({ where: { id: globalIocId } });
    if (!ioc) throw new Error(`GlobalIoc not found: ${globalIocId}`);

    const enrichmentData = (ioc.enrichmentData as Record<string, unknown>) ?? {};
    const fpReports: FpReport[] = (enrichmentData.fpReports as FpReport[]) ?? [];

    const totalTenants = await this.prisma.tenantFeedSubscription.groupBy({
      by: ['tenantId'],
    }).then(rows => rows.length).catch(() => 1);

    const fpRate = ioc.communityFpRate ?? 0;
    const autoAction: FpSummary['autoAction'] = fpRate > 75 ? 'marked_fp' : fpRate > 50 ? 'downgraded' : null;

    return {
      fpCount: ioc.communityFpCount ?? 0,
      fpRate,
      totalTenants,
      reports: fpReports.map(r => ({
        tenantId: r.tenantId,
        reason: r.reason,
        reportedAt: r.reportedAt,
      })),
      autoAction,
    };
  }

  async getTopFpCandidates(limit = 20): Promise<FpCandidate[]> {
    const candidates = await this.prisma.globalIoc.findMany({
      where: {
        communityFpCount: { gt: 0 },
        lifecycle: { not: 'false_positive' },
      },
      orderBy: { communityFpRate: 'desc' },
      take: limit,
      select: {
        id: true,
        iocType: true,
        value: true,
        communityFpCount: true,
        communityFpRate: true,
      },
    });

    return candidates.map(c => ({
      id: c.id,
      iocType: c.iocType,
      value: c.value,
      fpCount: c.communityFpCount ?? 0,
      fpRate: c.communityFpRate ?? 0,
    }));
  }
}
