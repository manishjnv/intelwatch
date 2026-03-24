/**
 * @module hooks/reporting-demo-data
 * @description Realistic demo data for Reporting Service frontend page.
 * Used as fallback when reporting-service (port 3021) is unreachable.
 */

// ─── Helpers ────────────────────────────────────────────────────

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

// ─── Types ──────────────────────────────────────────────────────

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom' | 'executive'
export type ReportFormat = 'json' | 'html' | 'pdf' | 'csv'
export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed'

export interface Report {
  id: string
  title: string
  type: ReportType
  format: ReportFormat
  status: ReportStatus
  createdAt: string
  completedAt?: string
  generationTimeMs?: number
  tenantId: string
  filters?: Record<string, unknown>
}

export interface ReportSchedule {
  id: string
  name: string
  type: ReportType
  format: ReportFormat
  cronExpression: string
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
  runCount: number
  createdAt: string
}

export interface ReportTemplate {
  id: string
  type: ReportType
  name: string
  description: string
  sections: string[]
  defaultFormat: ReportFormat
}

export interface ReportStats {
  total: number
  byStatus: Record<ReportStatus, number>
  byType: Record<ReportType, number>
  avgGenerationTimeMs: number
  activeSchedules: number
}

export interface ReportComparison {
  reportA: { id: string; title: string; generatedAt: string }
  reportB: { id: string; title: string; generatedAt: string }
  changes: { metric: string; valueA: number; valueB: number; delta: number; deltaPercent: number }[]
}

// ─── Demo Data ──────────────────────────────────────────────────

export const DEMO_REPORTS: Report[] = [
  {
    id: 'rpt-001', title: 'Daily Threat Summary — Mar 23', type: 'daily', format: 'html',
    status: 'completed', createdAt: daysAgo(1), completedAt: daysAgo(1),
    generationTimeMs: 2340, tenantId: 'demo-tenant',
  },
  {
    id: 'rpt-002', title: 'Weekly IOC Digest — W12', type: 'weekly', format: 'pdf',
    status: 'completed', createdAt: daysAgo(3), completedAt: daysAgo(3),
    generationTimeMs: 4120, tenantId: 'demo-tenant',
  },
  {
    id: 'rpt-003', title: 'Monthly Executive Brief — Feb 2026', type: 'executive', format: 'pdf',
    status: 'completed', createdAt: daysAgo(7), completedAt: daysAgo(7),
    generationTimeMs: 8450, tenantId: 'demo-tenant',
  },
  {
    id: 'rpt-004', title: 'Custom: APT28 Campaign Analysis', type: 'custom', format: 'html',
    status: 'completed', createdAt: daysAgo(2), completedAt: daysAgo(2),
    generationTimeMs: 3200, tenantId: 'demo-tenant',
  },
  {
    id: 'rpt-005', title: 'Monthly Threat Landscape — Mar 2026', type: 'monthly', format: 'csv',
    status: 'generating', createdAt: hoursAgo(1), tenantId: 'demo-tenant',
  },
  {
    id: 'rpt-006', title: 'Daily Threat Summary — Mar 24', type: 'daily', format: 'json',
    status: 'pending', createdAt: hoursAgo(0.5), tenantId: 'demo-tenant',
  },
  {
    id: 'rpt-007', title: 'Weekly Vulnerability Digest', type: 'weekly', format: 'pdf',
    status: 'failed', createdAt: daysAgo(5), tenantId: 'demo-tenant',
  },
  {
    id: 'rpt-008', title: 'Executive Board Summary — Q1', type: 'executive', format: 'pdf',
    status: 'completed', createdAt: daysAgo(14), completedAt: daysAgo(14),
    generationTimeMs: 12300, tenantId: 'demo-tenant',
  },
]

export const DEMO_SCHEDULES: ReportSchedule[] = [
  {
    id: 'sch-001', name: 'Daily Threat Summary', type: 'daily', format: 'html',
    cronExpression: '0 6 * * *', enabled: true,
    lastRunAt: daysAgo(1), nextRunAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    runCount: 47, createdAt: daysAgo(50),
  },
  {
    id: 'sch-002', name: 'Weekly IOC Digest', type: 'weekly', format: 'pdf',
    cronExpression: '0 8 * * 1', enabled: true,
    lastRunAt: daysAgo(4), nextRunAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    runCount: 12, createdAt: daysAgo(90),
  },
  {
    id: 'sch-003', name: 'Monthly Executive Brief', type: 'executive', format: 'pdf',
    cronExpression: '0 9 1 * *', enabled: true,
    lastRunAt: daysAgo(24), nextRunAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    runCount: 3, createdAt: daysAgo(100),
  },
  {
    id: 'sch-004', name: 'Monthly CSV Export', type: 'monthly', format: 'csv',
    cronExpression: '0 0 1 * *', enabled: false,
    lastRunAt: daysAgo(30), runCount: 2, createdAt: daysAgo(65),
  },
]

export const DEMO_TEMPLATES: ReportTemplate[] = [
  {
    id: 'tpl-daily', type: 'daily', name: 'Daily Threat Summary',
    description: 'Daily overview of new IOCs, alerts, and enrichment activity.',
    sections: ['New IOCs', 'Critical Alerts', 'Enrichment Stats', 'Feed Activity', 'Top Threat Actors'],
    defaultFormat: 'html',
  },
  {
    id: 'tpl-weekly', type: 'weekly', name: 'Weekly Intelligence Digest',
    description: 'Weekly analysis covering IOC trends, malware families, and vulnerability disclosures.',
    sections: ['IOC Trends', 'Malware Families', 'Vulnerability Disclosures', 'Campaign Activity', 'Correlation Highlights', 'Hunting Results'],
    defaultFormat: 'pdf',
  },
  {
    id: 'tpl-monthly', type: 'monthly', name: 'Monthly Threat Landscape',
    description: 'Comprehensive monthly intelligence report with metrics and trend analysis.',
    sections: ['Executive Summary', 'IOC Statistics', 'Threat Actor Activity', 'Malware Trends', 'Vulnerability Metrics', 'DRP Alerts', 'Cost Analysis'],
    defaultFormat: 'pdf',
  },
  {
    id: 'tpl-custom', type: 'custom', name: 'Custom Report',
    description: 'Build a report from selected sections with custom date range and filters.',
    sections: ['Custom Sections', 'Date Range Selection', 'Entity Filters', 'Format Options'],
    defaultFormat: 'html',
  },
  {
    id: 'tpl-executive', type: 'executive', name: 'Executive Brief',
    description: 'Board-level summary with risk posture, key metrics, and strategic recommendations.',
    sections: ['Risk Posture', 'Key Metrics', 'Top Threats', 'Incident Summary', 'Budget Utilization', 'Strategic Recommendations'],
    defaultFormat: 'pdf',
  },
]

export const DEMO_REPORT_STATS: ReportStats = {
  total: 127,
  byStatus: { completed: 112, failed: 5, generating: 1, pending: 9 },
  byType: { daily: 47, weekly: 36, monthly: 18, custom: 14, executive: 12 },
  avgGenerationTimeMs: 4280,
  activeSchedules: 3,
}

export const DEMO_COMPARISON: ReportComparison = {
  reportA: { id: 'rpt-001', title: 'Daily Threat Summary — Mar 23', generatedAt: daysAgo(1) },
  reportB: { id: 'rpt-002', title: 'Weekly IOC Digest — W12', generatedAt: daysAgo(3) },
  changes: [
    { metric: 'New IOCs', valueA: 84, valueB: 312, delta: -228, deltaPercent: -73.1 },
    { metric: 'Critical Alerts', valueA: 3, valueB: 11, delta: -8, deltaPercent: -72.7 },
    { metric: 'Enrichment Rate', valueA: 96, valueB: 94, delta: 2, deltaPercent: 2.1 },
    { metric: 'Threat Actors Active', valueA: 5, valueB: 8, delta: -3, deltaPercent: -37.5 },
    { metric: 'Malware Families', valueA: 2, valueB: 7, delta: -5, deltaPercent: -71.4 },
  ],
}
