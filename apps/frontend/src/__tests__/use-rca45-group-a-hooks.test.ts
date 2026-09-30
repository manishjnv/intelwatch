/**
 * @module __tests__/use-rca45-group-a-hooks
 * @description RCA #45 class: api() already unwraps the gateway's { data: ... } envelope, so
 * `api<{ data: X }>(path).then(r => r?.data ?? DEMO)` always hits the DEMO fallback — real data
 * never renders. Covers the Group A hook fixes: use-access-reviews, use-compliance-reports,
 * use-global-catalog, use-global-iocs, use-plan-limits, use-tenant-overrides.
 * Each test mocks api() with the REAL (already-unwrapped) backend payload and asserts the hook
 * surfaces it — not the demo/empty fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))
vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'u0', role: 'super_admin', tenantId: 't1' } }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

// ─── use-access-reviews ──────────────────────────────────────

describe('useQuarterlyReview — real api() return shape', () => {
  it('maps the real AccessReviewService.generateQuarterlyReview() field names', async () => {
    const { useQuarterlyReview } = await import('@/hooks/use-access-reviews')
    mockApi.mockResolvedValueOnce({
      tenantId: 't1', tenantName: 'ACME', totalUsers: 10, activeUsers: 8, inactiveUsers: 2,
      usersAddedInPeriod: 3, usersRemovedInPeriod: 1, staleUsers: 2,
      roleDistribution: { analyst: 5, tenant_admin: 3 },
      mfaAdoptionRate: 62.5, ssoUsersCount: 4, localAuthUsersCount: 6,
      generatedAt: '2026-09-27T00:00:00Z',
    })
    const { result } = renderHook(() => useQuarterlyReview(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      totalUsers: 10, activeUsers: 8, inactiveUsers: 2,
      mfaAdoptionPercent: 62.5, ssoUsers: 4,
      roleBreakdown: { analyst: 5, tenant_admin: 3 },
      usersAddedThisQuarter: 3, usersRemovedThisQuarter: 1, staleAccounts: 2,
    })
  })

  it('returns an honest null (not a crash) when super-admin hits the tenantId-less array reply', async () => {
    const { useQuarterlyReview } = await import('@/hooks/use-access-reviews')
    mockApi.mockResolvedValueOnce([]) // real /admin/access-reviews/quarterly shape without ?tenantId=
    const { result } = renderHook(() => useQuarterlyReview(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

// ─── use-compliance-reports ──────────────────────────────────

describe('useComplianceReport — real api() return shape', () => {
  it('returns the real ComplianceReport object directly, not demo', async () => {
    const { useComplianceReport } = await import('@/hooks/use-compliance-reports')
    const report = {
      id: 'cr9', type: 'privileged_access', periodStart: '2026-01-01', periodEnd: '2026-03-31',
      scope: 'Platform-wide', status: 'completed', generatedBy: 'admin@etip.io',
      createdAt: '2026-03-28T10:00:00Z', sizeBytes: 5000,
    }
    mockApi.mockResolvedValueOnce(report)
    const { result } = renderHook(() => useComplianceReport('cr9'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(report)
  })
})

// ─── use-global-catalog ───────────────────────────────────────

describe('useGlobalCatalog / useMySubscriptions — real api() return shape', () => {
  it('useGlobalCatalog returns the real feed array', async () => {
    const { useGlobalCatalog } = await import('@/hooks/use-global-catalog')
    const feeds = [{ id: 'f1', name: 'AlienVault OTX', description: null, feedType: 'otx', url: 'https://x', enabled: true, sourceReliability: 'B', infoCred: '2', admiraltyCode: 'B2', minPlanTier: 'free', feedReliability: 90, subscriberCount: 5, lastFetchAt: null, totalItemsIngested: 100, consecutiveFailures: 0, createdAt: '2026-01-01T00:00:00Z' }]
    mockApi.mockResolvedValueOnce(feeds)
    const { result } = renderHook(() => useGlobalCatalog(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(feeds)
  })

  it('useMySubscriptions returns the real subscription array', async () => {
    const { useMySubscriptions } = await import('@/hooks/use-global-catalog')
    const subs = [{ id: 's1', tenantId: 't1', globalFeedId: 'f1', alertConfig: {}, createdAt: '2026-01-01T00:00:00Z' }]
    mockApi.mockResolvedValueOnce(subs)
    const { result } = renderHook(() => useMySubscriptions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(subs)
  })
})

// ─── use-global-iocs ───────────────────────────────────────────

describe('use-global-iocs — real api() return shapes', () => {
  it('useGlobalIocs returns the real array, not the 5-item demo set', async () => {
    const { useGlobalIocs } = await import('@/hooks/use-global-iocs')
    const iocs = [{ id: 'gioc-real', iocType: 'ip', value: '1.2.3.4' }]
    mockApi.mockResolvedValueOnce(iocs)
    const { result } = renderHook(() => useGlobalIocs(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(iocs)
  })

  it('useGlobalIocDetail returns the real single record', async () => {
    const { useGlobalIocDetail } = await import('@/hooks/use-global-iocs')
    const ioc = { id: 'gioc-real', iocType: 'domain', value: 'evil.example' }
    mockApi.mockResolvedValueOnce(ioc)
    const { result } = renderHook(() => useGlobalIocDetail('gioc-real'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(ioc)
  })

  it('useCorroborationDetail returns the real detail object', async () => {
    const { useCorroborationDetail } = await import('@/hooks/use-global-iocs')
    const detail = { score: 88, sourceCount: 3, weightedSourceCount: 2.5, independenceScore: 0.7, consensusSeverity: 'high', tier: 'high', narrative: 'x', sources: [] }
    mockApi.mockResolvedValueOnce(detail)
    const { result } = renderHook(() => useCorroborationDetail('gioc-real'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(detail)
  })

  it('useSeverityVotes returns the real vote breakdown', async () => {
    const { useSeverityVotes } = await import('@/hooks/use-global-iocs')
    const votes = { currentSeverity: 'high', totalVotes: 5, voteBreakdown: {}, confidence: 0.8, margin: 0.2 }
    mockApi.mockResolvedValueOnce(votes)
    const { result } = renderHook(() => useSeverityVotes('gioc-real'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(votes)
  })

  it('useFpSummary returns the real fp summary', async () => {
    const { useFpSummary } = await import('@/hooks/use-global-iocs')
    const fp = { fpCount: 2, fpRate: 0.1, totalTenants: 20, reports: [], autoAction: null }
    mockApi.mockResolvedValueOnce(fp)
    const { result } = renderHook(() => useFpSummary('gioc-real'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(fp)
  })
})

// ─── use-plan-limits ────────────────────────────────────────────

describe('usePlanLimits — real api() return shape', () => {
  it('maps the real PlanLimitsStore field names (planId/maxGlobalSubs/minFetchInterval)', async () => {
    const { usePlanLimits } = await import('@/hooks/use-plan-limits')
    mockApi.mockResolvedValueOnce([
      { planId: 'free', maxPrivateFeeds: 3, maxGlobalSubs: 5, minFetchInterval: '4h', retentionDays: 7, aiEnabled: false, dailyTokenBudget: 0 },
      { planId: 'teams', maxPrivateFeeds: 25, maxGlobalSubs: 50, minFetchInterval: '30m', retentionDays: 90, aiEnabled: true, dailyTokenBudget: 100000 },
    ])
    const { result } = renderHook(() => usePlanLimits(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.plans).toEqual([
      { id: 'free', planName: 'Free', maxPrivateFeeds: 3, maxGlobalSubscriptions: 5, minFetchIntervalMinutes: 240, retentionDays: 7, aiEnabled: false, dailyTokenBudget: 0 },
      { id: 'teams', planName: 'Teams', maxPrivateFeeds: 25, maxGlobalSubscriptions: 50, minFetchIntervalMinutes: 30, retentionDays: 90, aiEnabled: true, dailyTokenBudget: 100000 },
    ])
  })
})

// ─── use-tenant-overrides ─────────────────────────────────────

describe('useTenantOverrides — real api() return shape', () => {
  it('returns the real override array, not demo', async () => {
    const { useTenantOverrides } = await import('@/hooks/use-tenant-overrides')
    const overrides = [{
      id: 'ov-real', tenantId: 't1', featureKey: 'ioc_management',
      limitDaily: 999, limitWeekly: null, limitMonthly: null, limitTotal: null,
      reason: 'real', grantedBy: 'a@b.com', grantedAt: '2026-01-01T00:00:00Z', expiresAt: null,
    }]
    mockApi.mockResolvedValueOnce(overrides)
    const { result } = renderHook(() => useTenantOverrides('t1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.overrides).toEqual(overrides)
  })
})
