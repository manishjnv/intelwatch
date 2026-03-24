import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type { ReportType, ReportFormat, ReportStatus, CreateReportDto } from '../schemas/report.js';

export interface ReportRecord {
  id: string;
  type: ReportType;
  format: ReportFormat;
  status: ReportStatus;
  title: string;
  tenantId: string;
  dateRange: { from: string; to: string };
  filters: Record<string, unknown>;
  configVersion: number;
  result: unknown | null;
  errorMessage: string | null;
  generationTimeMs: number | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  deleted: boolean;
}

export interface ReportListResult {
  data: ReportRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ReportStore {
  private _reports: Map<string, ReportRecord> = new Map();
  private _maxPerTenant: number;
  private _retentionDays: number;

  constructor(maxPerTenant = 100, retentionDays = 30) {
    this._maxPerTenant = maxPerTenant;
    this._retentionDays = retentionDays;
  }

  create(input: CreateReportDto): ReportRecord {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this._retentionDays * 24 * 60 * 60 * 1000);

    this._evictIfNeeded(input.tenantId);

    const dateRange = this._computeDateRange(input.type, input.dateRange);
    const title = input.title || this._defaultTitle(input.type);

    const report: ReportRecord = {
      id: randomUUID(),
      type: input.type,
      format: input.format,
      status: 'pending',
      title,
      tenantId: input.tenantId,
      dateRange,
      filters: (input.filters as Record<string, unknown>) || {},
      configVersion: input.configVersion,
      result: null,
      errorMessage: null,
      generationTimeMs: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      deleted: false,
    };

    this._reports.set(report.id, report);
    return report;
  }

  getById(id: string): ReportRecord | undefined {
    const report = this._reports.get(id);
    if (!report || report.deleted) return undefined;
    if (this._isExpired(report)) {
      this._reports.delete(id);
      return undefined;
    }
    return report;
  }

  list(
    tenantId: string,
    opts: { type?: ReportType; status?: ReportStatus; page?: number; limit?: number } = {},
  ): ReportListResult {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;

    this._purgeExpired();

    let reports = Array.from(this._reports.values())
      .filter((r) => !r.deleted && r.tenantId === tenantId);

    if (opts.type) reports = reports.filter((r) => r.type === opts.type);
    if (opts.status) reports = reports.filter((r) => r.status === opts.status);

    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = reports.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const data = reports.slice(start, start + limit);

    return { data, total, page, limit, totalPages };
  }

  updateStatus(id: string, status: ReportStatus, result?: unknown, errorMessage?: string): ReportRecord {
    const report = this._reports.get(id);
    if (!report) throw new AppError(404, `Report not found: ${id}`, 'NOT_FOUND');

    report.status = status;
    report.updatedAt = new Date().toISOString();
    if (result !== undefined) report.result = result;
    if (errorMessage !== undefined) report.errorMessage = errorMessage;

    return report;
  }

  setGenerationTime(id: string, timeMs: number): void {
    const report = this._reports.get(id);
    if (report) {
      report.generationTimeMs = timeMs;
      report.updatedAt = new Date().toISOString();
    }
  }

  softDelete(id: string): boolean {
    const report = this._reports.get(id);
    if (!report || report.deleted) return false;
    report.deleted = true;
    report.updatedAt = new Date().toISOString();
    return true;
  }

  getStats(tenantId?: string): {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    avgGenerationTimeMs: number;
  } {
    this._purgeExpired();
    let reports = Array.from(this._reports.values()).filter((r) => !r.deleted);
    if (tenantId) reports = reports.filter((r) => r.tenantId === tenantId);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalTime = 0;
    let timeCount = 0;

    for (const r of reports) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byType[r.type] = (byType[r.type] || 0) + 1;
      if (r.generationTimeMs !== null) {
        totalTime += r.generationTimeMs;
        timeCount++;
      }
    }

    return {
      total: reports.length,
      byStatus,
      byType,
      avgGenerationTimeMs: timeCount > 0 ? Math.round(totalTime / timeCount) : 0,
    };
  }

  private _computeDateRange(
    type: ReportType,
    custom?: { from?: string; to?: string },
  ): { from: string; to: string } {
    const now = new Date();
    const to = custom?.to || now.toISOString();

    if (custom?.from) return { from: custom.from, to };

    const fromDate = new Date(now);
    switch (type) {
      case 'daily':
        fromDate.setDate(fromDate.getDate() - 1);
        break;
      case 'weekly':
        fromDate.setDate(fromDate.getDate() - 7);
        break;
      case 'monthly':
        fromDate.setMonth(fromDate.getMonth() - 1);
        break;
      case 'executive':
        fromDate.setDate(fromDate.getDate() - 30);
        break;
      case 'custom':
        fromDate.setDate(fromDate.getDate() - 7);
        break;
    }

    return { from: fromDate.toISOString(), to };
  }

  private _defaultTitle(type: ReportType): string {
    const now = new Date().toISOString().split('T')[0];
    const titles: Record<ReportType, string> = {
      daily: `Daily Threat Report — ${now}`,
      weekly: `Weekly Threat Summary — ${now}`,
      monthly: `Monthly Executive Report — ${now}`,
      custom: `Custom Report — ${now}`,
      executive: `Executive Risk Posture — ${now}`,
    };
    return titles[type];
  }

  private _evictIfNeeded(tenantId: string): void {
    const tenantReports = Array.from(this._reports.values())
      .filter((r) => !r.deleted && r.tenantId === tenantId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    while (tenantReports.length >= this._maxPerTenant) {
      const oldest = tenantReports.shift();
      if (oldest) this._reports.delete(oldest.id);
    }
  }

  private _isExpired(report: ReportRecord): boolean {
    return new Date(report.expiresAt).getTime() < Date.now();
  }

  private _purgeExpired(): void {
    for (const [id, report] of this._reports) {
      if (this._isExpired(report)) this._reports.delete(id);
    }
  }
}
