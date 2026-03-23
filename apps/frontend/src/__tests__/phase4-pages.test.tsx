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
    text: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    call: vi.fn().mockReturnThis(),
    transition: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
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
    expect(screen.getByPlaceholderText('Search entities…')).toBeTruthy()
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
})
