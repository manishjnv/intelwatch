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
  useFeeds: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useActors: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useMalware: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useVulnerabilities: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useDashboardStats: (...args: unknown[]) => mockUseDashboardStats(...args),
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

vi.mock('@/config/modules', () => ({
  MODULES: [
    { id: 'ioc', title: 'IOC Intelligence', route: '/iocs', phase: 3, color: 'text-blue-400', icon: () => null, description: 'Test module', helpText: 'Help' },
  ],
  getPhaseColor: () => 'text-blue-400',
  getPhaseBgColor: () => 'bg-blue-500/10',
}))

vi.mock('@etip/shared-ui/components/IntelCard', () => ({
  IntelCard: ({ children, ...props }: any) => <div data-testid="intel-card" {...props}>{children}</div>,
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label }: any) => <span data-testid={`stat-${label}`}>{label}</span>,
}))

vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: any) => <span data-testid="entity-chip">{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({ TooltipHelp: () => null }))
vi.mock('@etip/shared-ui/components/InlineHelp', () => ({ InlineHelp: () => null }))
vi.mock('@etip/shared-ui/components/SkeletonBlock', () => ({ SkeletonBlock: () => <div data-testid="skeleton" /> }))

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

  it('shows demo banner when useDashboardStats returns isDemo=true', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD, isDemo: true })
    render(<DashboardPage />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByText('Demo data — connect backend for live intel')).toBeInTheDocument()
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

  it('demo banner uses accent color token (not hardcoded)', () => {
    mockUseDashboardStats.mockReturnValue({ data: LIVE_DASHBOARD, isDemo: true })
    const { container } = render(<DashboardPage />)
    const badge = container.querySelector('.bg-accent\\/10')
    expect(badge).toBeInTheDocument()
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

  it('stats bar shows values from demo dashboard stats', () => {
    mockUseDashboardStats.mockReturnValue({
      data: { totalIOCs: 25, criticalIOCs: 5, activeFeeds: 4, enrichedToday: 12, lastIngestTime: 'Demo' },
      isDemo: true,
    })
    render(<DashboardPage />)
    expect(screen.getByTestId('stat-Total IOCs')).toBeInTheDocument()
    expect(screen.getByTestId('stat-Critical IOCs')).toBeInTheDocument()
  })
})

/* ================================================================ */
/* IocListPage banner tests                                           */
/* ================================================================ */
describe('IocListPage demo banner', () => {
  beforeEach(() => {
    mockUseIOCStats.mockReturnValue({ data: LIVE_STATS, isDemo: false })
  })

  it('shows demo banner when useIOCs returns isDemo=true', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByText('Demo data — connect backend for live intel')).toBeInTheDocument()
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

  it('renders sparklines in demo mode', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    expect(screen.getAllByTestId('sparkline').length).toBeGreaterThanOrEqual(1)
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

  it('demo banner has accessible text for screen readers', () => {
    mockUseIOCs.mockReturnValue({ data: LIVE_IOCS, isLoading: false, isDemo: true })
    render(<IocListPage />)
    const banner = screen.getByText('Demo data — connect backend for live intel')
    expect(banner).toBeVisible()
  })
})
