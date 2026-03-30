/**
 * @module Access Review & Compliance Report types (I-17, I-18)
 * @description Zod schemas and TypeScript types for quarterly access review
 * automation and compliance report generation (SOC 2 CC6.3, ISO 27001 A.9.2.5).
 */
import { z } from 'zod';

// ── Access Review Types (I-17) ─────────────────────────────────────

export const REVIEW_TYPES = ['stale_super_admin', 'stale_user', 'quarterly_review'] as const;
export const ReviewTypeSchema = z.enum(REVIEW_TYPES);
export type ReviewType = z.infer<typeof ReviewTypeSchema>;

export const REVIEW_ACTIONS = ['pending', 'confirmed', 'disabled'] as const;
export const ReviewActionSchema = z.enum(REVIEW_ACTIONS);
export type ReviewAction = z.infer<typeof ReviewActionSchema>;

export const AccessReviewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  reviewType: ReviewTypeSchema,
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: z.coerce.date().nullable(),
  action: ReviewActionSchema,
  notes: z.string().nullable(),
  autoDisabled: z.boolean(),
  createdAt: z.coerce.date(),
});
export type AccessReview = z.infer<typeof AccessReviewSchema>;

export const AccessReviewActionSchema = z.object({
  action: z.enum(['confirmed', 'disabled']),
  notes: z.string().max(1000).optional(),
});
export type AccessReviewActionInput = z.infer<typeof AccessReviewActionSchema>;

export const AccessReviewQuerySchema = z.object({
  reviewType: ReviewTypeSchema.optional(),
  action: ReviewActionSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type AccessReviewQuery = z.infer<typeof AccessReviewQuerySchema>;

// ── Compliance Report Types (I-18) ─────────────────────────────────

export const COMPLIANCE_REPORT_TYPES = ['soc2_access_review', 'privileged_access', 'gdpr_dsar'] as const;
export const ComplianceReportTypeSchema = z.enum(COMPLIANCE_REPORT_TYPES);
export type ComplianceReportType = z.infer<typeof ComplianceReportTypeSchema>;

export const REPORT_STATUSES = ['generating', 'completed', 'failed'] as const;
export const ReportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ComplianceReportSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  reportType: ComplianceReportTypeSchema,
  periodFrom: z.coerce.date(),
  periodTo: z.coerce.date(),
  status: ReportStatusSchema,
  externalRef: z.string().nullable(),
  generatedBy: z.string().uuid(),
  completedAt: z.coerce.date().nullable(),
  fileSizeKb: z.number().int().nullable(),
  createdAt: z.coerce.date(),
});
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;

export const GenerateReportInputSchema = z.object({
  type: ComplianceReportTypeSchema,
  periodFrom: z.string().datetime(),
  periodTo: z.string().datetime(),
  tenantId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
}).refine(
  (d) => d.type !== 'gdpr_dsar' || !!d.userId,
  { message: 'userId is required for GDPR DSAR reports', path: ['userId'] },
);
export type GenerateReportInput = z.infer<typeof GenerateReportInputSchema>;

export const ComplianceReportQuerySchema = z.object({
  type: ComplianceReportTypeSchema.optional(),
  status: ReportStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type ComplianceReportQuery = z.infer<typeof ComplianceReportQuerySchema>;

// ── Quarterly Report Shape ─────────────────────────────────────────

export interface QuarterlyReviewSummary {
  tenantId: string;
  tenantName: string;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  usersAddedInPeriod: number;
  usersRemovedInPeriod: number;
  staleUsers: number;
  roleDistribution: Record<string, number>;
  mfaAdoptionRate: number;
  ssoUsersCount: number;
  localAuthUsersCount: number;
  generatedAt: string;
}

// ── DSAR Export Shape ──────────────────────────────────────────────

export interface DsarExport {
  dataSubject: { id: string; email: string; displayName: string };
  profile: Record<string, unknown>;
  sessions: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  apiKeys: { id: string; name: string; scopes: string[]; createdAt: string }[];
  exportedAt: string;
  requestedBy: string;
}

// ── SOC 2 Report Shape ─────────────────────────────────────────────

export interface Soc2AccessReviewReport {
  period: { from: string; to: string };
  totalUsers: number;
  roleDistribution: Record<string, number>;
  mfaAdoptionRate: number;
  accessChanges: {
    added: number;
    removed: number;
    roleChanged: number;
  };
  staleAccounts: { userId: string; email: string; lastActivityDays: number }[];
  reviewActions: { confirmed: number; disabled: number; pending: number; autoDisabled: number };
  generatedAt: string;
}

// ── Privileged Access Report Shape ─────────────────────────────────

export interface PrivilegedAccessReport {
  period: { from: string; to: string };
  superAdmins: {
    userId: string; email: string; lastLogin: string | null;
    sessionCount: number; mfaEnabled: boolean; geoLocations: string[];
  }[];
  tenantAdmins: {
    userId: string; email: string; tenantName: string;
    lastLogin: string | null; mfaEnabled: boolean;
  }[];
  apiKeys: { tenantId: string; tenantName: string; count: number; lastUsed: string | null; scopes: string[][] }[];
  scimTokens: { tenantId: string; tenantName: string; count: number; lastUsed: string | null }[];
  generatedAt: string;
}
