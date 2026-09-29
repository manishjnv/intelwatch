/**
 * @module hooks/use-command-center
 * @description Comprehensive Command Center hook — parallel fetch of global stats,
 * tenant stats, tenant list (merged with real tenant metadata from admin-service),
 * queue stats, provider keys. Honest data only (DECISION-048): no demo fallback,
 * loading/error render an EMPTY shape and the page shows an error banner + Retry.
 */
import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Real shape of GET /admin/tenants rows (apps/admin-service/src/services/tenant-store.ts
 * TenantRecord) — deliberately NOT the `TenantRecord` type in use-phase6-data.ts/
 * phase6-demo-data.ts, whose seats/usedSeats/domain/iocCount/feedCount/'trial' status
 * do not exist on the real endpoint (separate pre-existing bug, out of this slice's scope).
 */
interface AdminTenantRow {
  id: string
  name: string
  plan: string
  status: TenantStatus
}

// ─── Types ──────────────────────────────────────────────────────

export type Period = 'day' | 'week' | 'month'
export type TenantStatus = 'active' | 'suspended' | 'pending' | 'deleted'

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
  /** ponytail: no service tracks a per-tenant AI budget today. Always undefined — render '—'. */
  budgetUsedPercent?: number
  budgetLimitUsd?: number
}

export interface TenantListItem {
  tenantId: string
  itemsConsumed: number
  attributedCostUsd: number
  /** From admin-service /admin/tenants; undefined while that lookup is loading/errored. */
  name?: string
  plan?: string
  status?: TenantStatus
  /** ponytail: no service exposes per-tenant member count or a usage%/budget metric today. */
  members?: number
  usagePercent?: number
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

// ─── Empty shapes — loading/error placeholders, never fabricated numbers ─

export const EMPTY_GLOBAL_STATS: GlobalStats = {
  totalCostUsd: 0, totalItems: 0, itemsBySubtask: {},
  costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [],
}

export const EMPTY_TENANT_STATS: TenantStats = {
  tenantId: '', itemsConsumed: 0, attributedCostUsd: 0,
  costByProvider: {}, costByItemType: {}, consumptionTrend: [],
}

export const EMPTY_QUEUE_STATS: QueueStats = {
  pendingItems: 0, processingRate: 0, bySubtask: {},
}

// ─── Backend raw shapes (apps/customization/src/services/command-center-queries.ts) ─

interface RawGlobalStats {
  totalCostUsd: number
  totalItemsProcessed: number
  byDay: Array<{ date: string; costUsd: number; itemCount: number }>
  byProvider: Record<string, { costUsd: number; itemCount: number }>
  byModel: Record<string, { costUsd: number; itemCount: number }>
  bySubtask: Record<string, { costUsd: number; itemCount: number }>
}

interface RawTenantStats {
  tenantId: string
  totalConsumed: number
  totalAttributedCostUsd: number
  byProvider: Record<string, { count: number; costUsd: number }>
  byItemType: Record<string, { count: number; costUsd: number }>
  byDay: Array<{ date: string; count: number; costUsd: number }>
}

interface RawTenantListEntry {
  tenantId: string
  itemsConsumed: number
  attributedCostUsd: number
}

function mapVal<T, R>(rec: Record<string, T>, fn: (v: T) => R): Record<string, R> {
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, fn(v)]))
}

function adaptGlobalStats(raw: RawGlobalStats): GlobalStats {
  return {
    totalCostUsd: raw.totalCostUsd,
    totalItems: raw.totalItemsProcessed,
    itemsBySubtask: mapVal(raw.bySubtask, v => v.itemCount),
    costByProvider: mapVal(raw.byProvider, v => v.costUsd),
    costByModel: mapVal(raw.byModel, v => v.costUsd),
    costBySubtask: mapVal(raw.bySubtask, v => v.costUsd),
    costTrend: raw.byDay.map(d => ({ date: d.date, cost: d.costUsd })),
  }
}

function adaptTenantStats(raw: RawTenantStats): TenantStats {
  return {
    tenantId: raw.tenantId,
    itemsConsumed: raw.totalConsumed,
    attributedCostUsd: raw.totalAttributedCostUsd,
    costByProvider: mapVal(raw.byProvider, v => v.costUsd),
    costByItemType: mapVal(raw.byItemType, v => v.costUsd),
    consumptionTrend: raw.byDay.map(d => ({ date: d.date, count: d.count })),
  }
}

const STALE = 5 * 60_000

// ─── Hook ───────────────────────────────────────────────────────

export function useCommandCenter() {
  const user = useAuthStore(s => s.user)
  const tenant = useAuthStore(s => s.tenant)
  const isSuperAdmin = user?.role === 'super_admin'
  const qc = useQueryClient()

  const [period, setPeriod] = useState<Period>('month')

  // ── Parallel queries ──────────────────────────────────────────

  const globalStatsQuery = useQuery({
    queryKey: ['command-center', 'global-stats', period],
    queryFn: () => api<RawGlobalStats>(`/customization/command-center/global-stats?period=${period}`).then(adaptGlobalStats),
    meta: { resource: 'command center global stats' },
    staleTime: STALE,
    enabled: isSuperAdmin,
  })

  const tenantStatsQuery = useQuery({
    queryKey: ['command-center', 'tenant-stats', period],
    queryFn: () => api<RawTenantStats>(`/customization/command-center/tenant-stats?period=${period}`).then(adaptTenantStats),
    meta: { resource: 'command center tenant stats' },
    staleTime: STALE,
  })

  const tenantListQuery = useQuery({
    queryKey: ['command-center', 'tenant-list', period],
    queryFn: () => api<RawTenantListEntry[]>(`/customization/command-center/tenant-list?period=${period}`),
    meta: { resource: 'command center tenant list' },
    staleTime: STALE,
    enabled: isSuperAdmin,
  })

  // Real tenant metadata (name/plan/status) — separate service, merged below.
  // Shares the queryKey used by hooks/use-phase6-data's useAdminTenants for cache reuse.
  const tenantMetaQuery = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => apiList<AdminTenantRow>('/admin/tenants'),
    meta: { resource: 'tenants' },
    staleTime: 60_000,
    enabled: isSuperAdmin,
  })

  const queueStatsQuery = useQuery({
    queryKey: ['command-center', 'queue-stats'],
    queryFn: () => api<QueueStats>(`/customization/command-center/queue-stats`),
    meta: { resource: 'command center queue stats' },
    staleTime: STALE,
    enabled: isSuperAdmin,
  })

  const providerKeysQuery = useQuery({
    queryKey: ['command-center', 'provider-keys'],
    queryFn: () => api<ProviderKeyStatus[]>(`/customization/provider-keys`),
    meta: { resource: 'provider keys' },
    staleTime: STALE,
    enabled: isSuperAdmin,
  })

  // ── Honest values (EMPTY shape while loading/error — never demo numbers) ──

  const isLoading = isSuperAdmin
    ? globalStatsQuery.isLoading || tenantListQuery.isLoading
    : tenantStatsQuery.isLoading

  const isError = isSuperAdmin
    ? globalStatsQuery.isError || tenantListQuery.isError || tenantMetaQuery.isError
      || queueStatsQuery.isError || providerKeysQuery.isError
    : tenantStatsQuery.isError

  const globalStats: GlobalStats = globalStatsQuery.data ?? EMPTY_GLOBAL_STATS
  const tenantStats: TenantStats = tenantStatsQuery.data ?? EMPTY_TENANT_STATS
  const queueStats: QueueStats = queueStatsQuery.data ?? EMPTY_QUEUE_STATS
  const providerKeys: ProviderKeyStatus[] = providerKeysQuery.data ?? []

  const tenantMetaById = useMemo(() => {
    const rows = tenantMetaQuery.data?.data ?? []
    return new Map(rows.map(t => [t.id, t]))
  }, [tenantMetaQuery.data])

  const tenantList: TenantListItem[] = useMemo(() => {
    const rows = tenantListQuery.data ?? []
    return rows.map(r => {
      const meta = tenantMetaById.get(r.tenantId)
      return {
        tenantId: r.tenantId,
        itemsConsumed: r.itemsConsumed,
        attributedCostUsd: r.attributedCostUsd,
        name: meta?.name,
        plan: meta?.plan,
        status: meta?.status,
      }
    })
  }, [tenantListQuery.data, tenantMetaById])

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
    void qc.invalidateQueries({ queryKey: ['admin-tenants'] })
  }, [qc])

  return useMemo(() => ({
    // Role
    isSuperAdmin,
    userRole: user?.role ?? 'tenant_admin',
    tenantPlan: tenant?.plan ?? 'free',

    // Data
    globalStats,
    tenantStats,
    tenantList,
    queueStats,
    providerKeys,

    // State
    isLoading,
    isError,
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
    isSuperAdmin, user?.role, tenant?.plan, globalStats, tenantStats, tenantList, queueStats, providerKeys,
    isLoading, isError, period, setPeriod, refetchAll,
    setProviderKey.mutate, setProviderKey.isPending,
    testProviderKey.mutateAsync, testProviderKey.isPending,
    removeProviderKey.mutate, removeProviderKey.isPending,
    globalStatsQuery.isFetching, tenantStatsQuery.isFetching,
  ])
}

