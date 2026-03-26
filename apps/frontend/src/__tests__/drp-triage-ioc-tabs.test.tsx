/**
 * Tests for:
 * 1. DRP AlertDetailPanel triage actions (TP/FP/Investigate)
 * 2. IocListPage pivot + timeline tabs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ═══════════════════════════════════════════════════════════════
// Part 1: DRP Triage Tests
// ═══════════════════════════════════════════════════════════════

const mockTriageMutate = vi.fn()
const mockStatusMutate = vi.fn()
const mockAssignMutate = vi.fn()
const mockFeedbackMutate = vi.fn()

vi.mock('@/hooks/use-phase4-data', () => ({
  useCreateAsset: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useChangeAlertStatus: () => ({ mutate: mockStatusMutate, isPending: false }),
  useAssignAlert: () => ({ mutate: mockAssignMutate, isPending: false }),
  useAlertFeedback: () => ({ mutate: mockFeedbackMutate, isPending: false, isSuccess: false }),
  useTriageAlert: () => ({ mutate: mockTriageMutate, isPending: false, isSuccess: false }),
  useNodeNeighbors: () => ({ data: null, isLoading: false }),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useIOCEnrichment: () => ({ data: null }),
  useIOCCost: () => ({ data: null }),
  useTriggerEnrichment: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

import { AlertDetailPanel } from '@/components/viz/DRPModals'

const MOCK_ALERT = {
  id: 'alert-1', title: 'Typosquat: test.com → t3st.com',
  description: 'Potential typosquatting domain detected',
  type: 'typosquatting', severity: 'high', confidence: 85,
  status: 'open', detectedValue: 't3st.com',
  assignee: null, triagedAt: null, resolvedAt: null,
  createdAt: new Date().toISOString(),
}

describe('AlertDetailPanel — Triage Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders triage section with TP/FP/Investigate buttons', () => {
    render(<AlertDetailPanel alert={MOCK_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    expect(screen.getByText('Triage')).toBeTruthy()
    // Triage buttons
    const tpButtons = screen.getAllByText('True Positive')
    expect(tpButtons.length).toBeGreaterThanOrEqual(1)
    const fpButtons = screen.getAllByText('False Positive')
    expect(fpButtons.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Investigate')).toBeTruthy()
  })

  it('calls triageMutation with true_positive on TP click', () => {
    render(<AlertDetailPanel alert={MOCK_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    // The triage section's TP button (first one in the Triage section)
    const triageSection = screen.getByText('Triage').parentElement!
    const tpBtn = triageSection.querySelector('button')!
    fireEvent.click(tpBtn)
    expect(mockTriageMutate).toHaveBeenCalledWith({
      id: 'alert-1', verdict: 'true_positive', notes: undefined,
    })
  })

  it('calls triageMutation with investigate on Investigate click', () => {
    render(<AlertDetailPanel alert={MOCK_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    fireEvent.click(screen.getByText('Investigate'))
    expect(mockTriageMutate).toHaveBeenCalledWith({
      id: 'alert-1', verdict: 'investigate', notes: undefined,
    })
  })

  it('disables triage buttons in demo mode', () => {
    render(<AlertDetailPanel alert={MOCK_ALERT as any} onClose={vi.fn()} isDemo={true} />)
    fireEvent.click(screen.getByText('Investigate'))
    expect(mockTriageMutate).not.toHaveBeenCalled()
  })

  it('includes triage notes when provided', () => {
    render(<AlertDetailPanel alert={MOCK_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    const textarea = screen.getByPlaceholderText('Add investigation notes...')
    fireEvent.change(textarea, { target: { value: 'Suspicious domain' } })
    fireEvent.click(screen.getByText('Investigate'))
    expect(mockTriageMutate).toHaveBeenCalledWith({
      id: 'alert-1', verdict: 'investigate', notes: 'Suspicious domain',
    })
  })

  it('still renders legacy verdict feedback section', () => {
    render(<AlertDetailPanel alert={MOCK_ALERT as any} onClose={vi.fn()} isDemo={false} />)
    expect(screen.getByText('Verdict Feedback')).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════
// Part 2: IOC Pivot + Timeline Tab Tests
// ═══════════════════════════════════════════════════════════════

const mockUseIOCs = vi.fn()
const mockUseIOCStats = vi.fn()
const mockUseIOCPivot = vi.fn()
const mockUseIOCTimeline = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: (...args: any[]) => mockUseIOCs(...args),
  useIOCStats: () => mockUseIOCStats(),
  useIOCPivot: (...args: any[]) => mockUseIOCPivot(...args),
  useIOCTimeline: (...args: any[]) => mockUseIOCTimeline(...args),
  useUpdateIOCLifecycle: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: any) => (
    <div data-testid="split-pane">
      <div data-testid="split-left">{left}</div>
      {showRight && <div data-testid="split-right">{right}</div>}
    </div>
  ),
}))

vi.mock('@/components/viz/EntityPreview', () => ({
  EntityPreview: ({ children }: any) => <>{children}</>,
}))
vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: any) => <span data-testid="entity-chip">{value}</span>,
}))
vi.mock('@/components/viz/FlipDetailCard', () => ({
  IOCDetailBack: () => <div data-testid="ioc-detail-back">Details</div>,
}))
vi.mock('@/components/viz/QuickActionToolbar', () => ({
  QuickActionToolbar: () => null,
}))
vi.mock('@/components/viz/SparklineCell', () => ({
  SparklineCell: () => <span>~</span>,
  generateStubTrend: () => [1, 2, 3],
}))
vi.mock('@/components/viz/RelationshipGraph', () => ({
  RelationshipGraph: () => <div>Graph</div>,
}))
vi.mock('@/components/viz/EnrichmentDetailPanel', () => ({
  EnrichmentDetailPanel: () => <div data-testid="enrichment-panel">Enrichment</div>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span>?</span>,
}))

import { IocListPage } from '@/pages/IocListPage'

const MOCK_IOC = {
  id: 'ioc-1', iocType: 'ip', normalizedValue: '185.220.101.34',
  severity: 'critical', confidence: 92, lifecycle: 'active', tlp: 'red',
  tags: ['apt28', 'c2'], threatActors: ['APT28'], malwareFamilies: ['Cobalt Strike'],
  firstSeen: '2026-01-15', lastSeen: '2026-03-20', campaignId: null,
}

const MOCK_PIVOT: import('@/hooks/use-intel-data').IOCPivotResult = {
  relatedIOCs: [
    { id: 'ioc-2', iocType: 'domain', normalizedValue: 'evil.example.com', severity: 'high', relationship: 'resolves_to' },
  ],
  actors: [{ id: 'a1', name: 'APT28', confidence: 90 }],
  malware: [{ id: 'm1', name: 'Cobalt Strike', confidence: 85 }],
  campaigns: [{ id: 'c1', name: 'Operation Storm' }],
}

const MOCK_TIMELINE: import('@/hooks/use-intel-data').IOCTimelineEvent[] = [
  { timestamp: '2026-03-20T10:00:00Z', eventType: 'first_seen', summary: 'First observed in RSS feed' },
  { timestamp: '2026-03-20T11:00:00Z', eventType: 'enrichment', summary: 'GeoIP enrichment: Russia', source: 'MaxMind' },
  { timestamp: '2026-03-21T08:00:00Z', eventType: 'sighting', summary: 'Sighted in DarkWeb dump' },
]

function setupIOCMocks() {
  mockUseIOCs.mockReturnValue({ data: { data: [MOCK_IOC], total: 1, page: 1, limit: 50 }, isLoading: false, isDemo: true })
  mockUseIOCStats.mockReturnValue({ data: { total: 1, byType: { ip: 1 }, bySeverity: { critical: 1 }, byLifecycle: { active: 1 } } })
  mockUseIOCPivot.mockReturnValue({ data: MOCK_PIVOT, isLoading: false })
  mockUseIOCTimeline.mockReturnValue({ data: MOCK_TIMELINE, isLoading: false })
}

describe('IocListPage — Pivot Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupIOCMocks()
  })

  it('shows Pivot tab button in detail panel', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    expect(screen.getByText('Pivot')).toBeTruthy()
  })

  it('renders pivot data when tab clicked', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Pivot'))
    expect(screen.getByTestId('ioc-pivot-tab')).toBeTruthy()
    expect(screen.getByText('evil.example.com')).toBeTruthy()
    expect(screen.getByText('APT28')).toBeTruthy()
    expect(screen.getByText('Cobalt Strike')).toBeTruthy()
    expect(screen.getByText('Operation Storm')).toBeTruthy()
  })

  it('shows relationship badge on related IOCs', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Pivot'))
    expect(screen.getByText('resolves_to')).toBeTruthy()
  })

  it('shows empty state when no pivot data', () => {
    mockUseIOCPivot.mockReturnValue({ data: { relatedIOCs: [], actors: [], malware: [], campaigns: [] }, isLoading: false })
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Pivot'))
    expect(screen.getByText('No pivot data available yet')).toBeTruthy()
  })
})

describe('IocListPage — Timeline Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupIOCMocks()
  })

  it('shows Timeline tab button in detail panel', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    expect(screen.getByText('Timeline')).toBeTruthy()
  })

  it('renders timeline events when tab clicked', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Timeline'))
    expect(screen.getByTestId('ioc-timeline-tab')).toBeTruthy()
    expect(screen.getByText('First observed in RSS feed')).toBeTruthy()
    expect(screen.getByText('GeoIP enrichment: Russia')).toBeTruthy()
    expect(screen.getByText('Sighted in DarkWeb dump')).toBeTruthy()
  })

  it('shows event type badges', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Timeline'))
    expect(screen.getByText('first seen')).toBeTruthy()
    expect(screen.getByText('enrichment')).toBeTruthy()
    expect(screen.getByText('sighting')).toBeTruthy()
  })

  it('shows source attribution when present', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Timeline'))
    expect(screen.getByText('via MaxMind')).toBeTruthy()
  })

  it('shows empty state when no timeline events', () => {
    mockUseIOCTimeline.mockReturnValue({ data: [], isLoading: false })
    render(<IocListPage />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    fireEvent.click(screen.getByText('Timeline'))
    expect(screen.getByText('No timeline events yet')).toBeTruthy()
  })
})
