/**
 * @module __tests__/ioc-tier1.test
 * @description S139 Tier 1 tests: IocStatsCards, Enrichment Status column, Corroboration badge.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock data ───────────────────────────────────────────────────

const MOCK_IOC_STATS = {
  total: 880,
  byType: { ip: 320, domain: 210, hash_sha256: 140, url: 95, cve: 65, email: 50 },
  bySeverity: { critical: 42, high: 185, medium: 340, low: 263, info: 50 },
  byLifecycle: { new: 120, active: 480, aging: 180, expired: 100 },
}

const MOCK_ENRICHMENT_STATS = {
  total: 880, enriched: 660, pending: 170, failed: 50,
  enrichedToday: 45, avgQualityScore: 78, cacheHitRate: 0.62,
}

const MOCK_IOCS = [
  {
    id: 'ioc-1', iocType: 'ip', normalizedValue: '185.220.101.34', severity: 'critical',
    confidence: 92, lifecycle: 'active', tlp: 'red', tags: ['apt', 'c2'],
    threatActors: ['APT28'], malwareFamilies: ['Sofacy'],
    firstSeen: '2026-04-01T10:00:00Z', lastSeen: '2026-04-02T08:00:00Z',
    corroborationCount: 5, aiConfidence: 88, feedReliability: 85,
  },
  {
    id: 'ioc-2', iocType: 'domain', normalizedValue: 'evil-payload.xyz', severity: 'high',
    confidence: 75, lifecycle: 'active', tlp: 'amber', tags: ['phishing'],
    threatActors: [], malwareFamilies: [],
    firstSeen: '2026-03-30T14:00:00Z', lastSeen: '2026-04-01T12:00:00Z',
    corroborationCount: 2, aiConfidence: 72,
  },
  {
    id: 'ioc-3', iocType: 'hash_sha256', normalizedValue: 'a1b2c3d4e5f6', severity: 'medium',
    confidence: 55, lifecycle: 'new', tlp: 'green', tags: [],
    threatActors: [], malwareFamilies: [],
    firstSeen: '2026-04-02T06:00:00Z', lastSeen: '2026-04-02T06:00:00Z',
    corroborationCount: 1,
    // aiConfidence undefined → pending enrichment
  },
  {
    id: 'ioc-4', iocType: 'url', normalizedValue: 'https://phish.example/login', severity: 'low',
    confidence: 40, lifecycle: 'aging', tlp: 'white', tags: [],
    threatActors: [], malwareFamilies: [],
    firstSeen: '2026-03-01T00:00:00Z', lastSeen: '2026-03-15T00:00:00Z',
    // corroborationCount undefined → no badge
    // aiConfidence undefined → pending
  },
]

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: () => ({ data: { data: MOCK_IOCS, total: MOCK_IOCS.length, page: 1, limit: 50 }, isLoading: false, isDemo: false }),
  useIOCStats: () => ({ data: MOCK_IOC_STATS }),
  useUpdateIOCLifecycle: () => ({ mutate: vi.fn() }),
  useDashboardStats: () => ({ data: { totalIOCs: 880, activeFeeds: 12, criticalIOCs: 42, enrichedToday: 45 } }),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useEnrichmentStats: () => ({ data: MOCK_ENRICHMENT_STATS }),
}))

vi.mock('@/hooks/use-campaigns', () => ({
  useCampaigns: () => ({ data: { data: [] } }),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: string) => v,
}))

vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: { value: string }) => <span data-testid="entity-chip">{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@/components/viz/EntityPreview', () => ({
  EntityPreview: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left }: { left: React.ReactNode }) => <div data-testid="split-pane">{left}</div>,
}))

vi.mock('@/hooks/use-multi-select', () => ({
  useMultiSelect: () => ({ selectedIds: new Set(), toggle: vi.fn(), selectAllOnPage: vi.fn(), clear: vi.fn(), isSelected: () => false, selectAllState: () => false }),
}))

vi.mock('@/hooks/use-filter-presets', () => ({
  useFilterPresets: () => ({ presets: [], savePreset: vi.fn(), deletePreset: vi.fn() }),
}))

vi.mock('@/components/viz/QuickActionToolbar', () => ({
  QuickActionToolbar: () => null,
}))

vi.mock('@/components/ioc/CreateIocModal', () => ({
  CreateIocModal: () => null,
}))

vi.mock('@/components/ioc/IocContextMenu', () => ({
  IocContextMenu: () => null,
}))

vi.mock('@/components/ioc/SavedFilterPresets', () => ({
  SavedFilterPresets: () => null,
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => null,
}))

vi.mock('@/components/data/FilterBar', () => ({
  FilterBar: ({ children }: { children?: React.ReactNode }) => <div data-testid="filter-bar">{children}</div>,
}))

vi.mock('@/components/data/DataTable', () => ({
  DataTable: ({ data, columns }: { data: unknown[]; columns: { key: string; label: string; render: (row: unknown, d: string) => React.ReactNode }[] }) => (
    <table data-testid="ioc-data-table">
      <thead>
        <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((row: any, i: number) => (
          <tr key={i} data-testid={`ioc-row-${row.id}`}>
            {columns.map(c => <td key={c.key}>{c.render(row, 'compact')}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}))

vi.mock('@/components/data/TableSkeleton', () => ({
  TableSkeleton: () => <div data-testid="table-skeleton" />,
}))

vi.mock('@/components/data/Pagination', () => ({
  Pagination: () => <div data-testid="pagination" />,
}))

vi.mock('./IocDetailPanel', () => ({
  IocDetailPanel: () => <div data-testid="ioc-detail-panel" />,
}))

vi.mock('@/components/campaigns/CampaignPanel', () => ({
  CampaignPanel: () => null,
}))

// ─── Import after mocks ─────────────────────────────────────────

import { IocListPage } from '@/pages/IocListPage'
import { IocStatsCards } from '@/components/ioc/IocStatsCards'

// ─── Stats Cards Tests ───────────────────────────────────────────

describe('IocStatsCards', () => {
  it('renders all 6 stat cards', () => {
    render(<IocStatsCards stats={MOCK_IOC_STATS} enrichmentStats={MOCK_ENRICHMENT_STATS} feedCount={12} />)
    expect(screen.getByTestId('stat-total')).toBeInTheDocument()
    expect(screen.getByTestId('stat-by-type')).toBeInTheDocument()
    expect(screen.getByTestId('stat-severity')).toBeInTheDocument()
    expect(screen.getByTestId('stat-lifecycle')).toBeInTheDocument()
    expect(screen.getByTestId('stat-sources')).toBeInTheDocument()
    expect(screen.getByTestId('stat-enrichment')).toBeInTheDocument()
  })

  it('displays total IOC count formatted', () => {
    render(<IocStatsCards stats={MOCK_IOC_STATS} enrichmentStats={MOCK_ENRICHMENT_STATS} />)
    expect(screen.getByTestId('stat-total')).toHaveTextContent('880')
  })

  it('shows enrichment coverage percentage', () => {
    render(<IocStatsCards stats={MOCK_IOC_STATS} enrichmentStats={MOCK_ENRICHMENT_STATS} />)
    // 660/880 = 75%
    expect(screen.getByTestId('stat-enrichment')).toHaveTextContent('75%')
  })

  it('shows severity breakdown counts', () => {
    render(<IocStatsCards stats={MOCK_IOC_STATS} enrichmentStats={null} />)
    const sevCard = screen.getByTestId('stat-severity')
    expect(sevCard).toHaveTextContent('42 critical')
    expect(sevCard).toHaveTextContent('185 high')
  })

  it('shows lifecycle pills', () => {
    render(<IocStatsCards stats={MOCK_IOC_STATS} enrichmentStats={null} />)
    const lcCard = screen.getByTestId('stat-lifecycle')
    expect(lcCard).toHaveTextContent('120 new')
    expect(lcCard).toHaveTextContent('480 active')
  })

  it('collapses and expands on toggle click', () => {
    render(<IocStatsCards stats={MOCK_IOC_STATS} enrichmentStats={null} />)
    expect(screen.getByTestId('stat-total')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('ioc-stats-toggle'))
    expect(screen.queryByTestId('stat-total')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('ioc-stats-toggle'))
    expect(screen.getByTestId('stat-total')).toBeInTheDocument()
  })

  it('handles null stats gracefully', () => {
    render(<IocStatsCards stats={null} enrichmentStats={null} />)
    expect(screen.getByTestId('stat-total')).toHaveTextContent('0')
    expect(screen.getByTestId('stat-enrichment')).toHaveTextContent('0%')
  })
})

// ─── IocListPage Integration Tests ───────────────────────────────

describe('IocListPage — Tier 1 enhancements', () => {
  it('renders stats cards section', () => {
    render(<IocListPage />)
    expect(screen.getByTestId('ioc-stats-cards')).toBeInTheDocument()
  })

  it('renders enrichment column with correct badges', () => {
    render(<IocListPage />)
    // ioc-1 has aiConfidence → enriched
    const row1 = screen.getByTestId('ioc-row-ioc-1')
    expect(row1).toHaveTextContent('Enriched')
    // ioc-3 has no aiConfidence → pending
    const row3 = screen.getByTestId('ioc-row-ioc-3')
    expect(row3).toHaveTextContent('Pending')
  })

  it('renders corroboration badge for IOCs with count > 1', () => {
    render(<IocListPage />)
    // ioc-1 has corroborationCount=5
    const row1 = screen.getByTestId('ioc-row-ioc-1')
    expect(row1).toHaveTextContent('×5')
    // ioc-3 has corroborationCount=1 → no badge
    const row3 = screen.getByTestId('ioc-row-ioc-3')
    expect(row3).not.toHaveTextContent('×1')
  })

  it('does not show corroboration badge when count is 0 or undefined', () => {
    render(<IocListPage />)
    const row4 = screen.getByTestId('ioc-row-ioc-4')
    // ioc-4 has no corroborationCount → no badge
    expect(row4.querySelector('[data-testid="corroboration-badge"]')).not.toBeInTheDocument()
  })

  it('has enrichment and corroboration column headers', () => {
    render(<IocListPage />)
    const table = screen.getByTestId('ioc-data-table')
    expect(table).toHaveTextContent('Enriched')
    expect(table).toHaveTextContent('Corrob.')
  })
})
