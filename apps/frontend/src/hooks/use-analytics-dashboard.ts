/**
 * @module hooks/use-analytics-dashboard
 * @description Comprehensive analytics dashboard hook — fetches all analytics
 * data in parallel with 5-min cache, demo fallbacks, and date range support.
 */
import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

// ─── Date Range ─────────────────────────────────────────────────

export type DateRangePreset = '24h' | '7d' | '30d' | '90d' | 'custom'

export interface DateRange {
  preset: DateRangePreset
  from: string
  to: string
}

function computeDateRange(preset: DateRangePreset): DateRange {
  const to = new Date().toISOString()
  const ms: Record<string, number> = { '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000, '90d': 7_776_000_000 }
  const from = new Date(Date.now() - (ms[preset] ?? ms['7d'])).toISOString()
  return { preset, from, to }
}

// ─── Types ──────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalIocs: number
  totalArticles: number
  totalFeeds: number
  totalAlerts: number
  avgConfidence: number
  avgEnrichmentQuality: number
  pipelineThroughput: number
}

export interface TrendPoint { date: string; count: number; breakdown?: Record<string, number> }

export interface FeedHealthItem {
  name: string; feedType: string; reliability: number
  articlesPerDay: number; iocsPerDay: number; status: string
}

export interface EnrichmentStats {
  enriched: number; unenriched: number; avgQuality: number
  bySource: Record<string, { success: number; failed: number }>
}

export interface CostStats {
  totalCostUsd: number; costPerArticle: number; costPerIoc: number
  byModel: Record<string, number>
  trend: { date: string; cost: number }[]
}

export interface TopIoc { type: string; value: string; confidence: number; severity: string; corroboration?: number }
export interface TopActor { name: string; iocCount: number; lastSeen: string }
export interface TopCve { id: string; epss: number; severity: string; affectedProducts: number }

export interface AnalyticsDashboardData {
  summary: AnalyticsSummary
  iocTrend: TrendPoint[]
  alertTrend: TrendPoint[]
  iocByType: Record<string, number>
  iocBySeverity: Record<string, number>
  iocByConfidenceTier: Record<string, number>
  iocByLifecycle: Record<string, number>
  feedHealth: FeedHealthItem[]
  enrichmentStats: EnrichmentStats
  costStats: CostStats
  topIocs: TopIoc[]
  topActors: TopActor[]
  topCves: TopCve[]
}

// ─── Demo Fallback Data ─────────────────────────────────────────

function daysAgoStr(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

function generateDemoTrend(days: number, base: number, variance: number): TrendPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: daysAgoStr(days - 1 - i),
    count: Math.max(0, Math.round(base + (Math.sin(i * 0.7) * variance))),
  }))
}

export const DEMO_ANALYTICS: AnalyticsDashboardData = {
  summary: {
    totalIocs: 4287, totalArticles: 17842, totalFeeds: 12,
    totalAlerts: 247, avgConfidence: 72, avgEnrichmentQuality: 84,
    pipelineThroughput: 156,
  },
  iocTrend: generateDemoTrend(7, 180, 40),
  alertTrend: generateDemoTrend(7, 35, 10),
  iocByType: { ip: 1420, domain: 980, hash: 850, url: 520, cve: 340, email: 177 },
  iocBySeverity: { critical: 89, high: 420, medium: 1850, low: 1510, info: 418 },
  iocByConfidenceTier: { none: 120, low: 380, 'low-medium': 680, medium: 1540, 'high-low': 980, high: 587 },
  iocByLifecycle: { new: 340, active: 2100, stale: 820, expired: 650, false_positive: 210, blocked: 120, allowlisted: 47 },
  feedHealth: [
    { name: 'AlienVault OTX', feedType: 'REST', reliability: 85, articlesPerDay: 42, iocsPerDay: 120, status: 'active' },
    { name: 'CISA KEV', feedType: 'NVD', reliability: 95, articlesPerDay: 3, iocsPerDay: 8, status: 'active' },
    { name: 'Abuse.ch URLhaus', feedType: 'REST', reliability: 78, articlesPerDay: 85, iocsPerDay: 210, status: 'active' },
    { name: 'MISP Community', feedType: 'MISP', reliability: 72, articlesPerDay: 15, iocsPerDay: 45, status: 'active' },
    { name: 'NVD CVE', feedType: 'NVD', reliability: 92, articlesPerDay: 28, iocsPerDay: 28, status: 'active' },
    { name: 'PhishTank', feedType: 'REST', reliability: 68, articlesPerDay: 120, iocsPerDay: 120, status: 'degraded' },
  ],
  enrichmentStats: {
    enriched: 3640, unenriched: 647, avgQuality: 84,
    bySource: {
      Shodan: { success: 1200, failed: 80 },
      GreyNoise: { success: 950, failed: 120 },
      EPSS: { success: 340, failed: 10 },
      VirusTotal: { success: 800, failed: 200 },
      WHOIS: { success: 600, failed: 50 },
    },
  },
  costStats: {
    totalCostUsd: 12.47, costPerArticle: 0.0007, costPerIoc: 0.0029,
    byModel: { 'claude-haiku': 4.20, 'claude-sonnet': 8.27 },
    trend: Array.from({ length: 7 }, (_, i) => ({
      date: daysAgoStr(6 - i),
      cost: Number((1.2 + Math.sin(i * 0.9) * 0.6).toFixed(2)),
    })),
  },
  topIocs: [
    { type: 'ip', value: '185.220.101.34', confidence: 92, severity: 'critical', corroboration: 5 },
    { type: 'domain', value: 'evil-payload.xyz', confidence: 88, severity: 'critical', corroboration: 4 },
    { type: 'hash', value: 'a1b2c3d4e5f6...', confidence: 85, severity: 'high', corroboration: 3 },
    { type: 'cve', value: 'CVE-2024-21762', confidence: 95, severity: 'critical', corroboration: 6 },
    { type: 'url', value: 'https://phish.example/login', confidence: 78, severity: 'high', corroboration: 2 },
  ],
  topActors: [
    { name: 'APT28 (Fancy Bear)', iocCount: 23, lastSeen: daysAgoStr(1) },
    { name: 'Lazarus Group', iocCount: 18, lastSeen: daysAgoStr(2) },
    { name: 'FIN7', iocCount: 12, lastSeen: daysAgoStr(3) },
  ],
  topCves: [
    { id: 'CVE-2024-21762', epss: 0.94, severity: 'critical', affectedProducts: 3 },
    { id: 'CVE-2024-3400', epss: 0.87, severity: 'critical', affectedProducts: 1 },
    { id: 'CVE-2024-1709', epss: 0.72, severity: 'high', affectedProducts: 2 },
    { id: 'CVE-2024-27198', epss: 0.45, severity: 'high', affectedProducts: 1 },
    { id: 'CVE-2024-20353', epss: 0.08, severity: 'medium', affectedProducts: 4 },
  ],
}

// ─── Fetch + Merge ──────────────────────────────────────────────

async function fetchAnalytics(range: DateRange): Promise<AnalyticsDashboardData> {
  const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
  const empty = null

  const [dashboard, trends, distributions, costTracking, enrichQuality,
    feedPerf, alertSummary, topIocs, topActors, topVulns] = await Promise.allSettled([
    api<Record<string, unknown>>(`/analytics?${qs}`).catch(() => empty),
    api<{ data: { metric: string; points: { timestamp: string; value: number }[] }[] }>(`/analytics/trends?period=${range.preset === '24h' ? '7d' : range.preset === 'custom' ? '30d' : range.preset}`).catch(() => empty),
    api<Record<string, unknown>>(`/analytics/distributions`).catch(() => empty),
    api<Record<string, unknown>>(`/analytics/cost-tracking`).catch(() => empty),
    api<Record<string, unknown>>(`/analytics/enrichment-quality`).catch(() => empty),
    api<Record<string, unknown>>(`/analytics/feed-performance`).catch(() => empty),
    api<Record<string, unknown>>(`/analytics/alert-summary`).catch(() => empty),
    api<unknown[]>(`/analytics/top-iocs`).catch(() => empty),
    api<unknown[]>(`/analytics/top-actors`).catch(() => empty),
    api<unknown[]>(`/analytics/top-vulns`).catch(() => empty),
  ])

  const val = <T,>(r: PromiseSettledResult<T | null>): T | null =>
    r.status === 'fulfilled' ? r.value : null

  const db = val(dashboard) as Record<string, unknown> | null
  const widgets = (db?.widgets ?? {}) as Record<string, { value: number | string }>
  const tr = val(trends) as { data: { metric: string; points: { timestamp: string; value: number }[] }[] } | null
  const dist = val(distributions) as Record<string, unknown> | null
  const cost = val(costTracking) as Record<string, unknown> | null
  const enrich = val(enrichQuality) as Record<string, unknown> | null
  const feed = val(feedPerf) as Record<string, unknown> | null
  const alerts = val(alertSummary) as Record<string, unknown> | null
  const iocs = val(topIocs) as Record<string, unknown>[] | null
  const actors = val(topActors) as Record<string, unknown>[] | null
  const vulns = val(topVulns) as Record<string, unknown>[] | null

  // If everything failed, return null to trigger demo fallback
  const allFailed = [db, tr, dist, cost, enrich].every(v => v === null)
  if (allFailed) return null as unknown as AnalyticsDashboardData

  const num = (v: unknown) => Number(v ?? 0)
  const iocTrend = (tr?.data ?? []).find(s => s.metric === 'ioc.total')
  const alertTrend = (tr?.data ?? []).find(s => s.metric === 'alert.open')

  return {
    summary: {
      totalIocs: num(widgets['total-iocs']?.value),
      totalArticles: num(feed?.totalArticles),
      totalFeeds: num(widgets['active-feeds']?.value),
      totalAlerts: num(alerts?.total ?? widgets['alert-breakdown']?.value),
      avgConfidence: num(enrich?.highPct ?? 72),
      avgEnrichmentQuality: num(enrich?.highPct ?? 84),
      pipelineThroughput: num(widgets['processing-rate']?.value ?? 0),
    },
    iocTrend: (iocTrend?.points ?? []).map(p => ({ date: p.timestamp.slice(0, 10), count: p.value })),
    alertTrend: (alertTrend?.points ?? []).map(p => ({ date: p.timestamp.slice(0, 10), count: p.value })),
    iocByType: (dist?.byType as Record<string, number>) ?? {},
    iocBySeverity: (dist?.bySeverity as Record<string, number>) ?? {},
    iocByConfidenceTier: (dist?.byConfidenceTier as Record<string, number>) ?? {},
    iocByLifecycle: (dist?.byLifecycle as Record<string, number>) ?? {},
    feedHealth: Array.isArray(feed?.feeds) ? (feed.feeds as FeedHealthItem[]) : [],
    enrichmentStats: {
      enriched: num(enrich?.highConfidence) + num(enrich?.mediumConfidence) + num(enrich?.lowConfidence),
      unenriched: num(enrich?.pendingEnrichment),
      avgQuality: num(enrich?.highPct ?? 0),
      bySource: (enrich?.bySource as Record<string, { success: number; failed: number }>) ?? {},
    },
    costStats: {
      totalCostUsd: num(cost?.totalCostUsd),
      costPerArticle: num(cost?.costPerArticle),
      costPerIoc: num(cost?.costPerIoc),
      byModel: (cost?.byModel as Record<string, number>) ?? {},
      trend: (cost?.trend as { date: string; cost: number }[]) ?? [],
    },
    topIocs: (iocs ?? []).map(i => ({
      type: String(i.type ?? 'unknown'), value: String(i.value ?? ''),
      confidence: num(i.confidence), severity: String(i.severity ?? 'medium'),
      corroboration: num(i.corroborationCount),
    })),
    topActors: (actors ?? []).map(a => ({
      name: String(a.name ?? ''), iocCount: num(a.iocCount),
      lastSeen: String(a.lastSeen ?? ''),
    })),
    topCves: (vulns ?? []).map(v => ({
      id: String(v.cveId ?? v.id ?? ''), epss: num(v.epss),
      severity: String(v.severity ?? 'medium'), affectedProducts: num(v.affectedProducts),
    })),
  }
}

// ─── Hook ───────────────────────────────────────────────────────

export function useAnalyticsDashboard(initialPreset: DateRangePreset = '7d') {
  const [dateRange, setDateRange] = useState<DateRange>(() => computeDateRange(initialPreset))

  const setPreset = useCallback((preset: DateRangePreset) => {
    setDateRange(computeDateRange(preset))
  }, [])

  const setCustomRange = useCallback((from: string, to: string) => {
    setDateRange({ preset: 'custom', from, to })
  }, [])

  const result = useQuery({
    queryKey: ['analytics-dashboard-full', dateRange.preset, dateRange.from],
    queryFn: () => fetchAnalytics(dateRange).catch(err => {
      notifyApiError(err, 'analytics dashboard')
      return null as unknown as AnalyticsDashboardData
    }),
    staleTime: 5 * 60_000,
  })

  const hasData = result.data != null && typeof result.data === 'object' && result.data.summary != null
  const isDemo = !result.isLoading && !hasData
  const data: AnalyticsDashboardData = hasData ? result.data : DEMO_ANALYTICS

  return useMemo(() => ({
    ...data,
    isLoading: result.isLoading,
    error: result.error,
    isDemo,
    dateRange,
    setPreset,
    setCustomRange,
    refetch: result.refetch,
    isFetching: result.isFetching,
    dataUpdatedAt: result.dataUpdatedAt,
  }), [data, result.isLoading, result.error, isDemo, dateRange, setPreset, setCustomRange, result.refetch, result.isFetching, result.dataUpdatedAt])
}
