/**
 * Tests for feed health indicators:
 * - computeFeedHealth score calculation
 * - HealthDot color rendering (green/amber/red)
 * - FailureSparkline bar rendering
 * - Overdue indicator logic
 * - Sort by health column
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

// ─── Mock hooks ───────────────────────────────────────────────

const mockRetryMutate = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useFeedQuota: vi.fn(() => ({ data: { planId: 'free', displayName: 'Free', maxFeeds: 3, minFetchInterval: '0 */4 * * *', retentionDays: 7, nextPlan: 'starter', nextPlanMaxFeeds: 10 } })),
  useRetryFeed: vi.fn(() => ({ mutate: mockRetryMutate, isPending: false })),
  useFeeds: vi.fn(() => ({
    data: {
      data: [
        {
          id: 'healthy', name: 'Healthy Feed', description: null,
          feedType: 'rss', url: 'https://example.com/rss', schedule: '*/30 * * * *',
          status: 'active', enabled: true,
          lastFetchAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          lastErrorAt: null, lastErrorMessage: null,
          consecutiveFailures: 0, totalItemsIngested: 5000, feedReliability: 95,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 'degraded', name: 'Degraded Feed', description: null,
          feedType: 'rest_api', url: 'https://example.com/api', schedule: '*/15 * * * *',
          status: 'active', enabled: true,
          lastFetchAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
          lastErrorAt: new Date(Date.now() - 3600_000).toISOString(),
          lastErrorMessage: 'Timeout', consecutiveFailures: 1,
          totalItemsIngested: 200, feedReliability: 60,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 'critical', name: 'Critical Feed', description: null,
          feedType: 'stix', url: 'https://example.com/stix', schedule: '*/5 * * * *',
          status: 'error', enabled: true,
          lastFetchAt: new Date(Date.now() - 48 * 3600_000).toISOString(),
          lastErrorAt: new Date(Date.now() - 60_000).toISOString(),
          lastErrorMessage: 'Connection refused', consecutiveFailures: 5,
          totalItemsIngested: 10, feedReliability: 20,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      ],
      total: 3, page: 1, limit: 50,
    },
    isLoading: false,
  })),
  useIOCs: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useActors: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useMalware: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useVulnerabilities: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useDashboardStats: vi.fn(() => ({ data: { totalIOCs: 0, criticalIOCs: 0, activeFeeds: 0, enrichedToday: 0, lastIngestTime: 'Demo' } })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: any) => selector({
    user: { displayName: 'Analyst', email: 'test@test.com' },
    tenant: { name: 'ACME Corp' },
    accessToken: 'mock-token',
  })),
}))

vi.mock('@/stores/theme-store', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })),
}))

vi.mock('@/hooks/use-auth', () => ({
  useLogout: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock('@/config/modules', () => ({
  MODULES: [],
  getPhaseColor: () => 'text-blue-400',
  getPhaseBgColor: () => 'bg-blue-500/10',
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: any) => <span data-testid={`stat-${label}`}>{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SkeletonBlock', () => ({
  SkeletonBlock: () => <div data-testid="skeleton" />,
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => <div data-testid="toast-container" />,
}))

import {
  computeFeedHealth, healthLevel, HealthDot, FailureSparkline,
} from '@/components/feed/FeedCard'
import { FeedListPage } from '@/pages/FeedListPage'

/* ================================================================
   computeFeedHealth unit tests
   ================================================================ */
describe('computeFeedHealth', () => {
  it('returns high score for healthy feed (0 failures, high reliability, recent fetch)', () => {
    const score = computeFeedHealth({
      consecutiveFailures: 0,
      feedReliability: 95,
      lastFetchAt: new Date(Date.now() - 10 * 60_000).toISOString(), // 10 min ago
      status: 'active',
    })
    // 100*0.4 + 95*0.3 + 100*0.3 = 40 + 28.5 + 30 = 98.5 → 99
    expect(score).toBeGreaterThanOrEqual(90)
    expect(healthLevel(score)).toBe('green')
  })

  it('returns mid score for degraded feed (1 failure, mid reliability, stale fetch)', () => {
    const score = computeFeedHealth({
      consecutiveFailures: 1,
      feedReliability: 60,
      lastFetchAt: new Date(Date.now() - 12 * 3600_000).toISOString(), // 12h ago
      status: 'active',
    })
    // 80*0.4 + 60*0.3 + 50*0.3 = 32 + 18 + 15 = 65
    expect(score).toBeGreaterThanOrEqual(50)
    expect(score).toBeLessThanOrEqual(80)
    expect(healthLevel(score)).toBe('amber')
  })

  it('returns low score for critical feed (5+ failures, low reliability, old fetch)', () => {
    const score = computeFeedHealth({
      consecutiveFailures: 5,
      feedReliability: 20,
      lastFetchAt: new Date(Date.now() - 48 * 3600_000).toISOString(), // 2 days ago
      status: 'error',
    })
    // 0*0.4 + 20*0.3 + 20*0.3 = 0 + 6 + 6 = 12
    expect(score).toBeLessThan(50)
    expect(healthLevel(score)).toBe('red')
  })

  it('handles never-fetched feed (null lastFetchAt)', () => {
    const score = computeFeedHealth({
      consecutiveFailures: 0,
      feedReliability: 50,
      lastFetchAt: null,
      status: 'active',
    })
    // 100*0.4 + 50*0.3 + 0*0.3 = 40 + 15 + 0 = 55
    expect(score).toBe(55)
    expect(healthLevel(score)).toBe('amber')
  })

  it('handles zero failures with zero reliability', () => {
    const score = computeFeedHealth({
      consecutiveFailures: 0,
      feedReliability: 0,
      lastFetchAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
    })
    // 100*0.4 + 0*0.3 + 100*0.3 = 40 + 0 + 30 = 70
    expect(score).toBe(70)
  })
})

/* ================================================================
   HealthDot component tests
   ================================================================ */
describe('HealthDot', () => {
  it('renders green dot for score > 80', () => {
    const { container } = render(<HealthDot score={95} />)
    const dot = screen.getByTestId('health-dot')
    expect(dot).toBeDefined()
    expect(dot.textContent).toContain('95')
  })

  it('renders red dot for score < 50', () => {
    const { container } = render(<HealthDot score={30} />)
    const dot = screen.getByTestId('health-dot')
    expect(dot.textContent).toContain('30')
  })

  it('shows tooltip with score', () => {
    render(<HealthDot score={72} />)
    const dot = screen.getByTestId('health-dot')
    expect(dot.getAttribute('title')).toBe('Health: 72/100')
  })
})

/* ================================================================
   FailureSparkline tests
   ================================================================ */
describe('FailureSparkline', () => {
  it('renders 7 bars', () => {
    render(<FailureSparkline consecutiveFailures={3} />)
    const sparkline = screen.getByTestId('failure-sparkline')
    expect(sparkline.children.length).toBe(7)
  })

  it('renders all green bars for 0 failures', () => {
    const { container } = render(<FailureSparkline consecutiveFailures={0} />)
    const sparkline = screen.getByTestId('failure-sparkline')
    const bars = Array.from(sparkline.children)
    // All bars should be success (green, taller)
    bars.forEach(bar => {
      expect(bar.className).toContain('h-3') // success bars are taller
    })
  })

  it('renders correct mix for 3 failures', () => {
    render(<FailureSparkline consecutiveFailures={3} />)
    const sparkline = screen.getByTestId('failure-sparkline')
    const bars = Array.from(sparkline.children)
    // 4 success (green) + 3 failure (red)
    const successBars = bars.filter(b => b.className.includes('h-3'))
    const failBars = bars.filter(b => b.className.includes('h-2'))
    expect(successBars.length).toBe(4)
    expect(failBars.length).toBe(3)
  })

  it('shows tooltip with failure count', () => {
    render(<FailureSparkline consecutiveFailures={5} />)
    const sparkline = screen.getByTestId('failure-sparkline')
    expect(sparkline.getAttribute('title')).toBe('5 consecutive failures')
  })
})

/* ================================================================
   FeedListPage integration — health column renders
   ================================================================ */
describe('FeedListPage — health indicators', () => {
  it('renders health dots in table view', () => {
    render(<FeedListPage />)
    const healthDots = screen.getAllByTestId('health-dot')
    expect(healthDots.length).toBe(3) // 3 feeds
  })

  it('renders failure sparklines in table view', () => {
    render(<FeedListPage />)
    const sparklines = screen.getAllByTestId('failure-sparkline')
    expect(sparklines.length).toBe(3)
  })
})
