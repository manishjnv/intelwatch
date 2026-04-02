/**
 * Tests for demo fallback behavior:
 * - Demo banner visibility on DashboardPage and IocListPage
 * - Hook isDemo flag toggling based on API state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'

/* ================================================================ */
/* Mocks — hooks return configurable isDemo flag                     */
/* ================================================================ */
const mockUseIOCs = vi.fn()
const mockUseIOCStats = vi.fn()
const mockUseDashboardStats = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: (...args: unknown[]) => mockUseIOCs(...args),
  useIOCStats: (...args: unknown[]) => mockUseIOCStats(...args),
  useIOCPivot: () => ({ data: { relatedIOCs: [], actors: [], malware: [], campaigns: [] }, isLoading: false }),
  useIOCTimeline: () => ({ data: [], isLoading: false }),
  useFeeds: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useActors: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useMalware: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useVulnerabilities: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useDashboardStats: (...args: unknown[]) => mockUseDashboardStats(...args),
  useUpdateIOCLifecycle: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: any) => {
    const state = {
      user: { displayName: 'Analyst', email: 'test@test.com' },
      tenant: { name: 'ACME Corp' },
      accessToken: 'mock-token',
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/theme-store', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })),
}))

vi.mock('@/hooks/use-auth', () => ({
  useLogout: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useEnrichmentStats: vi.fn(() => ({ data: { total: 1, enriched: 0, pending: 1, failed: 0 } })),
}))

vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: any) => <span data-testid="entity-chip">{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@etip/shared-ui/components/InlineHelp', () => ({ InlineHelp: () => null }))
vi.mock('@etip/shared-ui/components/SkeletonBlock', () => ({ SkeletonBlock: () => <div data-testid="skeleton" /> }))

// Dashboard widget + mode mocks
vi.mock('@/hooks/use-dashboard-mode', () => ({
  useDashboardMode: () => ({ mode: 'global', profile: null }),
}))
vi.mock('@/components/widgets/ThreatLandscapeBanner', () => ({ ThreatLandscapeBanner: () => null }))
vi.mock('@/components/widgets/RecentIocWidget', () => ({ RecentIocWidget: () => null }))
vi.mock('@/components/widgets/IocTrendWidget', () => ({ IocTrendWidget: () => null }))
vi.mock('@/components/widgets/FeedHealthWidget', () => ({ FeedHealthWidget: () => null }))
vi.mock('@/components/widgets/TopActorsWidget', () => ({ TopActorsWidget: () => null }))
vi.mock('@/components/widgets/TopCvesWidget', () => ({ TopCvesWidget: () => null }))
vi.mock('@/components/widgets/RecentAlertsWidget', () => ({ RecentAlertsWidget: () => null }))
vi.mock('@/components/widgets/SeverityTrendWidget', () => ({ SeverityTrendWidget: () => null }))
vi.mock('@/components/widgets/ProfileMatchWidget', () => ({ ProfileMatchWidget: () => null }))
vi.mock('@/components/widgets/GeoThreatWidget', () => ({ GeoThreatWidget: () => null }))

import { DashboardPage } from '@/pages/DashboardPage'
import { IocListPage } from '@/pages/IocListPage'

/* ================================================================ */
/* Shared mock data                                                   */
/* ================================================================ */
const LIVE_IOCS = {
  data: [
    {
      id: 'real-1', normalizedValue: '10.0.0.1', iocType: 'ip', severity: 'high',
      confidence: 80, lifecycle: 'active', tlp: 'amber', tags: ['live'],
      firstSeen: '2026-03-20', lastSeen: '2026-03-21', threatActors: [], malwareFamilies: [],
    },
  ],
  total: 1, page: 1, limit: 50,
}

const LIVE_STATS = {
  total: 301,
  byType: { ip: 50, domain: 80 },
  bySeverity: { critical: 10, high: 40, medium: 200, low: 46, info: 5 },
  byLifecycle: { new: 285, active: 16 },
}

const LIVE_DASHBOARD = {
  totalIOCs: 301, criticalIOCs: 10, activeFeeds: 3, enrichedToday: 19, lastIngestTime: '5m ago',
}

/* ================================================================ */
/* DashboardPage banner tests                                         */
/* ================================================================ */
describe('DashboardPage demo banner', () => {
  beforeEach(() => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: false })
    mockUseIOCStats.mockReturnValue({ data: LIVE_STATS, isDemo: false })
  })

  it('does not show demo banner (demo fallbacks removed)', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD, isDemo: true })
    render(<DashboardPage />)
    expect(screen.queryByText('Demo data — connect backend for live intel')).not.toBeInTheDocument()
  })

  it('hides demo banner when useDashboardStats returns isDemo=false', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD, isDemo: false })
    render(<DashboardPage />)
    expect(screen.queryByText('Demo data — connect backend for live intel')).not.toBeInTheDocument()
  })

  it('hides demo banner when isDemo is undefined (existing mock compat)', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD })
    render(<DashboardPage />)
    expect(screen.queryByText('Demo data — connect backend for live intel')).not.toBeInTheDocument()
  })

  it('does not render demo badge (demo fallbacks removed)', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD, isDemo: true })
    render(<DashboardPage />)
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('renders heatmap even in demo mode', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD, isDemo: true })
    mockUseIOCStats.mockReturnValue({ data: LIVE_STATS, isDemo: true })
    render(<DashboardPage />)
    // SeverityHeatmap renders if stats have data
    expect(screen.getByTestId('severity-heatmap')).toBeInTheDocument()
  })

  it('renders timeline in demo mode', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD, isDemo: true })
    render(<DashboardPage />)
    expect(screen.getByTestId('threat-timeline')).toBeInTheDocument()
  })

  it('renders welcome header with user name', () => {
    mockUseDashboardStats.mockReturnValue({
      data: { totalIOCs: 25, criticalIOCs: 5, activeFeeds: 4, enrichedToday: 12, lastIngestTime: 'Demo' },
      isDemo: true,
    })
    render(<DashboardPage />)
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument()
  })
})

/* ================================================================ */
/* IocListPage banner tests                                           */
/* ================================================================ */
describe('IocListPage demo banner', () => {
  beforeEach(() => {
    mockUseIOCStats.mockReturnValue({ data: LIVE_STATS, isDemo: false })
  })

  it('does not show demo banner (demo fallbacks removed)', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.queryByText('Demo data — connect backend for live intel')).not.toBeInTheDocument()
  })

  it('hides demo banner when useIOCs returns isDemo=false', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: false })
    render(<IocListPage />)
    expect(screen.queryByText('Demo data — connect backend for live intel')).not.toBeInTheDocument()
  })

  it('hides demo banner when isDemo is undefined', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false })
    render(<IocListPage />)
    expect(screen.queryByText('Demo data — connect backend for live intel')).not.toBeInTheDocument()
  })

  it('renders table rows even in demo mode', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.getByTestId('entity-chip')).toBeInTheDocument()
  })

  it('renders enrichment status column in demo mode', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders entity preview triggers in demo mode', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.getAllByTestId('entity-preview-trigger').length).toBeGreaterThanOrEqual(1)
  })

  it('renders split pane in demo mode', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.getByTestId('split-pane')).toBeInTheDocument()
  })

  it('does not render demo text (demo fallbacks removed)', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.queryByText('Demo data — connect backend for live intel')).not.toBeInTheDocument()
  })
})
