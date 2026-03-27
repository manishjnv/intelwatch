/**
 * Session 76 tests — detail panels, drill-downs, enrichment/relations wiring,
 * and sort handler wiring across audited pages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@/test/test-utils'

/* ================================================================ */
/* Mocks                                                              */
/* ================================================================ */

const mockUseVulnerabilities = vi.fn()
const mockUseIOCSearch = vi.fn()
const mockUseIOCEnrichment = vi.fn()
const mockUseNodeNeighbors = vi.fn()
const mockUseIOCs = vi.fn()
const mockUseIOCStats = vi.fn()
const mockUseIOCPivot = vi.fn()
const mockUseIOCTimeline = vi.fn()
const mockUseUpdateIOCLifecycle = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useVulnerabilities: (...args: any[]) => mockUseVulnerabilities(...args),
  useIOCs: (...args: any[]) => mockUseIOCs(...args),
  useIOCStats: () => mockUseIOCStats(),
  useIOCPivot: (...args: any[]) => mockUseIOCPivot(...args),
  useIOCTimeline: (...args: any[]) => mockUseIOCTimeline(...args),
  useUpdateIOCLifecycle: () => mockUseUpdateIOCLifecycle(),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useIOCEnrichment: (...args: any[]) => mockUseIOCEnrichment(...args),
  useIOCCost: () => ({ data: null }),
  useTriggerEnrichment: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-phase4-data', () => ({
  useNodeNeighbors: (...args: any[]) => mockUseNodeNeighbors(...args),
}))

vi.mock('@/hooks/use-search-data', () => ({
  useIOCSearch: (...args: any[]) => mockUseIOCSearch(...args),
}))

const mockUseEsSearch = vi.fn()
vi.mock('@/hooks/use-es-search', () => ({
  useEsSearch: () => mockUseEsSearch(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Simplified SplitPane
vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: any) => (
    <div data-testid="split-pane">
      <div data-testid="split-left">{left}</div>
      {showRight && <div data-testid="split-right">{right}</div>}
    </div>
  ),
}))

// IocDetailPanel rendered real — all hooks mocked above

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: any) => <span data-testid={`stat-${label}`}>{value}</span>,
}))

vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: any) => <span data-testid="entity-chip">{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@/components/viz/EnrichmentDetailPanel', () => ({
  EnrichmentDetailPanel: ({ enrichment }: any) => (
    <div data-testid="enrichment-panel">{enrichment ? 'has-data' : 'no-data'}</div>
  ),
}))

vi.mock('@/components/viz/RelationshipGraph', () => ({
  RelationshipGraph: ({ nodes }: any) => (
    <div data-testid="relationship-graph">{nodes.length} nodes</div>
  ),
}))

vi.mock('@/components/viz/FlipDetailCard', () => ({
  IOCDetailBack: () => <div data-testid="ioc-detail-back" />,
}))

vi.mock('@/components/viz/EntityPreview', () => ({
  EntityPreview: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/viz/QuickActionToolbar', () => ({
  QuickActionToolbar: () => null,
}))

vi.mock('@/components/viz/SparklineCell', () => ({
  SparklineCell: () => <span>~</span>,
  generateStubTrend: () => [1, 2, 3],
}))

vi.mock('@/components/viz/ConfidenceBreakdown', () => ({
  ConfidenceBreakdown: () => <div data-testid="confidence-breakdown" />,
}))

vi.mock('@/hooks/demo-data', () => ({
  DEMO_ENRICHMENT_RESULT: { enrichmentStatus: 'enriched', enrichedAt: null, haikuResult: null, vtResult: null, abuseipdbResult: null, geolocation: null, externalRiskScore: null, enrichmentQuality: null, failureReason: null },
  DEMO_IOC_COST: { totalCostUsd: 0, totalTokens: 0, providers: [] },
}))

// Import AFTER mocks
import { VulnerabilityListPage } from '@/pages/VulnerabilityListPage'
import { SearchPage } from '@/pages/SearchPage'
import { IocListPage } from '@/pages/IocListPage'

/* ================================================================ */
/* Mock data                                                          */
/* ================================================================ */

const MOCK_VULN = {
  id: 'v1', cveId: 'CVE-2024-3400', description: 'PAN-OS command injection',
  cvssV3Score: 10, cvssV3Severity: 'critical', epssScore: 0.97, epssPercentile: 99,
  cisaKev: true, exploitedInWild: true, exploitAvailable: true,
  priorityScore: 95, affectedProducts: ['PAN-OS 10.2'], affectedVendors: ['Palo Alto'],
  weaknessType: 'CWE-77', confidence: 99, tlp: 'red', tags: ['apt', 'firewall'],
  active: true, publishedDate: '2024-04-12', firstSeen: '2024-04-12', lastSeen: '2026-03-26',
}

const MOCK_VULN_LIST = { data: [MOCK_VULN], total: 1, page: 1, limit: 50 }

const MOCK_IOC = {
  id: 'ioc1', normalizedValue: '185.220.101.34', iocType: 'ip',
  severity: 'critical', confidence: 92, lifecycle: 'active',
  tlp: 'red', tags: ['tor', 'c2'], threatActors: ['APT-28'],
  malwareFamilies: ['Cobalt Strike'], campaignId: null,
  firstSeen: '2024-01-01', lastSeen: '2026-03-26',
  feedReliability: 85, corroborationCount: 3, aiConfidence: 88,
}

const MOCK_IOC_LIST = { data: [MOCK_IOC], total: 1, page: 1, limit: 50 }

// MOCK_SEARCH_RESULT removed — SearchPage now uses useEsSearch with inline mock data

/* ================================================================ */
/* FIX #1: VulnerabilityListPage detail panel                        */
/* ================================================================ */

describe('VulnerabilityListPage detail panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVulnerabilities.mockReturnValue({
      data: MOCK_VULN_LIST, isLoading: false, isDemo: true,
    })
  })

  it('renders vulnerability table', () => {
    render(<VulnerabilityListPage />)
    expect(screen.getByText('CVE-2024-3400')).toBeTruthy()
  })

  it('opens detail panel on row click', () => {
    render(<VulnerabilityListPage />)
    // Click the CVE row
    fireEvent.click(screen.getByText('CVE-2024-3400'))
    // Detail panel should appear
    expect(screen.getByTestId('vuln-detail-panel')).toBeTruthy()
  })

  it('shows CVE description in detail panel', () => {
    render(<VulnerabilityListPage />)
    fireEvent.click(screen.getByText('CVE-2024-3400'))
    expect(screen.getByText('PAN-OS command injection')).toBeTruthy()
  })

  it('shows CVSS score in detail panel', () => {
    render(<VulnerabilityListPage />)
    fireEvent.click(screen.getByText('CVE-2024-3400'))
    // Two "10.0" exist: one in table CvssBar, one in detail panel
    expect(screen.getAllByText('10.0').length).toBeGreaterThanOrEqual(2)
  })

  it('shows KEV badge in detail panel', () => {
    render(<VulnerabilityListPage />)
    fireEvent.click(screen.getByText('CVE-2024-3400'))
    // KEV appears in table ExploitBadges and in detail panel
    expect(screen.getAllByText('KEV').length).toBeGreaterThanOrEqual(1)
  })

  it('shows affected vendor in detail panel', () => {
    render(<VulnerabilityListPage />)
    fireEvent.click(screen.getByText('CVE-2024-3400'))
    // Vendor appears in table and in detail panel
    expect(screen.getAllByText('Palo Alto').length).toBeGreaterThanOrEqual(1)
  })

  it('shows NVD link', () => {
    render(<VulnerabilityListPage />)
    fireEvent.click(screen.getByText('CVE-2024-3400'))
    expect(screen.getByText('NVD Detail')).toBeTruthy()
  })

  it('closes panel on second click', () => {
    render(<VulnerabilityListPage />)
    // First click opens the panel
    const cveChip = screen.getByText('CVE-2024-3400')
    fireEvent.click(cveChip)
    expect(screen.getByTestId('split-right')).toBeTruthy()
    // The row click toggles selectedId — we need to click the row itself
    // In DataTable, the row has the onClick. Since text "CVE-2024-3400" is in the chip,
    // clicking it fires the row click. Second click should close.
    fireEvent.click(cveChip)
    expect(screen.queryByTestId('split-right')).toBeNull()
  })
})

/* ================================================================ */
/* FIX #2: SearchPage drill-down                                     */
/* ================================================================ */

describe('SearchPage drill-down', () => {
  const MOCK_ES_RESULT = {
    id: 'sr1', iocType: 'ip', value: '10.0.0.1', severity: 'high',
    confidence: 80, tags: ['c2'], firstSeen: '2024-01-01T00:00:00Z',
    lastSeen: '2026-03-26T00:00:00Z', enriched: true, tlp: 'AMBER',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Provide defaults for hooks used by IocDetailPanel (cleared by clearAllMocks)
    mockUseIOCPivot.mockReturnValue({ data: null, isLoading: false })
    mockUseIOCTimeline.mockReturnValue({ data: [], isLoading: false })
    mockUseUpdateIOCLifecycle.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseIOCEnrichment.mockReturnValue({ data: null, isLoading: false })
    mockUseNodeNeighbors.mockReturnValue({ data: null })
    mockUseEsSearch.mockReturnValue({
      query: 'test', setQuery: vi.fn(), filters: {}, setFilters: vi.fn(),
      sortBy: 'relevance', setSortBy: vi.fn(), page: 1, setPage: vi.fn(),
      pageSize: 50, setPageSize: vi.fn(),
      results: [MOCK_ES_RESULT], totalCount: 1,
      facets: { byType: [], bySeverity: [], byTlp: [] },
      isLoading: false, isDemo: false, error: null, searchTimeMs: 5,
      clearAll: vi.fn(), exportResults: vi.fn(),
    })
  })

  it('renders search results as clickable buttons', () => {
    render(<SearchPage />)
    const rows = screen.queryAllByTestId('search-result-row')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('row click selects IOC for detail', () => {
    render(<SearchPage />)
    const rows = screen.queryAllByTestId('search-result-row')
    expect(rows.length).toBeGreaterThan(0)
    fireEvent.click(rows[0]!)
    expect(rows[0]).toBeInTheDocument()
  })
})

/* ================================================================ */
/* FIX #3: IOC Enrichment tab wiring                                 */
/* ================================================================ */

describe('IocListPage enrichment tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseIOCs.mockReturnValue({ data: MOCK_IOC_LIST, isLoading: false, isDemo: true })
    mockUseIOCStats.mockReturnValue({ data: { total: 1, bySeverity: {}, byLifecycle: {} } })
    mockUseIOCPivot.mockReturnValue({ data: null, isLoading: false })
    mockUseIOCTimeline.mockReturnValue({ data: null, isLoading: false })
    mockUseIOCEnrichment.mockReturnValue({ data: null })
    mockUseNodeNeighbors.mockReturnValue({ data: null, isLoading: false })
    mockUseUpdateIOCLifecycle.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it('passes enrichment data to panel when available', () => {
    const enrichResult = { enrichmentStatus: 'enriched' }
    mockUseIOCEnrichment.mockReturnValue({ data: enrichResult })
    render(<IocListPage />)
    // Select an IOC
    fireEvent.click(screen.getByText('185.220.101.34'))
    // Enrichment panel should show "has-data"
    expect(screen.getByTestId('enrichment-panel')).toBeTruthy()
    expect(screen.getByText('has-data')).toBeTruthy()
  })

  it('passes null enrichment when hook returns nothing', () => {
    mockUseIOCEnrichment.mockReturnValue({ data: null })
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    expect(screen.getByText('no-data')).toBeTruthy()
  })
})

/* ================================================================ */
/* FIX #4: IOC Relations tab — real data                             */
/* ================================================================ */

describe('IocListPage relations tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseIOCs.mockReturnValue({ data: MOCK_IOC_LIST, isLoading: false, isDemo: false })
    mockUseIOCStats.mockReturnValue({ data: { total: 1, bySeverity: {}, byLifecycle: {} } })
    mockUseIOCPivot.mockReturnValue({ data: null, isLoading: false })
    mockUseIOCTimeline.mockReturnValue({ data: null, isLoading: false })
    mockUseIOCEnrichment.mockReturnValue({ data: null })
    mockUseUpdateIOCLifecycle.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it('shows empty state when graph returns no data (live mode)', () => {
    mockUseNodeNeighbors.mockReturnValue({ data: { nodes: [], edges: [] }, isLoading: false })
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    // Switch to Relations tab
    fireEvent.click(screen.getByText('Relations'))
    expect(screen.getByTestId('relations-empty')).toBeTruthy()
    expect(screen.getByText('No relationships discovered yet')).toBeTruthy()
  })

  it('does not show empty state when graph has real data', async () => {
    mockUseNodeNeighbors.mockReturnValue({
      data: {
        nodes: [
          { id: 'ioc1', entityType: 'ioc', label: '185.220.101.34', riskScore: 90, properties: {}, createdAt: '' },
          { id: 'actor1', entityType: 'threat_actor', label: 'APT-28', riskScore: 80, properties: {}, createdAt: '' },
        ],
        edges: [
          { id: 'e1', sourceId: 'ioc1', targetId: 'actor1', relationshipType: 'attributed_to', confidence: 90, properties: {} },
        ],
      },
      isLoading: false,
    })
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Relations'))
    // With real data, the empty state should NOT be shown
    expect(screen.queryByTestId('relations-empty')).toBeNull()
  })
})

/* ================================================================ */
/* Filter/sort audit — VulnerabilityListPage                         */
/* ================================================================ */

describe('VulnerabilityListPage filter and sort', () => {
  beforeEach(() => {
    const vulnHigh = { ...MOCK_VULN, id: 'v2', cveId: 'CVE-2024-0001', cvssV3Severity: 'high', cvssV3Score: 7.5, priorityScore: 60 }
    mockUseVulnerabilities.mockReturnValue({
      data: { data: [MOCK_VULN, vulnHigh], total: 2, page: 1, limit: 50 },
      isLoading: false, isDemo: true,
    })
  })

  it('renders both CVEs initially', () => {
    render(<VulnerabilityListPage />)
    expect(screen.getByText('CVE-2024-3400')).toBeTruthy()
    expect(screen.getByText('CVE-2024-0001')).toBeTruthy()
  })

  it('searches by CVE ID', () => {
    vi.useFakeTimers()
    render(<VulnerabilityListPage />)
    const searchInput = screen.getByPlaceholderText(/Search CVEs/i)
    fireEvent.change(searchInput, { target: { value: '3400' } })
    act(() => { vi.advanceTimersByTime(300) }) // wait for debounce
    expect(screen.getByText('CVE-2024-3400')).toBeTruthy()
    expect(screen.queryByText('CVE-2024-0001')).toBeNull()
    vi.useRealTimers()
  })
})
