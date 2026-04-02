/**
 * Tests for DashboardPage — Global Pipeline widget (DECISION-029 Phase E):
 * - Widget renders when pipeline health available
 * - Shows correct stats
 * - Status dot reflects pipeline health
 * - Click navigates to /global-monitoring
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@/test/test-utils'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as any
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: any) => sel({
    user: { displayName: 'Admin', role: 'super_admin' },
    tenant: { name: 'ACME' },
    accessToken: 'tok',
  })),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })) }))
vi.mock('@/hooks/use-auth', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn() })) }))

const MOCK_PIPELINE_HEALTH = {
  queues: [{ name: 'rss', waiting: 3, active: 1, completed: 100, failed: 2, delayed: 0 }],
  pipeline: { articlesProcessed24h: 1240, iocsCreated24h: 580, iocsEnriched24h: 420, avgNormalizeLatencyMs: 320, avgEnrichLatencyMs: 1450 },
}

vi.mock('@/hooks/use-intel-data', () => ({
  useDashboardStats: vi.fn(() => ({
    data: { totalIOCs: 100, activeFeeds: 5, enrichedToday: 20, criticalIOCs: 3, lastIngestTime: 'now' },
    isDemo: false,
  })),
  useIOCs: vi.fn(() => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isDemo: true })),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useCostStats: vi.fn(() => ({ data: { headline: '$0.42 today' } })),
  useEnrichmentStats: vi.fn(() => ({ data: { avgQualityScore: 75, pending: 10 } })),
  useEnrichmentQuality: vi.fn(() => ({ data: null })),
  useEnrichmentSourceBreakdown: vi.fn(() => ({ data: null, isDemo: false })),
  useAiCostSummary: vi.fn(() => ({ data: null, isDemo: false })),
}))

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalPipelineHealth: vi.fn(() => ({
    data: MOCK_PIPELINE_HEALTH,
    isLoading: false,
    isDemo: false,
  })),
}))

// Mock shared-ui locked components
vi.mock('@etip/shared-ui/components/IntelCard', () => ({
  IntelCard: ({ children, ...props }: any) => <div data-testid="intel-card" {...props}>{children}</div>,
}))
vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: any) => <span>{label}: {value}</span>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => null,
}))
vi.mock('@etip/shared-ui/components/InlineHelp', () => ({
  InlineHelp: () => null,
}))

// Viz mocks
vi.mock('@/components/viz/SeverityHeatmap', () => ({ SeverityHeatmap: () => null }))
vi.mock('@/components/viz/ParallaxCard', () => ({ ParallaxCard: ({ children }: any) => <div>{children}</div> }))
vi.mock('@/components/viz/ThreatTimeline', () => ({ ThreatTimeline: () => null }))
vi.mock('@/components/viz/AmbientBackground', () => ({ AmbientBackground: () => null }))

import { DashboardPage } from '@/pages/DashboardPage'

describe('DashboardPage — Global Pipeline Widget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Global Pipeline widget', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('global-pipeline-widget')).toBeTruthy()
    expect(screen.getByText('Global Pipeline')).toBeTruthy()
  })

  it('shows correct stats from pipeline health', () => {
    render(<DashboardPage />)
    const widget = within(screen.getByTestId('global-pipeline-widget'))
    expect(widget.getByText('1,240')).toBeTruthy()
    expect(widget.getByText('580')).toBeTruthy()
    expect(widget.getByText('420')).toBeTruthy()
  })

  it('clicking widget navigates to /global-monitoring', () => {
    render(<DashboardPage />)
    fireEvent.click(screen.getByTestId('global-pipeline-widget'))
    expect(mockNavigate).toHaveBeenCalledWith('/global-monitoring')
  })

  it('status dot renders green when pipeline active', () => {
    render(<DashboardPage />)
    const widget = screen.getByTestId('global-pipeline-widget')
    const dot = widget.querySelector('.bg-sev-low')
    expect(dot).toBeTruthy()
  })
})
