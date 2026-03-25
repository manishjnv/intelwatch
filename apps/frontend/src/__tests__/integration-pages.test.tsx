/**
 * Integration tests for page-level component wiring:
 * - DashboardPage integrations (#2, #13, #14, #15)
 * - IocListPage integrations (#3, #6, #7, #8, #9, #10)
 * - DashboardLayout integration (#1)
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

// Mock all data hooks
vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: vi.fn(() => ({
    data: {
      data: [
        {
          id: 'ioc-1', normalizedValue: '1.2.3.4', iocType: 'ip', severity: 'critical',
          confidence: 85, lifecycle: 'active', tlp: 'amber', tags: ['botnet'],
          firstSeen: '2026-03-20', lastSeen: '2026-03-21', threatActors: ['APT28'], malwareFamilies: ['Emotet'],
        },
        {
          id: 'ioc-2', normalizedValue: 'evil.com', iocType: 'domain', severity: 'high',
          confidence: 70, lifecycle: 'new', tlp: 'green', tags: [],
          firstSeen: '2026-03-21', lastSeen: '2026-03-21', threatActors: [], malwareFamilies: [],
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
    },
    isLoading: false,
  })),
  useIOCStats: vi.fn(() => ({
    data: {
      total: 301,
      byType: { ip: 50, domain: 80, url: 40, hash_sha256: 30, cve: 90, email: 11 },
      bySeverity: { critical: 10, high: 40, medium: 200, low: 46, info: 5 },
      byLifecycle: { new: 285, active: 16 },
    },
  })),
  useIOCPivot: vi.fn(() => ({ data: { relatedIOCs: [], actors: [], malware: [], campaigns: [] }, isLoading: false })),
  useIOCTimeline: vi.fn(() => ({ data: [], isLoading: false })),
  useFeeds: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useActors: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useMalware: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useVulnerabilities: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useDashboardStats: vi.fn(() => ({
    data: { totalIOCs: 301, criticalIOCs: 10, activeFeeds: 3, enrichedToday: 19, lastIngestTime: '5m ago' },
  })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

// Mock auth/theme stores
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

// We need to mock modules config to avoid importing all module icons
vi.mock('@/config/modules', () => ({
  MODULES: [
    { id: 'ioc', title: 'IOC Intelligence', route: '/iocs', phase: 3, color: 'text-blue-400', icon: () => null, description: 'IOC module', helpText: 'Help' },
  ],
  getPhaseColor: () => 'text-blue-400',
  getPhaseBgColor: () => 'bg-blue-500/10',
}))

vi.mock('@/components/brand/ModuleIcons', () => ({
  IconDashboard: () => null,
}))

vi.mock('@/components/brand/LogoMark', () => ({
  LogoMark: () => <div data-testid="logo" />,
}))

// Mock shared-ui locked components as simple divs
vi.mock('@etip/shared-ui/components/TopStatsBar', () => ({
  TopStatsBar: (props: any) => <div data-testid="top-stats-bar" {...props} />,
}))

vi.mock('@etip/shared-ui/components/GlobalSearch', () => ({
  GlobalSearch: () => null,
  useGlobalSearch: () => ({ open: false, setOpen: vi.fn() }),
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

vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => null,
}))

vi.mock('@etip/shared-ui/components/InlineHelp', () => ({
  InlineHelp: () => null,
}))

vi.mock('@etip/shared-ui/components/SkeletonBlock', () => ({
  SkeletonBlock: () => <div data-testid="skeleton" />,
}))

import { IocListPage } from '@/pages/IocListPage'

/* ================================================================ */
/* IocListPage Integration                                           */
/* ================================================================ */
describe('IocListPage integration', () => {
  it('renders page with all integrated components', () => {
    render(<IocListPage />)
    // Stats merged inline with FilterBar
    expect(screen.getByPlaceholderText(/Search IOCs/)).toBeInTheDocument()
  })

  it('renders SplitPane container', () => {
    render(<IocListPage />)
    expect(screen.getByTestId('split-pane')).toBeInTheDocument()
  })

  it('renders sparkline cells in table', () => {
    render(<IocListPage />)
    const sparklines = screen.getAllByTestId('sparkline')
    expect(sparklines.length).toBeGreaterThanOrEqual(1)
  })

  it('renders entity preview triggers wrapping EntityChip', () => {
    render(<IocListPage />)
    const triggers = screen.getAllByTestId('entity-preview-trigger')
    expect(triggers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders EntityChip values from mock data', () => {
    render(<IocListPage />)
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
    expect(screen.getByText('evil.com')).toBeInTheDocument()
  })

  it('quick action toolbar is hidden initially (no selection)', () => {
    render(<IocListPage />)
    expect(screen.queryByTestId('quick-action-toolbar')).not.toBeInTheDocument()
  })

  it('renders inline stats in filter bar', () => {
    render(<IocListPage />)
    expect(screen.getByText(/Critical/)).toBeInTheDocument()
    expect(screen.getByText(/Active/)).toBeInTheDocument()
  })

  it('shows Trend column header', () => {
    render(<IocListPage />)
    expect(screen.getByText('Trend')).toBeInTheDocument()
  })

  it('renders severity badges', () => {
    render(<IocListPage />)
    const badges = screen.getAllByTestId('severity-badge')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders pagination controls', () => {
    render(<IocListPage />)
    // Pagination component renders page info text "1 / X"
    expect(screen.getByText(/1 \//)).toBeInTheDocument()
  })

  it('renders correct number of IOC rows', () => {
    render(<IocListPage />)
    const chips = screen.getAllByTestId('entity-chip')
    expect(chips).toHaveLength(2) // 2 mock IOCs
  })

  it('renders lifecycle status badges', () => {
    render(<IocListPage />)
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('new')).toBeInTheDocument()
  })

  it('renders TLP values', () => {
    render(<IocListPage />)
    expect(screen.getByText('amber')).toBeInTheDocument()
    expect(screen.getByText('green')).toBeInTheDocument()
  })

  it('renders confidence gauge for non-ultra-dense mode', () => {
    const { container } = render(<IocListPage />)
    // Confidence gauge renders as SVG with text
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })
})
