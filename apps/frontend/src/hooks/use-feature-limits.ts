/**
 * @module hooks/use-feature-limits
 * @description React Query hooks for plan feature limits, quota status,
 * and feature-gate checks. Fetches GET /api/v1/billing/limits and caches
 * with 5-min stale time. Shared across FeatureGate, UsagePage, QuotaBanners.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Feature Keys ───────────────────────────────────────────

export const FEATURE_KEYS = [
  'ioc_management', 'threat_actors', 'malware_intel', 'vulnerability_intel',
  'threat_hunting', 'graph_exploration', 'digital_risk_protection', 'correlation_engine',
  'reports', 'ai_enrichment', 'feed_subscriptions', 'users',
  'data_retention', 'api_access', 'ioc_storage', 'alerts',
] as const

export type FeatureKey = typeof FEATURE_KEYS[number]

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ioc_management: 'IOC Management',
  threat_actors: 'Threat Actors',
  malware_intel: 'Malware Intelligence',
  vulnerability_intel: 'Vulnerability Intel',
  threat_hunting: 'Threat Hunting',
  graph_exploration: 'Graph Exploration',
  digital_risk_protection: 'Digital Risk Protection',
  correlation_engine: 'Correlation Engine',
  reports: 'Reports',
  ai_enrichment: 'AI Enrichment',
  feed_subscriptions: 'Feed Subscriptions',
  users: 'User Management',
  data_retention: 'Data Retention',
  api_access: 'API Access',
  ioc_storage: 'IOC Storage',
  alerts: 'Alerts',
}

export const FEATURE_ICONS: Record<FeatureKey, string> = {
  ioc_management: 'Shield',
  threat_actors: 'UserX',
  malware_intel: 'Bug',
  vulnerability_intel: 'ShieldAlert',
  threat_hunting: 'Crosshair',
  graph_exploration: 'GitBranch',
  digital_risk_protection: 'Globe',
  correlation_engine: 'Workflow',
  reports: 'FileText',
  ai_enrichment: 'Sparkles',
  feed_subscriptions: 'Rss',
  users: 'Users',
  data_retention: 'Archive',
  api_access: 'Key',
  ioc_storage: 'Database',
  alerts: 'Bell',
}

// ─── Types ──────────────────────────────────────────────────

export interface FeatureLimitEntry {
  featureKey: FeatureKey
  enabled: boolean
  limitDaily: number
  usedDaily: number
  limitMonthly: number
  usedMonthly: number
  percentDaily: number
  percentMonthly: number
}

export type QuotaStatus = 'ok' | 'warning' | 'critical' | 'exceeded'

export interface QuotaInfo {
  percentage: number
  period: 'daily' | 'monthly'
  limit: number
  used: number
  status: QuotaStatus
}

// ─── Main Hook ──────────────────────────────────────────────

export function useFeatureLimits() {
  const empty: FeatureLimitEntry[] = []

  const result = useQuery({
    queryKey: ['feature-limits'],
    queryFn: () =>
      // api() already unwraps { data } — the old `r?.data` was always undefined (S147)
      api<FeatureLimitEntry[]>('/billing/limits').then(r => (Array.isArray(r) ? r : empty)),
    meta: { resource: 'feature limits' },
    staleTime: 5 * 60_000,
  })

  return {
    ...result,
    features: result.data ?? empty,
  }
}

// ─── Shortcut Hooks ─────────────────────────────────────────

/**
 * Check if a feature is enabled for the current tenant's plan.
 * ponytail: lock only on an explicit enabled:false; on error/unknown let the page load
 * (matches sidebar, DashboardLayout.tsx:169). Seeded plans list every key explicitly,
 * so the default only applies on a fetch error or an unseeded plan. Owner approved.
 */
export function useFeatureEnabled(featureKey: FeatureKey): boolean {
  const { features } = useFeatureLimits()
  const entry = features.find(f => f.featureKey === featureKey)
  return entry?.enabled ?? true
}

/** Get quota status for a feature (highest severity across daily/monthly). */
export function useQuotaStatus(featureKey: FeatureKey): QuotaInfo {
  const { features } = useFeatureLimits()
  const entry = features.find(f => f.featureKey === featureKey)

  if (!entry || !entry.enabled) {
    return { percentage: 0, period: 'daily', limit: 0, used: 0, status: 'ok' }
  }

  const daily = entry.limitDaily > 0 ? entry.percentDaily : 0
  const monthly = entry.limitMonthly > 0 ? entry.percentMonthly : 0

  const useMonthly = monthly >= daily
  const pct = useMonthly ? monthly : daily

  return {
    percentage: pct,
    period: useMonthly ? 'monthly' : 'daily',
    limit: useMonthly ? entry.limitMonthly : entry.limitDaily,
    used: useMonthly ? entry.usedMonthly : entry.usedDaily,
    status: pct >= 100 ? 'exceeded' : pct >= 90 ? 'critical' : pct >= 80 ? 'warning' : 'ok',
  }
}
