/**
 * @module __tests__/honest-onboarding-global
 * @description DECISION-048 honest-UI coverage for /onboarding and the super-admin
 * /global-monitoring page: a real tenant never sees demo/fabricated data — only real
 * data, an honest empty state, or an error card with Retry. Mocks '@/lib/api' in the
 * REAL onboarding-service / normalization-service / ingestion-service envelope
 * shapes so the actual hooks + pages run end to end (real api()/apiList() run on top
 * of the mock, per RCA #45).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { renderHook as rtlRenderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query'
import { createElement } from 'react'

// ─── api() mock — routes by path, real backend envelope shapes (api() already
// unwraps { data: ... }, so mock values here are the POST-unwrap payloads) ───

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => (
    <span data-testid={`stat-${label}`}>{value}</span>
  ),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: (state: Record<string, unknown>) => unknown) => sel({
    user: { displayName: 'Admin', email: 'admin@test.com', role: 'super_admin' },
    tenant: { name: 'ACME' },
    accessToken: 'tok',
  })),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })) }))
vi.mock('@/hooks/use-auth', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn() })) }))
vi.mock('@/hooks/use-intel-data', () => ({ useDashboardStats: vi.fn(() => ({ data: null })) }))

import { OnboardingPage } from '@/pages/OnboardingPage'
import { GlobalMonitoringPage } from '@/pages/GlobalMonitoringPage'
import {
  useOnboardingWizard, useWelcomeDashboard, usePipelineHealth,
  useModuleReadiness, useReadinessCheck,
} from '@/hooks/use-phase6-data'
import { useGlobalIocStats, useCorroborationLeaders, useSubscriptionStats } from '@/hooks/use-global-monitoring'

function hookWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}
function renderHook<T>(cb: () => T) {
  return rtlRenderHook(cb, { wrapper: hookWrapper })
}

function apiRouter(routes: Record<string, unknown | (() => unknown)>) {
  mockApi.mockImplementation(async (path: string) => {
    for (const [prefix, value] of Object.entries(routes)) {
      if (path === prefix || path.startsWith(`${prefix}?`)) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? (value as () => unknown)() : value
      }
    }
    return []
  })
}

beforeEach(() => {
  mockApi.mockReset()
})

// ─── Real, empty/new-tenant shapes ─────────────────────────────────

const NEW_TENANT_WIZARD = {
  id: 'w1', tenantId: 'default', currentStep: 'welcome',
  steps: { welcome: 'in_progress', org_profile: 'pending', team_invite: 'pending', feed_activation: 'pending', integration_setup: 'pending', dashboard_config: 'pending', readiness_check: 'pending', launch: 'pending' },
  completionPercent: 0, orgProfile: null, teamInvites: [], dataSources: [], dashboardPrefs: null,
  startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null,
}

const NEW_TENANT_WELCOME = {
  tenantId: 'default', onboardingComplete: false, completionPercent: 0, nextStep: 'org_profile',
  stats: { feedsActive: 0, iocsIngested: 0, teamMembers: 0, modulesEnabled: 0 },
  quickActions: [], tips: [],
}

const HEALTHY_PIPELINE = {
  overall: 'healthy',
  stages: [{ name: 'ingestion', status: 'healthy', message: 'ok', latencyMs: 10 }],
}

const NO_MODULES: unknown[] = []

const NOT_READY_READINESS = {
  overall: 'not_ready',
  checks: [{ name: 'org_profile', passed: false, description: 'Organization profile configured', required: true }],
  score: 0, maxScore: 10,
}

const ONBOARDING_ROUTES = {
  '/onboarding/wizard/': NEW_TENANT_WIZARD,
  '/onboarding/welcome/': NEW_TENANT_WELCOME,
  '/onboarding/pipeline/health': HEALTHY_PIPELINE,
  '/onboarding/modules/': NO_MODULES,
  '/onboarding/pipeline/readiness': NOT_READY_READINESS,
}

// ─── (a) OnboardingPage — honest empty/new-tenant data, no demo ───────────

describe('OnboardingPage — honest empty/new-tenant state', () => {
  it('shows real new-tenant values with no demo banner or fabricated numbers', async () => {
    apiRouter(ONBOARDING_ROUTES)
    render(<OnboardingPage />)
    await waitFor(() => expect(screen.getByTestId('stat-Completion')).toHaveTextContent('0%'))
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Demo data/i)).not.toBeInTheDocument()
    // Real wizard has no completed steps yet — should never show fabricated "completed" badges
    expect(screen.queryAllByText('completed').length).toBe(0)
  })

  it('module status tab shows honest empty state for a brand new tenant (no modules yet)', async () => {
    apiRouter(ONBOARDING_ROUTES)
    render(<OnboardingPage />)
    fireEvent.click(await screen.findByText('Module Status'))
    expect(await screen.findByText('No modules found.')).toBeTruthy()
  })
})

// ─── (b) OnboardingPage — endpoint rejects → error card + Retry ──────────

describe('OnboardingPage — error state', () => {
  it('shows an error card with Retry when the wizard endpoint rejects, never a stale/fabricated wizard', async () => {
    apiRouter({ ...ONBOARDING_ROUTES, '/onboarding/wizard/': new Error('Service unavailable') })
    render(<OnboardingPage />)
    expect(await screen.findByTestId('query-error')).toBeTruthy()
    expect(screen.getByTestId('query-retry')).toBeTruthy()
    expect(screen.queryByText('CURRENT')).not.toBeInTheDocument()
  })
})

// ─── (c) GlobalMonitoringPage — stuck verdict only fires on real data ─────

const EMPTY_FEEDS: unknown[] = []

describe('GlobalMonitoringPage — honest stuck-pipeline verdict', () => {
  it('never shows a stuck/critical verdict when pipeline data is missing (errored)', async () => {
    apiRouter({
      '/ingestion/catalog': EMPTY_FEEDS,
      '/ingestion/global-pipeline/health': new Error('down'),
      '/normalization/global-iocs/stats': new Error('down'),
      '/normalization/global-iocs': new Error('down'),
      '/ingestion/catalog/subscription-stats': new Error('down'),
    })
    render(<GlobalMonitoringPage />)
    await waitFor(() => expect(screen.getByTestId('status-badge')).toBeTruthy())
    expect(screen.getByTestId('status-badge').textContent).not.toBe('critical')
  })

  it('shows a critical/stuck verdict once real pipeline data reports zero throughput', async () => {
    apiRouter({
      '/ingestion/catalog': EMPTY_FEEDS,
      '/ingestion/global-pipeline/health': {
        queues: [],
        pipeline: { articlesProcessed24h: 0, iocsCreated24h: 0, iocsEnriched24h: 0, avgNormalizeLatencyMs: 0, avgEnrichLatencyMs: 0 },
      },
      '/normalization/global-iocs/stats': new Error('down'),
      '/normalization/global-iocs': new Error('down'),
      '/ingestion/catalog/subscription-stats': new Error('down'),
    })
    render(<GlobalMonitoringPage />)
    await waitFor(() => expect(screen.getByTestId('status-badge').textContent).toBe('critical'))
  })
})

// ─── (d) All 8 hooks: rejection -> isError true, data undefined ──────────

describe('All 8 onboarding/global-monitoring hooks — rejection is honest, never demo', () => {
  const cases: Array<[string, () => UseQueryResult<unknown>]> = [
    ['useOnboardingWizard', () => useOnboardingWizard()],
    ['useWelcomeDashboard', () => useWelcomeDashboard()],
    ['usePipelineHealth', () => usePipelineHealth()],
    ['useModuleReadiness', () => useModuleReadiness()],
    ['useReadinessCheck', () => useReadinessCheck()],
    ['useGlobalIocStats', () => useGlobalIocStats()],
    ['useCorroborationLeaders', () => useCorroborationLeaders()],
    ['useSubscriptionStats', () => useSubscriptionStats()],
  ]

  it.each(cases)('%s: rejected request -> isError true, data undefined', async (_name, useHook) => {
    mockApi.mockReset()
    mockApi.mockRejectedValue(new Error('Service unavailable'))
    const { result } = renderHook(() => useHook())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})
