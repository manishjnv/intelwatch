import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Shared mocks ──────────────────────────────────────────────

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: () => ({
    data: { data: [{ id: 'ioc1', iocType: 'ip', normalizedValue: '10.0.0.1', severity: 'critical', confidence: 85, lifecycle: 'active', tlp: 'amber', tags: [], threatActors: [], malwareFamilies: [], firstSeen: '2025-03-01', lastSeen: '2025-03-20', campaignId: 'camp-1' }], total: 1, page: 1, limit: 50 },
    isLoading: false, isDemo: false,
  }),
  useIOCStats: () => ({ data: { total: 100, byType: {}, bySeverity: { critical: 5 }, byLifecycle: { active: 50, new: 10 } }, isDemo: false }),
  useActors: () => ({
    data: { data: [{ id: 'a1', name: 'APT29', aliases: [], actorType: 'nation_state', motivation: 'espionage', sophistication: 'expert', country: 'Russia', confidence: 85, tlp: 'amber', tags: [], active: true, firstSeen: null, lastSeen: null, mitreTechniques: ['T1190'] }], total: 1, page: 1, limit: 50 },
    isLoading: false, isDemo: false,
  }),
  useActorDetail: () => ({ data: { mitreTechniques: ['T1190'] } }),
  useMalware: () => ({
    data: { data: [{ id: 'm1', name: 'Emotet', aliases: [], malwareType: 'trojan', platforms: ['Windows'], capabilities: ['keylogging'], confidence: 75, tlp: 'amber', tags: [], active: true, firstSeen: null, lastSeen: null }], total: 1, page: 1, limit: 50 },
    isLoading: false, isDemo: false,
  }),
  useDashboardStats: () => ({ data: { totalIOCs: 100, criticalIOCs: 5, activeFeeds: 10, enrichedToday: 50 }, isDemo: false }),
}))

vi.mock('@/hooks/use-campaigns', () => ({
  useCampaigns: () => ({
    data: { data: [{ id: 'camp-1', name: 'APT29 Campaign', status: 'active', severity: 'critical', confidence: 85, firstSeen: '2024-12-01', lastSeen: '2025-03-15', iocCount: 47, iocTypes: { ip: 12 }, actors: ['APT29'], malwareFamilies: [], techniques: ['T1190'] }], total: 1 },
    isLoading: false, isDemo: false,
  }),
  useCampaignsForIoc: () => ({ data: [{ id: 'camp-1', name: 'APT29 Campaign' }], isLoading: false }),
}))

vi.mock('@/hooks/use-linked-iocs', () => ({
  useLinkedIocs: () => ({
    iocs: [{ id: 'li1', iocType: 'ip', normalizedValue: '1.2.3.4', severity: 'high' }],
    totalCount: 1, filteredCount: 1, isLoading: false, isDemo: true,
    typeFilter: 'all', setTypeFilter: vi.fn(), sevFilter: 'all', setSevFilter: vi.fn(),
    sortKey: 'confidence', setSortKey: vi.fn(), hasMore: false, loadMore: vi.fn(),
    typeBreakdown: { ip: 1 }, sevBreakdown: { high: 1 },
  }),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (v: any) => v }))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: any) => (
    <div data-testid="split-pane">
      <div data-testid="split-left">{left}</div>
      {showRight && <div data-testid="split-right">{right}</div>}
    </div>
  ),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: any) => <div data-testid="page-stats-bar">{title}{children}</div>,
  CompactStat: ({ value }: any) => <span>{value}</span>,
}))

vi.mock('@/hooks/use-analytics-dashboard', () => ({
  useAnalyticsDashboard: () => ({
    summary: { totalIocs: 100, totalArticles: 500, totalFeeds: 10, totalAlerts: 5, avgConfidence: 72, pipelineThroughput: 50 },
    iocByType: { ip: 50, domain: 30 }, feedHealth: [], costStats: { totalCostUsd: 0.5, costPerArticle: 0.001, costPerIoc: 0.01 },
    dateRange: { preset: '7d' }, isDemo: false, isLoading: false, isFetching: false,
    dataUpdatedAt: Date.now(), refetch: vi.fn(), setPreset: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-analytics-data', () => ({
  useExecutiveSummary: () => ({ data: { riskScore: 72, riskPosture: 'medium' } }),
  useServiceHealth: () => ({ data: [] }),
}))

vi.mock('@/components/analytics/ExecutiveSummary', () => ({
  ExecutiveSummary: () => <div data-testid="executive-summary">Summary</div>,
}))

// IocListPage dependencies
vi.mock('@/pages/IocDetailPanel', () => ({
  IocDetailPanel: () => <div data-testid="ioc-detail-panel">Detail</div>,
}))
vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => null,
}))
vi.mock('@/components/viz/QuickActionToolbar', () => ({
  QuickActionToolbar: () => null,
}))
vi.mock('@/components/viz/SparklineCell', () => ({
  SparklineCell: () => <span>~</span>,
  generateStubTrend: () => [1, 2, 3],
}))
vi.mock('@/components/viz/EntityPreview', () => ({
  EntityPreview: ({ children }: any) => children,
}))
vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: any) => <span>{value}</span>,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span>{severity}</span>,
}))
vi.mock('@/components/analytics/TrendCharts', () => ({
  TrendCharts: () => <div data-testid="trend-charts">Trends</div>,
}))
vi.mock('@/components/analytics/IntelligenceBreakdown', () => ({
  IntelligenceBreakdown: () => <div data-testid="intel-breakdown">Breakdown</div>,
}))

// ─── Tests ──────────────────────────────────────────────────────

import { IocListPage } from '@/pages/IocListPage'
import { ThreatActorListPage } from '@/pages/ThreatActorListPage'
import { MalwareListPage } from '@/pages/MalwareListPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'

describe('P3 Integration', () => {
  it('IocListPage campaign column renders badge', () => {
    render(<IocListPage />)
    const badge = screen.getByTestId('campaign-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('APT29 Campai')
  })

  it('ThreatActorPage has both ATT&CK + Linked IOCs sections', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT29'))
    expect(screen.getByTestId('mitre-section')).toBeInTheDocument()
    expect(screen.getByTestId('actor-ioc-section')).toBeInTheDocument()
  })

  it('MalwarePage has Linked IOCs section', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('Emotet'))
    expect(screen.getByTestId('malware-ioc-section')).toBeInTheDocument()
  })

  it('AnalyticsPage has staleness indicator', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('staleness-indicator')).toBeInTheDocument()
  })

  it('all new sections render in demo fallback mode', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT29'))
    const cells = screen.getAllByTestId('technique-cell')
    expect(cells.length).toBeGreaterThan(0)
    expect(screen.getByTestId('linked-iocs-section')).toBeInTheDocument()
  })
})
