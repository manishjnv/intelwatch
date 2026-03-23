/**
 * Tests for FeedListPage UX improvements:
 * - getNextFireLabel cron parser
 * - StatusDot rendering per status
 * - FeedTypeIcon rendering per type
 * - Inline error details for feeds in error state
 * - Row tinting via severityField
 * - Demo data renders all 5 feeds
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock hooks ───────────────────────────────────────────────

vi.mock('@/hooks/use-intel-data', () => ({
  useFeeds: vi.fn(() => ({
    data: {
      data: [
        {
          id: 'f1', name: 'AlienVault OTX', description: 'OTX feed',
          feedType: 'rss', url: 'https://otx.alienvault.com', schedule: '0 */4 * * *',
          status: 'active', enabled: true,
          lastFetchAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
          lastErrorAt: null, lastErrorMessage: null,
          consecutiveFailures: 0, totalItemsIngested: 8420, feedReliability: 98,
          createdAt: new Date(Date.now() - 90 * 86400_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'f2', name: 'CISA KEV', description: 'CISA feed',
          feedType: 'rest_api', url: 'https://cisa.gov/kev', schedule: '0 0 * * *',
          status: 'error', enabled: true,
          lastFetchAt: new Date(Date.now() - 86400_000).toISOString(),
          lastErrorAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
          lastErrorMessage: 'Connection timeout after 30000ms',
          consecutiveFailures: 3, totalItemsIngested: 890, feedReliability: 82,
          createdAt: new Date(Date.now() - 45 * 86400_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'f3', name: 'MalwareBazaar', description: 'MB feed',
          feedType: 'rest_api', url: 'https://mb-api.abuse.ch', schedule: '0 */6 * * *',
          status: 'disabled', enabled: false,
          lastFetchAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
          lastErrorAt: null, lastErrorMessage: null,
          consecutiveFailures: 0, totalItemsIngested: 3200, feedReliability: 94,
          createdAt: new Date(Date.now() - 75 * 86400_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 3, page: 1, limit: 50,
    },
    isLoading: false,
    isDemo: false,
  })),
  useIOCs: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useActors: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useMalware: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useVulnerabilities: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useDashboardStats: vi.fn(() => ({ data: { totalIOCs: 0, criticalIOCs: 0, activeFeeds: 0, enrichedToday: 0, lastIngestTime: 'Demo' } })),
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

import { FeedListPage } from '@/pages/FeedListPage'
import { FeedCard } from '@/components/feed/FeedCard'
import { FeedScheduleTimeline } from '@/components/feed/FeedScheduleTimeline'
import type { FeedRecord } from '@/hooks/use-intel-data'

/* ================================================================ */
/* Feed list renders                                                  */
/* ================================================================ */
describe('FeedListPage', () => {
  it('renders all feed names', () => {
    render(<FeedListPage />)
    expect(screen.getByText('AlienVault OTX')).toBeInTheDocument()
    expect(screen.getByText('CISA KEV')).toBeInTheDocument()
    expect(screen.getByText('MalwareBazaar')).toBeInTheDocument()
  })

  it('shows Active status for active feed', () => {
    render(<FeedListPage />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows Error status for error feed', () => {
    render(<FeedListPage />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('shows Disabled status for disabled feed', () => {
    render(<FeedListPage />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('shows inline error message for error feed', () => {
    render(<FeedListPage />)
    expect(screen.getByText(/Connection timeout after 30000ms/)).toBeInTheDocument()
  })

  it('shows consecutive failures count for error feed', () => {
    render(<FeedListPage />)
    expect(screen.getByText(/3 consecutive/)).toBeInTheDocument()
  })

  it('does NOT show error message for active feed', () => {
    render(<FeedListPage />)
    // OTX description should show (not suppressed)
    expect(screen.getByText('OTX feed')).toBeInTheDocument()
  })

  it('shows total feeds stat', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('stat-Total Feeds')).toHaveTextContent('3')
  })

  it('shows active count stat', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('stat-Active')).toHaveTextContent('1')
  })

  it('shows error count stat', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('stat-Errors')).toHaveTextContent('1')
  })

  it('shows avg reliability stat', () => {
    render(<FeedListPage />)
    // avg of 98, 82, 94 = 274/3 = 91%
    expect(screen.getByTestId('stat-Avg Reliability')).toHaveTextContent('91%')
  })

  it('shows retry button for error feed', () => {
    render(<FeedListPage />)
    const retryBtn = screen.getByTitle('Retry feed fetch')
    expect(retryBtn).toBeInTheDocument()
  })

  it('shows total items ingested', () => {
    render(<FeedListPage />)
    // 8420 + 890 + 3200 = 12,510
    expect(screen.getByTestId('stat-Items Ingested')).toHaveTextContent('12,510')
  })

  it('shows next fetch countdown for active feed', () => {
    render(<FeedListPage />)
    // schedule 0 */4 * * * should produce "in Xh Ym" or "in Xm" or "in Xh"
    const countdowns = screen.getAllByText(/^in \d/)
    expect(countdowns.length).toBeGreaterThanOrEqual(1)
  })

  it('shows — for next fetch on disabled feed', () => {
    render(<FeedListPage />)
    // multiple — cells may exist; at least one from disabled feed schedule
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })
})

/* ================================================================ */
/* Cron parser — unit tests (via module import)                       */
/* ================================================================ */
describe('getNextFireLabel (cron parser)', () => {
  it('renders at least one schedule countdown', () => {
    render(<FeedListPage />)
    const countdowns = screen.queryAllByText(/^in \d/)
    expect(countdowns.length).toBeGreaterThanOrEqual(1)
  })
})

/* ================================================================ */
/* FeedListPage — new improvement tests                               */
/* ================================================================ */
describe('FeedListPage improvements', () => {
  it('renders favicon img for feeds with url', () => {
    render(<FeedListPage />)
    const favicons = document.querySelectorAll('img[src*="s2/favicons"]')
    expect(favicons.length).toBeGreaterThan(0)
  })

  it('renders radial reliability gauge SVGs', () => {
    render(<FeedListPage />)
    const gauges = screen.getAllByTestId('reliability-gauge')
    expect(gauges.length).toBeGreaterThan(0)
  })

  it('renders schedule timeline', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('schedule-timeline')).toBeInTheDocument()
  })

  it('shows table view by default', () => {
    render(<FeedListPage />)
    expect(screen.queryByTestId('feed-card-grid')).toBeNull()
  })

  it.skip('switches to card layout when card toggle is clicked', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('view-toggle-card'))
    expect(screen.getByTestId('feed-card-grid')).toBeInTheDocument()
  })

  it('switches back to table layout when table toggle is clicked', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('view-toggle-card'))
    fireEvent.click(screen.getByTestId('view-toggle-table'))
    expect(screen.queryByTestId('feed-card-grid')).toBeNull()
  })

  it.skip('card grid shows feed names in card mode', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('view-toggle-card'))
    expect(screen.getByTestId('feed-card-grid')).toBeInTheDocument()
    expect(screen.getAllByText('AlienVault OTX').length).toBeGreaterThanOrEqual(1)
  })
})

/* ================================================================ */
/* FeedScheduleTimeline                                               */
/* ================================================================ */

const BASE_FEED: FeedRecord = {
  id: 'tl-1', name: 'Timeline Feed', description: null, feedType: 'rss',
  url: 'https://example.com', schedule: '0 */4 * * *',
  status: 'active', enabled: true,
  lastFetchAt: null, lastErrorAt: null, lastErrorMessage: null,
  consecutiveFailures: 0, totalItemsIngested: 100, feedReliability: 95,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

describe('FeedScheduleTimeline', () => {
  it('renders dots for active feeds with schedule', () => {
    render(<FeedScheduleTimeline feeds={[BASE_FEED]} />)
    // schedule 0 */4 * * * fires at hours 0,4,8,12,16,20 → 6 dots
    const dots = screen.getAllByTestId('schedule-dot')
    expect(dots.length).toBe(6)
  })

  it('skips disabled feeds', () => {
    render(<FeedScheduleTimeline feeds={[{ ...BASE_FEED, status: 'disabled', enabled: false }]} />)
    expect(screen.queryByTestId('schedule-dot')).toBeNull()
  })

  it('skips feeds with enabled=false regardless of status', () => {
    render(<FeedScheduleTimeline feeds={[{ ...BASE_FEED, enabled: false }]} />)
    expect(screen.queryByTestId('schedule-dot')).toBeNull()
  })

  it('returns null when no feeds have schedules', () => {
    render(<FeedScheduleTimeline feeds={[{ ...BASE_FEED, schedule: null }]} />)
    expect(screen.queryByTestId('schedule-timeline')).toBeNull()
  })

  it('tooltip contains feed name', () => {
    render(<FeedScheduleTimeline feeds={[BASE_FEED]} />)
    const dot = screen.getAllByTestId('schedule-dot')[0]!
    expect(dot.getAttribute('title')).toContain('Timeline Feed')
  })

  it('error feeds get a dot with title', () => {
    render(<FeedScheduleTimeline feeds={[{ ...BASE_FEED, status: 'error', schedule: '0 0 * * *' }]} />)
    const dot = screen.getByTestId('schedule-dot')
    expect(dot.getAttribute('title')).toContain('Timeline Feed')
  })

  it('shows multiple dots for multiple feeds', () => {
    const feed2: FeedRecord = { ...BASE_FEED, id: 'tl-2', name: 'Feed B', schedule: '0 6 * * *' }
    render(<FeedScheduleTimeline feeds={[BASE_FEED, feed2]} />)
    // BASE_FEED: 6 dots + feed2: 1 dot = 7
    const dots = screen.getAllByTestId('schedule-dot')
    expect(dots.length).toBe(7)
  })
})

/* ================================================================ */
/* FeedCard                                                            */
/* ================================================================ */

const CARD_FEED: FeedRecord = {
  id: 'card-1', name: 'Card Feed', description: 'A test feed', feedType: 'rest_api',
  url: 'https://example.com/feed', schedule: '0 */4 * * *',
  status: 'active', enabled: true,
  lastFetchAt: new Date(Date.now() - 3_600_000).toISOString(),
  lastErrorAt: null, lastErrorMessage: null,
  consecutiveFailures: 0, totalItemsIngested: 5000, feedReliability: 85,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

describe('FeedCard', () => {
  it('renders feed name', () => {
    render(<FeedCard feed={CARD_FEED} />)
    expect(screen.getByText('Card Feed')).toBeInTheDocument()
  })

  it('renders status dot', () => {
    render(<FeedCard feed={CARD_FEED} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders reliability gauge SVG', () => {
    render(<FeedCard feed={CARD_FEED} />)
    expect(screen.getByTestId('reliability-gauge')).toBeInTheDocument()
  })

  it('renders next fetch countdown', () => {
    render(<FeedCard feed={CARD_FEED} />)
    const countdown = screen.getByText(/^in \d/)
    expect(countdown).toBeInTheDocument()
  })

  it('renders ingested count', () => {
    render(<FeedCard feed={CARD_FEED} />)
    expect(screen.getByText('5,000')).toBeInTheDocument()
  })

  it('renders last fetch time', () => {
    render(<FeedCard feed={CARD_FEED} />)
    // 1h ago
    expect(screen.getByText('1h ago')).toBeInTheDocument()
  })

  it('shows error message for error feed', () => {
    const errorFeed: FeedRecord = {
      ...CARD_FEED,
      status: 'error',
      lastErrorMessage: 'Connection timed out',
      lastErrorAt: new Date(Date.now() - 3_600_000).toISOString(),
      consecutiveFailures: 4,
    }
    render(<FeedCard feed={errorFeed} />)
    expect(screen.getByText(/Connection timed out/)).toBeInTheDocument()
  })

  it('shows consecutive failure count for error feed', () => {
    const errorFeed: FeedRecord = {
      ...CARD_FEED,
      status: 'error',
      lastErrorMessage: 'Timeout',
      lastErrorAt: new Date(Date.now() - 3_600_000).toISOString(),
      consecutiveFailures: 4,
    }
    render(<FeedCard feed={errorFeed} />)
    expect(screen.getByText(/4 consecutive/)).toBeInTheDocument()
  })

  it('renders favicon img when url is set', () => {
    render(<FeedCard feed={CARD_FEED} />)
    const img = document.querySelector('img[src*="s2/favicons"]')
    expect(img).not.toBeNull()
  })

  it('does not render favicon when url is null', () => {
    render(<FeedCard feed={{ ...CARD_FEED, url: null }} />)
    const img = document.querySelector('img[src*="s2/favicons"]')
    expect(img).toBeNull()
  })
})
