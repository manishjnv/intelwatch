/**
 * @module hooks/analytics-demo-data
 * @description Types and realistic demo data for Analytics Service (port 3024).
 * Used as fallback when analytics-service is unreachable.
 */

// ─── Helpers ────────────────────────────────────────────────────

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

// ─── Interfaces ─────────────────────────────────────────────────

export interface WidgetData {
  id: string
  label: string
  value: number | string
  trend?: { delta: number; deltaPercent: number; direction: 'up' | 'down' | 'flat' }
}

export interface DashboardData {
  widgets: Record<string, WidgetData>
  generatedAt: string
  cacheHit: boolean
}

export interface TrendPoint {
  timestamp: string
  value: number
}

export interface TrendSeries {
  metric: string
  label: string
  points: TrendPoint[]
  currentValue: number
  previousValue: number
  delta: number
  deltaPercent: number
  direction: 'up' | 'down' | 'flat'
}

export interface TrendsResponse {
  data: TrendSeries[]
  period: '7d' | '30d' | '90d'
  metrics: string[]
}

export interface ExecutiveSummary {
  riskPosture: 'critical' | 'high' | 'medium' | 'low'
  riskScore: number
  keyMetrics: { label: string; value: number; trend: string }[]
  topThreats: { name: string; severity: string; count: number }[]
  recommendations: string[]
  generatedAt: string
}

export interface ServiceHealthEntry {
  service: string
  port: number
  status: 'healthy' | 'unhealthy' | 'unknown'
  responseMs: number
}

// ─── Demo Data ──────────────────────────────────────────────────

function generateTrendPoints(days: number, base: number, variance: number): TrendPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    timestamp: daysAgo(days - 1 - i),
    value: Math.max(0, Math.round(base + (Math.random() - 0.4) * variance)),
  }))
}

export const DEMO_DASHBOARD: DashboardData = {
  widgets: {
    'ioc.total': { id: 'ioc.total', label: 'Total IOCs', value: 4287, trend: { delta: 142, deltaPercent: 3.4, direction: 'up' } },
    'ioc.critical': { id: 'ioc.critical', label: 'Critical IOCs', value: 89, trend: { delta: 7, deltaPercent: 8.5, direction: 'up' } },
    'feed.active': { id: 'feed.active', label: 'Active Feeds', value: 12, trend: { delta: 0, deltaPercent: 0, direction: 'flat' } },
    'alert.open': { id: 'alert.open', label: 'Open Alerts', value: 38, trend: { delta: -5, deltaPercent: -11.6, direction: 'down' } },
    'alert.total': { id: 'alert.total', label: 'Total Alerts', value: 247, trend: { delta: 18, deltaPercent: 7.9, direction: 'up' } },
    'enrichment.rate': { id: 'enrichment.rate', label: 'Enrichment Rate', value: '94%', trend: { delta: 2, deltaPercent: 2.2, direction: 'up' } },
  },
  generatedAt: hoursAgo(0),
  cacheHit: false,
}

export const DEMO_TRENDS: TrendsResponse = {
  data: [
    { metric: 'ioc.total', label: 'Total IOCs', points: generateTrendPoints(7, 4200, 200), currentValue: 4287, previousValue: 4145, delta: 142, deltaPercent: 3.4, direction: 'up' },
    { metric: 'ioc.critical', label: 'Critical IOCs', points: generateTrendPoints(7, 85, 15), currentValue: 89, previousValue: 82, delta: 7, deltaPercent: 8.5, direction: 'up' },
    { metric: 'alert.open', label: 'Open Alerts', points: generateTrendPoints(7, 40, 12), currentValue: 38, previousValue: 43, delta: -5, deltaPercent: -11.6, direction: 'down' },
    { metric: 'alert.total', label: 'Total Alerts', points: generateTrendPoints(7, 240, 30), currentValue: 247, previousValue: 229, delta: 18, deltaPercent: 7.9, direction: 'up' },
    { metric: 'feed.active', label: 'Active Feeds', points: generateTrendPoints(7, 12, 2), currentValue: 12, previousValue: 12, delta: 0, deltaPercent: 0, direction: 'flat' },
    { metric: 'enrichment.rate', label: 'Enrichment Rate', points: generateTrendPoints(7, 93, 5), currentValue: 94, previousValue: 92, delta: 2, deltaPercent: 2.2, direction: 'up' },
  ],
  period: '7d',
  metrics: ['ioc.total', 'ioc.critical', 'alert.open', 'alert.total', 'feed.active', 'enrichment.rate'],
}

export const DEMO_EXECUTIVE: ExecutiveSummary = {
  riskPosture: 'medium',
  riskScore: 58,
  keyMetrics: [
    { label: 'Total IOCs', value: 4287, trend: 'up' },
    { label: 'Critical IOCs', value: 89, trend: 'up' },
    { label: 'Open Alerts', value: 38, trend: 'down' },
    { label: 'Active Feeds', value: 12, trend: 'flat' },
    { label: 'Enrichment Rate', value: 94, trend: 'up' },
    { label: 'Mean Time to Resolve', value: 47, trend: 'down' },
  ],
  topThreats: [
    { name: 'APT28 (Fancy Bear)', severity: 'critical', count: 23 },
    { name: 'Lazarus Group', severity: 'critical', count: 18 },
    { name: 'Emotet Resurgence', severity: 'high', count: 15 },
    { name: 'LockBit 3.0', severity: 'high', count: 12 },
    { name: 'CVE-2024-21762', severity: 'critical', count: 9 },
  ],
  recommendations: [
    'Investigate 23 APT28-linked IOCs flagged in the last 48 hours',
    'Patch CVE-2024-21762 on Fortinet appliances — CISA KEV listed',
    'Review 5 suppressed DRP alerts for potential false negatives',
    'Enable MFA on 3 admin accounts lacking second factor',
    'Schedule dark web monitoring for newly added brand assets',
  ],
  generatedAt: hoursAgo(1),
}

export const DEMO_SERVICE_HEALTH: ServiceHealthEntry[] = [
  { service: 'API Gateway', port: 3000, status: 'healthy', responseMs: 12 },
  { service: 'Ingestion', port: 3004, status: 'healthy', responseMs: 45 },
  { service: 'Normalization', port: 3005, status: 'healthy', responseMs: 32 },
  { service: 'AI Enrichment', port: 3006, status: 'healthy', responseMs: 180 },
  { service: 'IOC Intelligence', port: 3007, status: 'healthy', responseMs: 28 },
  { service: 'Threat Actors', port: 3008, status: 'healthy', responseMs: 35 },
  { service: 'Malware Intel', port: 3009, status: 'healthy', responseMs: 41 },
  { service: 'Vulnerability Intel', port: 3010, status: 'healthy', responseMs: 38 },
  { service: 'DRP', port: 3011, status: 'healthy', responseMs: 55 },
  { service: 'Threat Graph', port: 3012, status: 'healthy', responseMs: 92 },
  { service: 'Correlation Engine', port: 3013, status: 'healthy', responseMs: 67 },
  { service: 'Threat Hunting', port: 3014, status: 'healthy', responseMs: 48 },
  { service: 'Integration', port: 3015, status: 'healthy', responseMs: 31 },
  { service: 'User Management', port: 3016, status: 'healthy', responseMs: 22 },
  { service: 'Customization', port: 3017, status: 'healthy', responseMs: 19 },
  { service: 'Onboarding', port: 3018, status: 'healthy', responseMs: 25 },
  { service: 'Billing', port: 3019, status: 'healthy', responseMs: 33 },
  { service: 'ES Indexing', port: 3020, status: 'healthy', responseMs: 74 },
  { service: 'Reporting', port: 3021, status: 'healthy', responseMs: 52 },
  { service: 'Admin Ops', port: 3022, status: 'unhealthy', responseMs: 0 },
  { service: 'Alerting', port: 3023, status: 'healthy', responseMs: 29 },
]
