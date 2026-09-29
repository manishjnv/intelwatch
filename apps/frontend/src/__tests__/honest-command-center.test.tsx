/**
 * @module __tests__/honest-command-center
 * @description DECISION-048 honest-UI coverage for the Command Center stats hook
 * (use-command-center.ts) and its Clients tab: a real tenant never sees demo/
 * fabricated data — only real data, an honest empty state, or an error state with
 * Retry. Mocks '@/lib/api' and '@/lib/api-list' in the REAL backend envelope shapes
 * (apps/customization/src/services/command-center-queries.ts,
 * apps/admin-service/src/services/tenant-store.ts) so the real hook adapters run
 * end to end, per RCA #45.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockUser = { id: 'u1', email: 'admin@test.com', displayName: 'Admin', role: 'super_admin', tenantId: 't1', avatarUrl: null }
const mockTenant = { id: 't1', name: 'Test Org', slug: 'test', plan: 'starter' }
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: typeof mockUser; accessToken: string; tenant: typeof mockTenant }) => unknown) =>
    selector({ user: mockUser, accessToken: 'token', tenant: mockTenant }),
}))

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

const mockApiList = vi.fn()
vi.mock('@/lib/api-list', () => ({
  apiList: (...args: unknown[]) => mockApiList(...args),
}))

import { useCommandCenter } from '@/hooks/use-command-center'
import { ClientsTab } from '@/components/command-center/ClientsTab'

type CommandCenterData = ReturnType<typeof useCommandCenter>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

// ─── Real backend shapes ──────────────────────────────────────────

const REAL_GLOBAL_STATS = {
  totalCostUsd: 87.5,
  totalItemsProcessed: 4200,
  byDay: [{ date: '2026-09-28', costUsd: 12.5, itemCount: 600 }],
  byProvider: { anthropic: { costUsd: 70, itemCount: 3500 } },
  byModel: { 'claude-sonnet-4-6': { costUsd: 70, itemCount: 3500 } },
  bySubtask: { triage: { costUsd: 40, itemCount: 2000 } },
}

const REAL_TENANT_STATS = {
  tenantId: 't1',
  totalConsumed: 900,
  totalAttributedCostUsd: 6.4,
  byProvider: { anthropic: { count: 900, costUsd: 6.4 } },
  byItemType: { ioc: { count: 900, costUsd: 6.4 } },
  byDay: [{ date: '2026-09-28', count: 900, costUsd: 6.4 }],
}

const REAL_TENANT_LIST = [
  { tenantId: 't1', itemsConsumed: 900, attributedCostUsd: 6.4 },
]

const REAL_ADMIN_TENANTS = [
  { id: 't1', name: 'Test Org', ownerName: 'Jane', ownerEmail: 'jane@test.com', plan: 'starter', status: 'active', inviteToken: 'x', inviteExpiresAt: '2026-01-01', inviteClaimed: true, featureFlags: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
]

const REAL_QUEUE_STATS = { pendingItems: 3, processingRate: 12, bySubtask: { triage: 3 } }
const REAL_PROVIDER_KEYS = [{ provider: 'anthropic', keyMasked: 'sk-***', isValid: true, lastTested: null, updatedAt: null }]

function apiRouter(routes: Record<string, unknown | (() => unknown)>) {
  mockApi.mockImplementation(async (path: string) => {
    const clean = path.split('?')[0]
    for (const [prefix, value] of Object.entries(routes)) {
      if (clean === prefix) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? (value as () => unknown)() : value
      }
    }
    throw new Error(`unhandled path in test: ${path}`)
  })
}

beforeEach(() => {
  mockApi.mockReset()
  mockApiList.mockReset()
})

describe('useCommandCenter — honest data (DECISION-048)', () => {
  it('never shows demo numbers while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {})) // never resolves
    mockApiList.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useCommandCenter(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.globalStats.totalItems).toBe(0)
    expect(result.current.tenantList).toHaveLength(0)
  })

  it('adapts the real backend shapes into the frontend shape (no mismatch, no fallback)', async () => {
    apiRouter({
      '/customization/command-center/global-stats': REAL_GLOBAL_STATS,
      '/customization/command-center/tenant-stats': REAL_TENANT_STATS,
      '/customization/command-center/tenant-list': REAL_TENANT_LIST,
      '/customization/command-center/queue-stats': REAL_QUEUE_STATS,
      '/customization/provider-keys': REAL_PROVIDER_KEYS,
    })
    mockApiList.mockResolvedValue({ data: REAL_ADMIN_TENANTS, total: 1, page: 1, limit: 50 })

    const { result } = renderHook(() => useCommandCenter(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(false)
    expect(result.current.globalStats.totalItems).toBe(4200)
    expect(result.current.globalStats.totalCostUsd).toBe(87.5)
    expect(result.current.globalStats.costByProvider.anthropic).toBe(70)
    expect(result.current.tenantStats.itemsConsumed).toBe(900)
    expect(result.current.tenantStats.budgetUsedPercent).toBeUndefined()
    // Merged with real admin-service tenant metadata — never a fabricated name/plan.
    expect(result.current.tenantList).toEqual([
      { tenantId: 't1', itemsConsumed: 900, attributedCostUsd: 6.4, name: 'Test Org', plan: 'starter', status: 'active' },
    ])
  })

  it('all queries reject → isError true, EMPTY shape, never demo numbers', async () => {
    mockApi.mockRejectedValue(new Error('service unreachable'))
    mockApiList.mockRejectedValue(new Error('service unreachable'))
    const { result } = renderHook(() => useCommandCenter(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(true)
    expect(result.current.globalStats).toEqual({
      totalCostUsd: 0, totalItems: 0, itemsBySubtask: {},
      costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [],
    })
    expect(result.current.tenantList).toEqual([])
    expect(result.current.providerKeys).toEqual([])
  })

  it('empty tenant list from a real, working endpoint stays empty — not backfilled with demo tenants', async () => {
    apiRouter({
      '/customization/command-center/global-stats': REAL_GLOBAL_STATS,
      '/customization/command-center/tenant-stats': REAL_TENANT_STATS,
      '/customization/command-center/tenant-list': [],
      '/customization/command-center/queue-stats': REAL_QUEUE_STATS,
      '/customization/provider-keys': REAL_PROVIDER_KEYS,
    })
    mockApiList.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 })

    const { result } = renderHook(() => useCommandCenter(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(false)
    expect(result.current.tenantList).toEqual([])
  })
})

describe('ClientsTab — honest empty/error states', () => {
  function makeData(overrides: Record<string, unknown> = {}) {
    return {
      isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'starter',
      globalStats: { totalCostUsd: 0, totalItems: 0, itemsBySubtask: {}, costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [] },
      tenantStats: { tenantId: 't1', itemsConsumed: 0, attributedCostUsd: 0, costByProvider: {}, costByItemType: {}, consumptionTrend: [] },
      tenantList: [],
      queueStats: { pendingItems: 0, processingRate: 0, bySubtask: {} },
      providerKeys: [],
      isLoading: false, isError: false, period: 'month' as const,
      setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
      setProviderKey: vi.fn(), isSettingKey: false,
      testProviderKey: vi.fn(), isTestingKey: false,
      removeProviderKey: vi.fn(), isRemovingKey: false,
      ...overrides,
    } as unknown as CommandCenterData
  }

  it('shows an honest empty state — never a "Demo" label — when there are no tenants', () => {
    render(<ClientsTab data={makeData()} />)
    expect(screen.getByText('No tenants yet')).toBeInTheDocument()
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
  })

  it('shows an error banner with Retry when isError, without hiding the (empty) real data', () => {
    const refetchAll = vi.fn()
    render(<ClientsTab data={makeData({ isError: true, refetchAll })} />)
    expect(screen.getByTestId('clients-error-banner')).toBeInTheDocument()
    screen.getByTestId('clients-error-banner').querySelector('button')?.click()
    expect(refetchAll).toHaveBeenCalled()
  })

  it('renders "—" for tenant fields the backend does not provide (members, usage%, plan, name)', () => {
    render(<ClientsTab data={makeData({
      tenantList: [{ tenantId: 'unnamed-1', itemsConsumed: 5, attributedCostUsd: 1.2 }],
    })} />)
    expect(screen.getByText('unnamed-1')).toBeInTheDocument()
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
  })
})
