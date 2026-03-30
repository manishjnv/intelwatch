/**
 * @module compliance-report-repository
 * @description Prisma CRUD for ComplianceReport model (I-18).
 */
import { prisma } from './prisma.js';

// ── Create ──────────────────────────────────────────────────────────

/** Create a compliance report record. */
export async function createComplianceReport(data: {
  tenantId?: string;
  reportType: string;
  periodFrom: Date;
  periodTo: Date;
  generatedBy: string;
  status?: string;
}) {
  return prisma.complianceReport.create({
    data: {
      tenantId: data.tenantId ?? null,
      reportType: data.reportType,
      periodFrom: data.periodFrom,
      periodTo: data.periodTo,
      generatedBy: data.generatedBy,
      status: data.status ?? 'generating',
    },
  });
}

// ── Read ────────────────────────────────────────────────────────────

/** Find a compliance report by ID. */
export async function findComplianceReportById(id: string) {
  return prisma.complianceReport.findUnique({ where: { id } });
}

/** List compliance reports with optional filters, paginated. */
export async function listComplianceReports(filters: {
  tenantId?: string;
  reportType?: string;
  status?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.reportType) where.reportType = filters.reportType;
  if (filters.status) where.status = filters.status;

  const [data, total] = await Promise.all([
    prisma.complianceReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.complianceReport.count({ where }),
  ]);

  return { data, total, page: filters.page, limit: filters.limit };
}

// ── Update ──────────────────────────────────────────────────────────

/** Mark a report as completed with data. */
export async function completeComplianceReport(id: string, data: {
  reportData: unknown;
  externalRef?: string;
  fileSizeKb?: number;
}) {
  return prisma.complianceReport.update({
    where: { id },
    data: {
      status: 'completed',
      // Prisma Json field accepts InputJsonValue — cast via unknown (RCA #27 pattern)
      reportData: data.reportData as object,
      externalRef: data.externalRef ?? null,
      fileSizeKb: data.fileSizeKb ?? null,
      completedAt: new Date(),
    },
  });
}

/** Mark a report as failed. */
export async function failComplianceReport(id: string) {
  return prisma.complianceReport.update({
    where: { id },
    data: { status: 'failed', completedAt: new Date() },
  });
}
