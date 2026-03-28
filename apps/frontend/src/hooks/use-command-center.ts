/**
 * @module hooks/use-command-center
 * @description Comprehensive Command Center hook — parallel fetch of global stats,
 * tenant stats, tenant list, queue stats, provider keys. Role-aware data gating,
 * 5-min cache, demo fallbacks, mutations for provider keys and model assignments.
 */
import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────────

export type Period = 'day' | 'week' | 'month'

export interface GlobalStats {
  totalCostUsd: number
  totalItems: number
  itemsBySubtask: Record<string, number>
  costByProvider: Record<string, number>
  costByModel: Record<string, number>
  costBySubtask: Record<string, number>
  costTrend: { date: string; cost: number }[]
}

export interface TenantStats {
  tenantId: string
  itemsConsumed: number
  attributedCostUsd: number
  costByProvider: Record<string, number>
  costByItemType: Record<string, number>
  consumptionTrend: { date: string; count: number }[]
  budgetUsedPercent: number
  budgetLimitUsd: number
}

export interface TenantListItem {
  tenantId: string
  name: string
  plan: string
  members: number
  itemsConsumed: number
  attributedCostUsd: number
  status: 'active' | 'suspended' | 'over_limit'
  usagePercent: number
}

export interface QueueStats {
  pendingItems: number
  processingRate: number
  stuckItems?: number
  oldestAge?: string
  bySubtask: Record<string, number>
}

export interface ProviderKeyStatus {
  provider: string
  keyMasked: string | null
  isValid: boolean
  lastTested: string | null
  updatedAt: string | null
}

// ─── Demo Data ──────────────────────────────────────────────────

function daysAgoStr(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

const DEMO_GLOBAL_STATS: GlobalStats = {
  totalCostUsd: 142.30,
  totalItems: 12450,
  itemsBySubtask: { triage: 5200, extraction: 3800, classification: 1400, summarization: 1200, risk_scoring: 850 },
  costByProvider: { anthropic: 112.40, openai: 18.50, google: 11.40 },
  costByModel: { 'claude-sonnet-4-6': 95.20, 'claude-haiku-4-5': 17.20, 'gpt-4o': 18.50, 'gemini-2.5-pro': 11.40 },
  costBySubtask: { triage: 15.60, extraction: 62.30, classification: 8.40, summarization: 31.20, risk_scoring: 24.80 },
  costTrend: Array.from({ length: 7 }, (_, i) => ({
    date: daysAgoStr(6 - i),
    cost: Number((18 + Math.sin(i * 0.9) * 6).toFixed(2)),
  })),
}

const DEMO_TENANT_STATS: TenantStats = {
  tenantId: 'demo-tenant',
  itemsConsumed: 3200,
  attributedCostUsd: 23.45,
  costByProvider: { anthropic: 18.20, openai: 3.10, google: 2.15 },
  costByItemType: { ioc: 12.40, article: 8.50, report: 2.55 },
  consumptionTrend: Array.from({ length: 30 }, (_, i) => ({
    date: daysAgoStr(29 - i),
    count: Math.round(80 + Math.sin(i * 0.4) * 30),
  })),
  budgetUsedPercent: 62,
  budgetLimitUsd: 37.00,
}

const DEMO_TENANT_LIST: TenantListItem[] = [
  { tenantId: 't1', name: 'Acme Corp', plan: 'teams', members: 12, itemsConsumed: 8400, attributedCostUsd: 28.30, status: 'active', usagePercent: 76 },
  { tenantId: 't2', name: 'ThreatDefend', plan: 'enterprise', members: 8, itemsConsumed: 6200, attributedCostUsd: 21.10, status: 'active', usagePercent: 56 },
  { tenantId: 't3', name: 'SecOps Inc', plan: 'starter', members: 3, itemsConsumed: 2100, attributedCostUsd: 7.20, status: 'active', usagePercent: 42 },
  { tenantId: 't4', name: 'CyberWatch', plan: 'teams', members: 5, itemsConsumed: 4800, attributedCostUsd: 35.00, status: 'over_limit', usagePercent: 100 },
  { tenantId: 't5', name: 'NullSec', plan: 'free', members: 1, itemsConsumed: 45, attributedCostUsd: 0, status: 'suspended', usagePercent: 0 },
]

const DEMO_QUEUE_STATS: QueueStats = {
  pendingItems: 34,
  processingRate: 42,
  stuckItems: 0,
  oldestAge: '< 2m',
  bySubtask: { triage: 12, extraction: 8, scoring: 6, attribution: 4, others: 4 },
}

const DEMO_PROVIDER_KEYS: ProviderKeyStatus[] = [
  { provider: 'anthropic', keyMasked: 'sk-ant-api0•••••abc1', isValid: true, lastTested: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { provider: 'openai', keyMasked: null, isValid: false, lastTested: null, updatedAt: null },
  { provider: 'google', keyMasked: null, isValid: false, lastTested: null, updatedAt: null },
]

// ─── Fetch Functions ────────────────────────────────────────────

async function fetchGlobalStats(period: Period): Promise<GlobalStats | null> {
  try {
    return await api<GlobalStats>(`/customization/command-center/global-stats?period=${period}`)
  } catch (err) {
    notifyApiError(err, 'command center global stats', null)
    return null
  }
}

async function fetchTenantStats(period: Period): Promise<TenantStats | null> {
  try {
    return await api<TenantStats>(`/customization/command-center/tenant-stats?period=${period}`)
  } catch (err) {
    notifyApiError(err, 'command center tenant stats', null)
    return null
  }
}

async function fetchTenantList(period: Period): Promise<TenantListItem[] | null> {
  try {
    const res = await api<TenantListItem[]>(`/customization/command-center/tenant-list?period=${period}`)
    return res
  } catch (err) {
    notifyApiError(err, 'command center tenant list', null)
    return null
  }
}

async function fetchQueueStats(): Promise<QueueStats | null> {
  try {
    return await api<QueueStats>(`/customization/command-center/queue-stats`)
  } catch (err) {
    notifyApiError(err, 'command center queue stats', null)
    return null
  }
}

async function fetchProviderKeys(): Promise<ProviderKeyStatus[] | null> {
  try {
    return await api<ProviderKeyStatus[]>(`/customization/provider-keys`)
  } catch (err) {
    notifyApiError(err, 'provider keys', null)
    return null
  }
}

// ─── Hook ───────────────────────────────────────────────────────

export function useCommandCenter() {
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.role === 'super_admin'
  const qc = useQueryClient()

  const [period, setPeriod] = useState<Period>('month')

  // ── Parallel queries ──────────────────────────────────────────

  const globalStatsQuery = useQuery({
    queryKey: ['command-center', 'global-stats', period],
    queryFn: () => fetchGlobalStats(period),
    staleTime: 5 * 60_000,
    enabled: isSuperAdmin,
  })

  const tenantStatsQuery = useQuery({
    queryKey: ['command-center', 'tenant-stats', period],
    queryFn: () => fetchTenantStats(period),
    staleTime: 5 * 60_000,
  })

  const tenantListQuery = useQuery({
    queryKey: ['command-center', 'tenant-list', period],
    queryFn: () => fetchTenantList(period),
    staleTime: 5 * 60_000,
    enabled: isSuperAdmin,
  })

  const queueStatsQuery = useQuery({
    queryKey: ['command-center', 'queue-stats'],
    queryFn: fetchQueueStats,
    staleTime: 5 * 60_000,
    enabled: isSuperAdmin,
  })

  const providerKeysQuery = useQuery({
    queryKey: ['command-center', 'provider-keys'],
    queryFn: fetchProviderKeys,
    staleTime: 5 * 60_000,
    enabled: isSuperAdmin,
  })

  // ── Demo detection ────────────────────────────────────────────

  const isLoading = isSuperAdmin
    ? globalStatsQuery.isLoading || tenantListQuery.isLoading
    : tenantStatsQuery.isLoading

  const hasGlobalData = globalStatsQuery.data != null && typeof globalStatsQuery.data === 'object' && globalStatsQuery.data.totalItems != null
  const hasTenantData = tenantStatsQuery.data != null && typeof tenantStatsQuery.data === 'object' && tenantStatsQuery.data.itemsConsumed != null
  const isDemo = !isLoading && (isSuperAdmin ? !hasGlobalData : !hasTenantData)

  const globalStats: GlobalStats = hasGlobalData ? globalStatsQuery.data! : DEMO_GLOBAL_STATS
  const tenantStats: TenantStats = hasTenantData ? tenantStatsQuery.data! : DEMO_TENANT_STATS
  const tenantList: TenantListItem[] = tenantListQuery.data ?? DEMO_TENANT_LIST
  const queueStats: QueueStats = queueStatsQuery.data ?? DEMO_QUEUE_STATS
  const providerKeys: ProviderKeyStatus[] = providerKeysQuery.data ?? DEMO_PROVIDER_KEYS

  // ── Mutations ─────────────────────────────────────────────────

  const setProviderKey = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      api('/customization/provider-keys', { method: 'PUT', body: { provider, apiKey } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['command-center', 'provider-keys'] }),
  })

  const testProviderKey = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      api<{ success: boolean; error?: string }>('/customization/provider-keys/test', { method: 'POST', body: { provider, apiKey } }),
  })

  const removeProviderKey = useMutation({
    mutationFn: (provider: string) =>
      api(`/customization/provider-keys/${provider}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['command-center', 'provider-keys'] }),
  })

  const refetchAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['command-center'] })
  }, [qc])

  return useMemo(() => ({
    // Role
    isSuperAdmin,
    userRole: user?.role ?? 'tenant_admin',
    tenantPlan: 'teams' as string, // from auth store tenant

    // Data
    globalStats,
    tenantStats,
    tenantList,
    queueStats,
    providerKeys,

    // State
    isLoading,
    isDemo,
    period,
    setPeriod,
    refetchAll,

    // Provider key mutations
    setProviderKey: setProviderKey.mutate,
    isSettingKey: setProviderKey.isPending,
    testProviderKey: testProviderKey.mutateAsync,
    isTestingKey: testProviderKey.isPending,
    removeProviderKey: removeProviderKey.mutate,
    isRemovingKey: removeProviderKey.isPending,

    // Loading states
    isFetching: globalStatsQuery.isFetching || tenantStatsQuery.isFetching,
  }), [
    isSuperAdmin, user?.role, globalStats, tenantStats, tenantList, queueStats, providerKeys,
    isLoading, isDemo, period, setPeriod, refetchAll,
    setProviderKey.mutate, setProviderKey.isPending,
    testProviderKey.mutateAsync, testProviderKey.isPending,
    removeProviderKey.mutate, removeProviderKey.isPending,
    globalStatsQuery.isFetching, tenantStatsQuery.isFetching,
  ])
}
