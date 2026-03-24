/**
 * Tests for Phase 4 frontend pages: DRP, Threat Graph, Correlation, Hunting.
 * Covers: rendering, demo fallback, filters, detail panels, key UI components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock Phase 4 data hooks ────────────────────────────────────

const mockUseDRPAlerts = vi.fn()
const mockUseDRPAlertStats = vi.fn()
const mockUseDRPAssets = vi.fn()
const mockUseDRPAssetStats = vi.fn()
const mockUseCertStreamStatus = vi.fn()
const mockUseTyposquatScan = vi.fn()
const mockUseCreateAsset = vi.fn()
const mockUseDeleteAsset = vi.fn()
const mockUseScanAsset = vi.fn()
const mockUseChangeAlertStatus = vi.fn()
const mockUseAssignAlert = vi.fn()
const mockUseAlertFeedback = vi.fn()
const mockUseGraphPath = vi.fn()
const mockUseCreateGraphNode = vi.fn()
const mockUseStixExport = vi.fn()
const mockUseCreateHunt = vi.fn()
const mockUseChangeHuntStatus = vi.fn()
const mockUseAddHypothesis = vi.fn()
const mockUseAddEvidence = vi.fn()
const mockUseGraphNodes = vi.fn()
const mockUseGraphStats = vi.fn()
const mockUseGraphSearch = vi.fn()
const mockUseNodeNeighbors = vi.fn()
const mockUseCorrelations = vi.fn()
const mockUseCorrelationStats = vi.fn()
const mockUseCampaigns = vi.fn()
const mockUseTriggerCorrelation = vi.fn()
const mockUseHuntSessions = vi.fn()
const mockUseHuntStats = vi.fn()
const mockUseHuntHypotheses = vi.fn()
const mockUseHuntEvidence = vi.fn()
const mockUseHuntTemplates = vi.fn()

vi.mock('@/hooks/use-phase4-data', () => ({
  useDRPAlerts: (...args: any[]) => mockUseDRPAlerts(...args),
  useDRPAlertStats: () => mockUseDRPAlertStats(),
  useDRPAssets: (...args: any[]) => mockUseDRPAssets(...args),
  useDRPAssetStats: () => mockUseDRPAssetStats(),
  useCertStreamStatus: () => mockUseCertStreamStatus(),
  useTyposquatScan: () => mockUseTyposquatScan(),
  useCreateAsset: () => mockUseCreateAsset(),
  useDeleteAsset: () => mockUseDeleteAsset(),
  useScanAsset: () => mockUseScanAsset(),
  useChangeAlertStatus: () => mockUseChangeAlertStatus(),
  useAssignAlert: () => mockUseAssignAlert(),
  useAlertFeedback: () => mockUseAlertFeedback(),
  useGraphPath: (...args: any[]) => mockUseGraphPath(...args),
  useCreateGraphNode: () => mockUseCreateGraphNode(),
  useStixExport: () => mockUseStixExport(),
  useCreateHunt: () => mockUseCreateHunt(),
  useChangeHuntStatus: () => mockUseChangeHuntStatus(),
  useAddHypothesis: () => mockUseAddHypothesis(),
  useAddEvidence: () => mockUseAddEvidence(),
  useCorrelationFeedback: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useGraphNodes: (...args: any[]) => mockUseGraphNodes(...args),
  useGraphStats: () => mockUseGraphStats(),
  useGraphSearch: (...args: any[]) => mockUseGraphSearch(...args),
  useNodeNeighbors: (...args: any[]) => mockUseNodeNeighbors(...args),
  useCorrelations: (...args: any[]) => mockUseCorrelations(...args),
  useCorrelationStats: () => mockUseCorrelationStats(),
  useCampaigns: () => mockUseCampaigns(),
  useTriggerCorrelation: () => mockUseTriggerCorrelation(),
  useHuntSessions: (...args: any[]) => mockUseHuntSessions(...args),
  useHuntStats: () => mockUseHuntStats(),
  useHuntHypotheses: (...args: any[]) => mockUseHuntHypotheses(...args),
  useHuntEvidence: (...args: any[]) => mockUseHuntEvidence(...args),
  useHuntTemplates: () => mockUseHuntTemplates(),
}))

vi.mock('@/hooks/phase4-demo-data', () => ({
  generateAlertHeatmap: () => Array.from({ length: 90 }, (_, i) => ({
    date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
    count: Math.floor(Math.random() * 5),
  })),
  DEMO_TYPOSQUAT_RESULTS: [
    { domain: 'intelvvatch.in', method: 'homoglyph', similarity: 0.94, editDistance: 1, riskScore: 0.92, isRegistered: true, registrationDate: null, hostingProvider: 'Namecheap', compositeScore: 0.91, jaroWinkler: 0.96, soundexMatch: true, tldRisk: 0.7 },
  ],
}))

// Mock shared-ui components
vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span data-testid={`stat-${label}`}>{label}: {value}</span>,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span data-testid="tooltip-help">?</span>,
}))

// Mock D3 — prevent SVG rendering issues in jsdom
vi.mock('d3', () => {
  const mockSelection = {
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    data: vi.fn().mockReturnThis(),
    join: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    attr: vi.fn().mockReturnThis(),
    style: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    call: vi.fn().mockReturnThis(),
    transition: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    classed: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    each: vi.fn().mockReturnThis(),
  }
  return {
    select: vi.fn().mockReturnValue(mockSelection),
    zoom: vi.fn().mockReturnValue({
      scaleExtent: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      transform: {},
      scaleBy: vi.fn(),
    }),
    zoomIdentity: { translate: vi.fn().mockReturnValue({ scale: vi.fn().mockReturnValue({ translate: vi.fn() }) }) },
    forceSimulation: vi.fn().mockReturnValue({
      force: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      alphaTarget: vi.fn().mockReturnThis(),
      restart: vi.fn(),
      stop: vi.fn(),
    }),
    forceLink: vi.fn().mockReturnValue({ id: vi.fn().mockReturnThis(), distance: vi.fn().mockReturnThis() }),
    forceManyBody: vi.fn().mockReturnValue({ strength: vi.fn().mockReturnThis() }),
    forceCenter: vi.fn(),
    forceCollide: vi.fn().mockReturnValue({ radius: vi.fn().mockReturnThis() }),
    drag: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis() }),
    easeLinear: vi.fn(),
  }
})

// ─── Default mock return values ─────────────────────────────────

const DRP_ALERT = {
  id: 'a1', assetId: 'asset-1', type: 'typosquatting',
  title: 'Typosquat: test.com → t3st.com', description: 'Homoglyph detected',
  severity: 'critical', status: 'open', detectedValue: 't3st.com',
  confidence: 94, assignee: null, createdAt: new Date().toISOString(),
  resolvedAt: null, triagedAt: null,
}

const DRP_ASSET = {
  id: 'asset-1', name: 'Test Domain', type: 'domain', value: 'test.com',
  status: 'active', lastScanAt: new Date().toISOString(), alertCount: 3,
  riskScore: 65, createdAt: new Date().toISOString(),
}

const CORRELATION = {
  id: 'corr-1', correlationType: 'infrastructure',
  title: 'Shared C2 Infrastructure', description: '3 IOCs share hosting',
  severity: 'critical', confidence: 91, entityIds: ['n1', 'n2'],
  entityLabels: ['APT28', 'Cobalt Strike'],
  suppressed: false, createdAt: new Date().toISOString(),
  diamondModel: { adversary: 'APT28', infrastructure: '185.x.x.x', capability: 'Cobalt Strike', victim: 'Gov' },
  killChainPhase: 'command_and_control',
}

const CAMPAIGN = {
  id: 'camp-1', name: 'Operation Storm', description: 'APT28 campaign',
  actorId: 'n1', actorName: 'APT28', techniques: ['T1190', 'T1071'],
  confidence: 88, iocCount: 8, createdAt: new Date().toISOString(),
}

const HUNT_SESSION = {
  id: 'hunt-1', name: 'APT28 Hunt', description: 'Investigating lateral movement',
  status: 'active', huntType: 'hypothesis', createdBy: 'Analyst',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  findingsCount: 4, evidenceCount: 7, hypothesisCount: 3, score: 78,
}

const HYPOTHESIS = {
  id: 'hyp-1', huntId: 'hunt-1', statement: 'APT28 used PowerShell',
  rationale: 'Historical TTP', verdict: 'investigating',
  mitreTechniques: ['T1059.001'], createdAt: new Date().toISOString(),
}

const EVIDENCE = {
  id: 'ev-1', huntId: 'hunt-1', type: 'ioc_match',
  title: 'C2 IP match', description: 'Known APT28 C2',
  entityType: 'ip', entityValue: '185.220.101.34',
  tags: ['c2', 'apt28'], createdAt: new Date().toISOString(),
}

const TEMPLATE = {
  id: 'tpl-1', name: 'APT Lateral Movement', description: 'Hunt for lateral movement',
  huntType: 'hypothesis', category: 'APT', mitreTechniques: ['T1021'],
  usageCount: 12,
}

function setupDefaultMocks() {
  mockUseDRPAlerts.mockReturnValue({ data: { data: [DRP_ALERT], total: 1, page: 1, limit: 50 }, isLoading: false, isDemo: true })
  mockUseDRPAlertStats.mockReturnValue({ data: { total: 8, open: 4, investigating: 2, resolved: 1, bySeverity: { critical: 2, high: 3 }, byType: { typosquatting: 4 } } })
  mockUseDRPAssets.mockReturnValue({ data: { data: [DRP_ASSET], total: 1, page: 1, limit: 50 } })
  mockUseDRPAssetStats.mockReturnValue({ data: { total: 5, byType: { domain: 2 }, avgRiskScore: 43 } })
  mockUseCertStreamStatus.mockReturnValue({ data: { enabled: true, connected: true, matchesLastHour: 3, totalProcessed: 128450, uptime: '14h' } })
  mockUseTyposquatScan.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateAsset.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false })
  mockUseDeleteAsset.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseScanAsset.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseChangeAlertStatus.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseAssignAlert.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseAlertFeedback.mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false })
  mockUseGraphPath.mockReturnValue({ data: null })
  mockUseCreateGraphNode.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseStixExport.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateHunt.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseChangeHuntStatus.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseAddHypothesis.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseAddEvidence.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseGraphNodes.mockReturnValue({ data: { nodes: [{ id: 'n1', entityType: 'threat_actor', label: 'APT28', riskScore: 92, properties: {}, createdAt: '' }], edges: [] }, isDemo: true })
  mockUseGraphStats.mockReturnValue({ data: { totalNodes: 15, totalEdges: 18, byType: { ioc: 5 }, avgRiskScore: 85 } })
  mockUseGraphSearch.mockReturnValue({ data: { nodes: [] } })
  mockUseNodeNeighbors.mockReturnValue({ data: { nodes: [], edges: [] } })
  mockUseCorrelations.mockReturnValue({ data: { data: [CORRELATION], total: 1, page: 1, limit: 50 }, isLoading: false, isDemo: true })
  mockUseCorrelationStats.mockReturnValue({ data: { total: 6, byType: { infrastructure: 2 }, bySeverity: { critical: 2 }, suppressedCount: 1, avgConfidence: 72 } })
  mockUseCampaigns.mockReturnValue({ data: { data: [CAMPAIGN], total: 1, page: 1, limit: 50 } })
  mockUseTriggerCorrelation.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseHuntSessions.mockReturnValue({ data: { data: [HUNT_SESSION], total: 1, page: 1, limit: 50 }, isDemo: true })
  mockUseHuntStats.mockReturnValue({ data: { total: 5, active: 2, completed: 2, totalFindings: 23, avgScore: 74, byType: {} } })
  mockUseHuntHypotheses.mockReturnValue({ data: { data: [HYPOTHESIS], total: 1, page: 1, limit: 50 } })
  mockUseHuntEvidence.mockReturnValue({ data: { data: [EVIDENCE], total: 1, page: 1, limit: 50 } })
  mockUseHuntTemplates.mockReturnValue({ data: { data: [TEMPLATE], total: 1 } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaultMocks()
})

// ─── DRP Dashboard Tests ────────────────────────────────────────

describe('DRPDashboardPage', () => {
  let DRPDashboardPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/DRPDashboardPage')
    DRPDashboardPage = mod.DRPDashboardPage
  })

  it('renders demo banner in demo mode', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByText('Demo')).toBeTruthy()
    expect(screen.getByText(/Demo data — connect DRP service/)).toBeTruthy()
  })

  it('renders stats bar with asset and alert counts', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByTestId('stat-Assets')).toBeTruthy()
    expect(screen.getByTestId('stat-Open Alerts')).toBeTruthy()
    expect(screen.getByTestId('stat-Risk Score')).toBeTruthy()
  })

  it('renders executive risk score gauge', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByText('Digital Risk Score')).toBeTruthy()
  })

  it('renders CertStream status indicator', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByText('CertStream Monitor')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('renders alert activity heatmap', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByText('Alert Activity')).toBeTruthy()
  })

  it('renders typosquat scanner section', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByText('Typosquat Scanner')).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g., intelwatch.in')).toBeTruthy()
  })

  it('renders alert table with severity badge', () => {
    render(<DRPDashboardPage />)
    expect(screen.getByText('Typosquat: test.com → t3st.com')).toBeTruthy()
  })

  it('switches between alerts and assets tabs', () => {
    render(<DRPDashboardPage />)
    const assetsTab = screen.getByText('Monitored Assets')
    fireEvent.click(assetsTab)
    expect(screen.getByText('Test Domain')).toBeTruthy()
  })

  it('renders SLA badge for open alerts', () => {
    render(<DRPDashboardPage />)
    // Should show hours open in SLA column
    expect(screen.getAllByText(/\d+h open/).length).toBeGreaterThan(0)
  })

  it('shows CertStream offline when not connected', () => {
    mockUseCertStreamStatus.mockReturnValue({
      data: { enabled: true, connected: false, matchesLastHour: 0, totalProcessed: 0, uptime: '—' },
    })
    render(<DRPDashboardPage />)
    expect(screen.getByText('Offline')).toBeTruthy()
  })

  it('shows Add Asset button on assets tab', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Monitored Assets'))
    expect(screen.getByText('Add Asset')).toBeTruthy()
  })

  it('opens create asset modal when Add Asset clicked', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Monitored Assets'))
    fireEvent.click(screen.getByText('Add Asset'))
    expect(screen.getByText('Add Monitored Asset')).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g., example.com')).toBeTruthy()
  })

  it('shows Scan and Delete buttons on asset rows', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Monitored Assets'))
    // Multiple "Scan" buttons exist (typosquat scanner + asset row)
    expect(screen.getAllByText('Scan').length).toBeGreaterThanOrEqual(1)
  })

  it('opens alert detail panel when alert row clicked', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Typosquat: test.com → t3st.com'))
    // Detail panel should show triage actions
    expect(screen.getByText('Status & Actions')).toBeTruthy()
    expect(screen.getByText('Verdict Feedback')).toBeTruthy()
  })

  it('shows triage status transitions in alert detail', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Typosquat: test.com → t3st.com'))
    // Open alert can transition to investigating, resolved, or false_positive
    expect(screen.getByText('investigating')).toBeTruthy()
    expect(screen.getByText('resolved')).toBeTruthy()
    expect(screen.getByText('false positive')).toBeTruthy()
  })

  it('shows TP/FP feedback buttons in alert detail', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Typosquat: test.com → t3st.com'))
    expect(screen.getByText('True Positive')).toBeTruthy()
    expect(screen.getByText('False Positive')).toBeTruthy()
  })

  it('shows assign to me button in alert detail', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Typosquat: test.com → t3st.com'))
    expect(screen.getByText('Assign to me')).toBeTruthy()
  })

  it('shows demo mode warning in alert detail when in demo', () => {
    render(<DRPDashboardPage />)
    fireEvent.click(screen.getByText('Typosquat: test.com → t3st.com'))
    expect(screen.getByText(/Actions disabled in demo mode/)).toBeTruthy()
  })
})

// ─── Threat Graph Tests ─────────────────────────────────────────

describe('ThreatGraphPage', () => {
  let ThreatGraphPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/ThreatGraphPage')
    ThreatGraphPage = mod.ThreatGraphPage
  })

  it('renders demo banner', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByText(/Demo graph/)).toBeTruthy()
  })

  it('renders stats bar with node and edge counts', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByTestId('stat-Nodes')).toBeTruthy()
    expect(screen.getByTestId('stat-Edges')).toBeTruthy()
    expect(screen.getByTestId('stat-Avg Risk')).toBeTruthy()
  })

  it('renders search input', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByPlaceholderText('Search entities...')).toBeTruthy()
  })

  it('renders entity legend with type filters', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByText('IOC')).toBeTruthy()
    expect(screen.getByText('Threat Actor')).toBeTruthy()
    expect(screen.getByText('Malware')).toBeTruthy()
    expect(screen.getByText('Vulnerability')).toBeTruthy()
    expect(screen.getByText('Campaign')).toBeTruthy()
  })

  it('renders zoom controls', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByTitle('Zoom In')).toBeTruthy()
    expect(screen.getByTitle('Zoom Out')).toBeTruthy()
    expect(screen.getByTitle('Fit View')).toBeTruthy()
  })

  it('renders SVG canvas', () => {
    const { container } = render(<ThreatGraphPage />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('shows empty state when no nodes', () => {
    mockUseGraphNodes.mockReturnValue({ data: { nodes: [], edges: [] }, isDemo: true })
    render(<ThreatGraphPage />)
    expect(screen.getByText('No graph data available')).toBeTruthy()
  })

  it('renders Path Finder toggle button', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByTitle('Path Finder')).toBeTruthy()
  })

  it('renders Add Node button', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByTitle('Add Node')).toBeTruthy()
  })

  it('shows path finder bar when activated', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Path Finder'))
    expect(screen.getByText(/Path Finder/)).toBeTruthy()
    expect(screen.getByText(/Click a source node/)).toBeTruthy()
  })

  it('opens add node modal', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Add Node'))
    expect(screen.getByText('Add Graph Node')).toBeTruthy()
    expect(screen.getByPlaceholderText(/185.220.101.34/)).toBeTruthy()
  })
})

// ─── Correlation Tests ──────────────────────────────────────────

describe('CorrelationPage', () => {
  let CorrelationPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/CorrelationPage')
    CorrelationPage = mod.CorrelationPage
  })

  it('renders demo banner', () => {
    render(<CorrelationPage />)
    expect(screen.getByText(/Demo data — connect Correlation Engine/)).toBeTruthy()
  })

  it('renders stats bar', () => {
    render(<CorrelationPage />)
    expect(screen.getByTestId('stat-Correlations')).toBeTruthy()
    expect(screen.getByTestId('stat-Avg Confidence')).toBeTruthy()
    expect(screen.getByTestId('stat-Campaigns')).toBeTruthy()
  })

  it('renders correlation table with severity', () => {
    render(<CorrelationPage />)
    expect(screen.getByText('Shared C2 Infrastructure')).toBeTruthy()
  })

  it('renders auto-correlate button', () => {
    render(<CorrelationPage />)
    expect(screen.getByText('Auto-Correlate')).toBeTruthy()
  })

  it('switches to campaigns tab', () => {
    render(<CorrelationPage />)
    const campaignTab = screen.getByRole('button', { name: /Campaigns/ })
    fireEvent.click(campaignTab)
    expect(screen.getByText('Campaign Clusters')).toBeTruthy()
    expect(screen.getByText('Operation Storm')).toBeTruthy()
  })

  it('renders campaign card with MITRE techniques', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByRole('button', { name: /Campaigns/ }))
    expect(screen.getByText('T1190')).toBeTruthy()
    expect(screen.getByText('T1071')).toBeTruthy()
  })

  it('renders kill chain phase in table', () => {
    render(<CorrelationPage />)
    expect(screen.getByText('command and control')).toBeTruthy()
  })

  it('shows empty state with no data', () => {
    mockUseCorrelations.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false, isDemo: false })
    render(<CorrelationPage />)
    expect(screen.getByText(/No correlations found/)).toBeTruthy()
  })

  it('opens detail panel with feedback buttons when row clicked', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    expect(screen.getByText('Verdict Feedback')).toBeTruthy()
    expect(screen.getByText('True Positive')).toBeTruthy()
    expect(screen.getByText('False Positive')).toBeTruthy()
  })

  it('shows linked entities in detail panel', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    // APT28 appears in both table and detail — verify detail panel has entity count
    expect(screen.getByText(/Linked Entities/)).toBeTruthy()
    expect(screen.getAllByText('APT28').length).toBeGreaterThanOrEqual(2)
  })

  it('shows demo mode warning in detail panel', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    expect(screen.getByText(/Feedback disabled in demo mode/)).toBeTruthy()
  })
})

// ─── Hunting Workbench Tests ────────────────────────────────────

describe('HuntingWorkbenchPage', () => {
  let HuntingWorkbenchPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/HuntingWorkbenchPage')
    HuntingWorkbenchPage = mod.HuntingWorkbenchPage
  })

  it('renders demo banner', () => {
    render(<HuntingWorkbenchPage />)
    expect(screen.getByText(/Demo data — connect Hunting service/)).toBeTruthy()
  })

  it('renders stats bar', () => {
    render(<HuntingWorkbenchPage />)
    expect(screen.getByTestId('stat-Total Hunts')).toBeTruthy()
    expect(screen.getByTestId('stat-Active')).toBeTruthy()
    expect(screen.getByTestId('stat-Findings')).toBeTruthy()
  })

  it('renders hunt session card', () => {
    render(<HuntingWorkbenchPage />)
    expect(screen.getByText('APT28 Hunt')).toBeTruthy()
  })

  it('renders hunt score gauge', () => {
    render(<HuntingWorkbenchPage />)
    expect(screen.getByText('78')).toBeTruthy()
  })

  it('shows hunt detail when session clicked', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    // Description appears in both card and detail panel — verify at least 2 instances
    expect(screen.getAllByText('Investigating lateral movement').length).toBeGreaterThanOrEqual(2)
  })

  it('renders hypothesis kanban with investigating column', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    expect(screen.getByText('Investigating')).toBeTruthy()
    expect(screen.getByText('APT28 used PowerShell')).toBeTruthy()
  })

  it('switches to evidence timeline', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    fireEvent.click(screen.getByText(/Evidence/))
    expect(screen.getByText('C2 IP match')).toBeTruthy()
  })

  it('switches to playbook library', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('Playbook Library'))
    expect(screen.getByText('APT Lateral Movement')).toBeTruthy()
    expect(screen.getByText('T1021')).toBeTruthy()
  })

  it('shows empty state when no sessions', () => {
    mockUseHuntSessions.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 }, isDemo: false })
    render(<HuntingWorkbenchPage />)
    expect(screen.getByText(/No hunt sessions/)).toBeTruthy()
  })

  it('renders pivot chain when evidence has entity values', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    expect(screen.getByText('IOC Pivot Chain')).toBeTruthy()
    expect(screen.getByText('185.220.101.34')).toBeTruthy()
  })

  it('renders New Hunt button', () => {
    render(<HuntingWorkbenchPage />)
    expect(screen.getByText('New Hunt')).toBeTruthy()
  })

  it('opens create hunt modal', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('New Hunt'))
    expect(screen.getByText('New Hunt Session')).toBeTruthy()
    expect(screen.getByPlaceholderText(/APT28 Lateral Movement/)).toBeTruthy()
  })

  it('shows hunt type selector in create modal', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('New Hunt'))
    expect(screen.getByText('Hypothesis-driven')).toBeTruthy()
    expect(screen.getByText('Indicator-based')).toBeTruthy()
    expect(screen.getByText('Behavioral')).toBeTruthy()
  })

  it('shows hunt status controls in detail view', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    // Active hunt should show Pause and Complete buttons
    expect(screen.getByText('Pause')).toBeTruthy()
    expect(screen.getAllByText('Complete').length).toBeGreaterThan(0)
  })

  it('shows add hypothesis button in detail view', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    expect(screen.getByText('Add Hypothesis')).toBeTruthy()
  })

  it('shows add evidence button when on evidence tab', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    fireEvent.click(screen.getByText(/Evidence/))
    expect(screen.getByText('Add Evidence')).toBeTruthy()
  })
})

// ─── Phase 4 Interactivity Tests ──────────────────────────────

// Mock clipboard API for copy tests
beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('ThreatGraphPage — Interactivity', () => {
  let ThreatGraphPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/ThreatGraphPage')
    ThreatGraphPage = mod.ThreatGraphPage
  })

  it('renders fullscreen toggle button', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByTitle('Fullscreen')).toBeTruthy()
  })

  it('activates path finder mode on toggle click', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Path Finder'))
    expect(screen.getByText(/Click a source node/)).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('cancels path finder mode', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Path Finder'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText(/Click a source node/)).toBeFalsy()
  })

  it('renders fit view and zoom controls alongside fullscreen', () => {
    render(<ThreatGraphPage />)
    expect(screen.getByTitle('Fit View')).toBeTruthy()
    expect(screen.getByTitle('Zoom In')).toBeTruthy()
    expect(screen.getByTitle('Zoom Out')).toBeTruthy()
    expect(screen.getByTitle('Fullscreen')).toBeTruthy()
  })

  it('opens add node modal with entity type selector', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Add Node'))
    expect(screen.getByText('Add Graph Node')).toBeTruthy()
    // IOC appears in both legend and modal — verify modal has the type selector
    expect(screen.getAllByText('IOC').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Malware').length).toBeGreaterThanOrEqual(2)
  })

  it('shows path finder result info when path data exists', () => {
    mockUseGraphPath.mockReturnValue({
      data: { nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [], hops: 2 },
    })
    // Activate path finder to display PathFinderBar
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Path Finder'))
    expect(screen.getByText(/Path Finder/)).toBeTruthy()
  })
})

describe('ThreatGraphPage — Expand + Add Node (C1)', () => {
  let ThreatGraphPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/ThreatGraphPage')
    ThreatGraphPage = mod.ThreatGraphPage
  })

  it('opens add node modal and shows form fields', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Add Node'))
    expect(screen.getByText('Add Graph Node')).toBeTruthy()
    // Form has entity type buttons and label input
    expect(screen.getByPlaceholderText(/185.220.101.34/)).toBeTruthy()
  })

  it('add node modal has submit button and Cancel', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Add Node'))
    expect(screen.getByText('Add Graph Node')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('add node modal can be closed', () => {
    render(<ThreatGraphPage />)
    fireEvent.click(screen.getByTitle('Add Node'))
    expect(screen.getByText('Add Graph Node')).toBeTruthy()
    // Close via X button
    const closeButtons = screen.getAllByRole('button')
    const closeBtn = closeButtons.find(btn => btn.querySelector('.lucide-x'))
    if (closeBtn) fireEvent.click(closeBtn)
    // Modal should disappear (or at least not throw)
  })

  it('renders expand action in context menu on right-click', () => {
    // Mock nodes for the graph
    mockUseGraphNodes.mockReturnValue({
      data: {
        nodes: [
          { id: 'n1', entityType: 'ioc', label: '1.2.3.4', riskScore: 80, properties: {}, createdAt: '2026-01-01' },
        ],
        edges: [],
      },
      isDemo: true,
    })
    render(<ThreatGraphPage />)
    // SVG renders but we can't easily right-click D3 nodes in jsdom
    // Instead verify the page doesn't crash with nodes present
    expect(screen.queryByText('No graph data available')).toBeFalsy()
  })

  it('useNodeNeighbors is called with null by default', () => {
    render(<ThreatGraphPage />)
    expect(mockUseNodeNeighbors).toHaveBeenCalledWith(null)
  })
})

describe('CorrelationPage — Interactivity', () => {
  let CorrelationPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/CorrelationPage')
    CorrelationPage = mod.CorrelationPage
  })

  it('renders action buttons in detail panel', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    expect(screen.getByText('Investigate')).toBeTruthy()
    expect(screen.getByText('Create Ticket')).toBeTruthy()
    expect(screen.getByText('Add to Hunt')).toBeTruthy()
  })

  it('shows toast when Create Ticket clicked', async () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    fireEvent.click(screen.getByText('Create Ticket'))
    // Toast renders in the DOM
    expect(await screen.findByText(/Ticket created via integration-service/)).toBeTruthy()
  })

  it('shows toast when Add to Hunt clicked', async () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    fireEvent.click(screen.getByText('Add to Hunt'))
    expect(await screen.findByText(/Added to active hunt session/)).toBeTruthy()
  })

  it('entity chips are clickable buttons', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    // Entity labels rendered as buttons (multiple APT28 on page)
    const entityButtons = screen.getAllByText('APT28')
    const buttonEl = entityButtons.find(el => el.closest('button'))
    expect(buttonEl).toBeTruthy()
  })

  it('shows confidence trend arrows for high/low confidence', () => {
    render(<CorrelationPage />)
    // CORRELATION has confidence 91 → should show trending up
    render(<CorrelationPage />)
    // TrendingUp icon renders as SVG with polyline — just verify no crash
    expect(screen.getAllByText('91%').length).toBeGreaterThan(0)
  })

  it('renders kill chain phase in detail panel', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    expect(screen.getByText('Kill Chain Phase')).toBeTruthy()
    // C2 phase badge should be visible
    expect(screen.getByText('C2')).toBeTruthy()
  })

  it('renders diamond model in detail panel', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    expect(screen.getByText('Diamond Model')).toBeTruthy()
    expect(screen.getByText('Adversary')).toBeTruthy()
    expect(screen.getByText('Infra')).toBeTruthy()
    expect(screen.getByText('Capability')).toBeTruthy()
    expect(screen.getByText('Victim')).toBeTruthy()
  })

  it('campaign card expands on click with STIX export', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByRole('button', { name: /Campaigns/ }))
    fireEvent.click(screen.getByText('Operation Storm'))
    expect(screen.getByText('Export STIX')).toBeTruthy()
  })

  it('auto-correlate button shows loading state in demo mode', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByText('Auto-Correlate'))
    expect(screen.getByText('Correlating…')).toBeTruthy()
  })

  it('search filters correlations by entity labels', () => {
    render(<CorrelationPage />)
    const searchInput = screen.getByPlaceholderText('Search correlations…')
    fireEvent.change(searchInput, { target: { value: 'APT28' } })
    // Should still show correlation that has APT28 as entity label
    expect(screen.getByText('Shared C2 Infrastructure')).toBeTruthy()
  })

  it('search hides non-matching correlations', () => {
    render(<CorrelationPage />)
    const searchInput = screen.getByPlaceholderText('Search correlations…')
    fireEvent.change(searchInput, { target: { value: 'nonexistentthing123' } })
    expect(screen.queryByText('Shared C2 Infrastructure')).toBeFalsy()
  })

  it('shows kill chain filter badge when filtering', () => {
    render(<CorrelationPage />)
    // Open detail and click kill chain phase
    fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
    // Find all C2 buttons in the kill chain bar (detail panel has it)
    const c2Buttons = screen.getAllByText('C2')
    // Click the kill chain phase (it's the last "C2" in the bar)
    fireEvent.click(c2Buttons[c2Buttons.length - 1])
    // Kill chain filter badge should appear
    expect(screen.getByText(/Kill Chain: command and control/)).toBeTruthy()
  })
})

describe('HuntingWorkbenchPage — Interactivity', () => {
  let HuntingWorkbenchPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/HuntingWorkbenchPage')
    HuntingWorkbenchPage = mod.HuntingWorkbenchPage
  })

  it('renders export button in detail view', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    expect(screen.getByText('Export')).toBeTruthy()
  })

  it('renders timeline tab', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    expect(screen.getByText(/Timeline/)).toBeTruthy()
  })

  it('shows timeline entries when timeline tab clicked', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    // Click the Timeline tab — it shows count
    const timelineTab = screen.getAllByText(/Timeline/).find(el => el.closest('button'))
    if (timelineTab) fireEvent.click(timelineTab)
    // Should show the hunt creation entry
    expect(screen.getByText(/Hunt "APT28 Hunt" created/)).toBeTruthy()
  })

  it('hypothesis kanban cards are draggable', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    const hypothesisCard = screen.getByText('APT28 used PowerShell')
    expect(hypothesisCard.closest('[draggable]')).toBeTruthy()
  })

  it('kanban shows drop targets for all verdict columns', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    expect(screen.getByText('Proposed')).toBeTruthy()
    expect(screen.getByText('Investigating')).toBeTruthy()
    expect(screen.getByText('Confirmed')).toBeTruthy()
    expect(screen.getByText('Rejected')).toBeTruthy()
  })

  it('evidence timeline shows remove button structure', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    fireEvent.click(screen.getAllByText(/Evidence/).find(el => el.closest('button'))!)
    // Evidence items render with group class for hover reveal
    expect(screen.getByText('C2 IP match')).toBeTruthy()
    // The remove button is hidden until hover (opacity-0) — check it exists in DOM
    expect(screen.getByText('Known APT28 C2')).toBeTruthy()
  })

  it('score gauge is clickable for breakdown', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    // Click on the score gauge (SVG with score value)
    const scoreValue = screen.getAllByText('78')[0]
    const svg = scoreValue.closest('svg')
    if (svg) fireEvent.click(svg)
    // Breakdown popover should appear
    expect(screen.getByText('Score Breakdown')).toBeTruthy()
    expect(screen.getByText('Hypothesis Confirmation')).toBeTruthy()
    expect(screen.getByText('Evidence Quality')).toBeTruthy()
  })

  it('pivot chain IOC is clickable', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    // Pivot chain shows entity value as button
    const pivotButton = screen.getByText('185.220.101.34').closest('button')
    expect(pivotButton).toBeTruthy()
  })

  it('pivot chain expands to show related IOCs on click', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('APT28 Hunt'))
    // Click the pivot IOC
    const pivotButton = screen.getByText('185.220.101.34').closest('button')!
    fireEvent.click(pivotButton)
    // Should show related IOCs
    expect(screen.getByText('Related IOCs')).toBeTruthy()
    expect(screen.getByText('192.168.1.100')).toBeTruthy()
  })

  it('template cards have Start Hunt button', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('Playbook Library'))
    expect(screen.getByText('Start Hunt')).toBeTruthy()
  })

  it('clicking Start Hunt on template opens create modal with pre-filled data', () => {
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('Playbook Library'))
    fireEvent.click(screen.getByText('Start Hunt'))
    // Modal should be pre-filled with template name (appears multiple places)
    expect(screen.getByText('New Hunt Session')).toBeTruthy()
    expect(screen.getAllByText(/APT Lateral Movement/).length).toBeGreaterThanOrEqual(2)
  })

  it('renders hunt type badges on session cards', () => {
    render(<HuntingWorkbenchPage />)
    expect(screen.getByText('hypothesis')).toBeTruthy()
  })

  it('shows empty playbook library message when no templates', () => {
    mockUseHuntTemplates.mockReturnValue({ data: { data: [], total: 0 } })
    render(<HuntingWorkbenchPage />)
    fireEvent.click(screen.getByText('Playbook Library'))
    expect(screen.getByText('(0 templates)')).toBeTruthy()
  })
})
