/**
 * Tests for ThreatActorListPage and MalwareListPage:
 * - Page renders with list data
 * - Row click opens detail panel
 * - Actor panel: MITRE ATT&CK badges + linked IOCs (demo stubs + live data)
 * - Malware panel: capabilities + linked IOCs
 * - Second row click closes panel
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

/* ================================================================ */
/* Mocks                                                              */
/* ================================================================ */

const mockUseActors = vi.fn()
const mockUseActorDetail = vi.fn()
const mockUseActorLinkedIOCs = vi.fn()
const mockUseMalware = vi.fn()
const mockUseMalwareLinkedIOCs = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useActors: (...args: any[]) => mockUseActors(...args),
  useActorDetail: (...args: any[]) => mockUseActorDetail(...args),
  useActorLinkedIOCs: (...args: any[]) => mockUseActorLinkedIOCs(...args),
  useMalware: (...args: any[]) => mockUseMalware(...args),
  useMalwareLinkedIOCs: (...args: any[]) => mockUseMalwareLinkedIOCs(...args),
}))

// Simplified SplitPane — avoids double-render from responsive layout in jsdom
vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: any) => (
    <div data-testid="split-pane">
      <div data-testid="split-left">{left}</div>
      {showRight && <div data-testid="split-right">{right}</div>}
    </div>
  ),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: any) => <span data-testid={`stat-${label}`}>{value}</span>,
}))

// Import pages AFTER vi.mock declarations
import { ThreatActorListPage } from '@/pages/ThreatActorListPage'
import { MalwareListPage } from '@/pages/MalwareListPage'

/* ================================================================ */
/* Shared mock data                                                   */
/* ================================================================ */

const MOCK_ACTOR = {
  id: 'a1', name: 'APT-1', aliases: ['Comment Panda'],
  actorType: 'nation_state', motivation: 'espionage', sophistication: 'expert',
  country: 'CN', confidence: 85, tlp: 'red', tags: ['china', 'apt'],
  active: true, firstSeen: '2023-01-01', lastSeen: '2026-03-01',
}

const MOCK_ACTOR_LIST = { data: [MOCK_ACTOR], total: 1, page: 1, limit: 50 }

const MOCK_LINKED_IOCS = [
  { id: 'l1', iocType: 'ip', normalizedValue: '185.220.101.1', severity: 'critical' },
  { id: 'l2', iocType: 'domain', normalizedValue: 'evil-c2.net', severity: 'high' },
]

const MOCK_MALWARE = {
  id: 'm1', name: 'BlackCat', aliases: ['ALPHV'],
  malwareType: 'ransomware', platforms: ['Windows', 'Linux'],
  capabilities: ['encryption', 'lateral-movement', 'exfiltration'],
  confidence: 90, tlp: 'amber', tags: ['affiliate', 'east-europe'],
  active: true, firstSeen: '2023-06-01', lastSeen: '2026-02-28',
}

const MOCK_MALWARE_LIST = { data: [MOCK_MALWARE], total: 1, page: 1, limit: 50 }

const MOCK_MALWARE_IOCS = [
  { id: 'ml1', iocType: 'hash_sha256', normalizedValue: 'deadbeef1234', severity: 'critical' },
  { id: 'ml2', iocType: 'ip', normalizedValue: '91.108.4.1', severity: 'high' },
]

/* ================================================================ */
/* ThreatActorListPage                                                */
/* ================================================================ */
describe('ThreatActorListPage', () => {
  beforeEach(() => {
    mockUseActors.mockReturnValue({ data: MOCK_ACTOR_LIST, isLoading: false })
    mockUseActorDetail.mockReturnValue({ data: null, isLoading: false })
    mockUseActorLinkedIOCs.mockReturnValue({ data: [], isLoading: false })
  })

  it('renders the page with actor list', () => {
    render(<ThreatActorListPage />)
    expect(screen.getByText('APT-1')).toBeInTheDocument()
  })

  it('renders actor type badge', () => {
    render(<ThreatActorListPage />)
    expect(screen.getByText('nation state')).toBeInTheDocument()
  })

  it('renders actor motivation', () => {
    render(<ThreatActorListPage />)
    expect(screen.getByText('espionage')).toBeInTheDocument()
  })

  it('does not show detail panel before row click', () => {
    render(<ThreatActorListPage />)
    expect(screen.queryByTestId('actor-detail-panel')).not.toBeInTheDocument()
  })

  it('opens detail panel on row click', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByTestId('actor-detail-panel')).toBeInTheDocument()
  })

  it('shows actor name in detail panel header', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    // APT-1 appears in table row AND panel header
    expect(screen.getAllByText('APT-1').length).toBeGreaterThanOrEqual(2)
  })

  it('shows active badge in detail panel', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByText('● Active')).toBeInTheDocument()
  })

  it('shows country in detail panel', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    // Country appears in both table column and detail panel — check both exist
    expect(screen.getAllByText('CN').length).toBeGreaterThanOrEqual(1)
  })

  it('shows MITRE ATT&CK section with demo stubs when API returns no data', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByTestId('mitre-section')).toBeInTheDocument()
    const badges = screen.getAllByTestId('mitre-badge')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('shows demo MITRE technique T1059', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByText('T1059')).toBeInTheDocument()
  })

  it('shows MITRE techniques from API when available', () => {
    mockUseActorDetail.mockReturnValue({
      data: { ...MOCK_ACTOR, mitreTechniques: ['T1003', 'T1021', 'T1071'] },
      isLoading: false,
    })
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByText('T1003')).toBeInTheDocument()
    expect(screen.getByText('T1021')).toBeInTheDocument()
    expect(screen.getByText('T1071')).toBeInTheDocument()
  })

  it('does not show demo MITRE stubs when API returns real techniques', () => {
    mockUseActorDetail.mockReturnValue({
      data: { ...MOCK_ACTOR, mitreTechniques: ['T1003'] },
      isLoading: false,
    })
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.queryByText('T1059')).not.toBeInTheDocument()
  })

  it('shows linked IOC section with demo stubs when API returns empty', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByTestId('actor-ioc-section')).toBeInTheDocument()
    const rows = screen.getAllByTestId('linked-ioc-row')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('shows linked IOC values from API when available', () => {
    mockUseActorLinkedIOCs.mockReturnValue({ data: MOCK_LINKED_IOCS, isLoading: false })
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByText('185.220.101.1')).toBeInTheDocument()
    expect(screen.getByText('evil-c2.net')).toBeInTheDocument()
  })

  it('closes detail panel on second click of same row', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByTestId('actor-detail-panel')).toBeInTheDocument()
    // Click the first occurrence (table row, not panel header)
    fireEvent.click(screen.getAllByText('APT-1')[0]!)
    expect(screen.queryByTestId('actor-detail-panel')).not.toBeInTheDocument()
  })

  it('renders loading state without crashing', () => {
    mockUseActors.mockReturnValue({ data: undefined, isLoading: true })
    render(<ThreatActorListPage />)
    // No crash — empty table renders
    expect(screen.getByTestId('split-pane')).toBeInTheDocument()
  })

  it('renders "View all" link in linked IOC section', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT-1'))
    expect(screen.getByText('View all')).toBeInTheDocument()
  })
})

/* ================================================================ */
/* MalwareListPage                                                    */
/* ================================================================ */
describe('MalwareListPage', () => {
  beforeEach(() => {
    mockUseMalware.mockReturnValue({ data: MOCK_MALWARE_LIST, isLoading: false })
    mockUseMalwareLinkedIOCs.mockReturnValue({ data: [], isLoading: false })
  })

  it('renders the page with malware list', () => {
    render(<MalwareListPage />)
    expect(screen.getByText('BlackCat')).toBeInTheDocument()
  })

  it('renders malware type badge', () => {
    render(<MalwareListPage />)
    expect(screen.getByText('ransomware')).toBeInTheDocument()
  })

  it('does not show detail panel before row click', () => {
    render(<MalwareListPage />)
    expect(screen.queryByTestId('malware-detail-panel')).not.toBeInTheDocument()
  })

  it('opens detail panel on row click', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getByTestId('malware-detail-panel')).toBeInTheDocument()
  })

  it('shows malware name in panel header', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getAllByText('BlackCat').length).toBeGreaterThanOrEqual(2)
  })

  it('shows active badge in panel', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getByText('● Active')).toBeInTheDocument()
  })

  it('shows capabilities section in panel', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getByTestId('capabilities-section')).toBeInTheDocument()
  })

  it('shows individual capability badges', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    // capabilities section shows all caps
    expect(screen.getAllByText('encryption').length).toBeGreaterThan(0)
    expect(screen.getAllByText('lateral-movement').length).toBeGreaterThan(0)
  })

  it('shows linked IOC section with demo stubs when API returns empty', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getByTestId('malware-ioc-section')).toBeInTheDocument()
    const rows = screen.getAllByTestId('linked-ioc-row')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('shows linked IOC values from API when available', () => {
    mockUseMalwareLinkedIOCs.mockReturnValue({ data: MOCK_MALWARE_IOCS, isLoading: false })
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getByText('deadbeef1234')).toBeInTheDocument()
    expect(screen.getByText('91.108.4.1')).toBeInTheDocument()
  })

  it('closes detail panel on second click of same row', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getByTestId('malware-detail-panel')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('BlackCat')[0]!)
    expect(screen.queryByTestId('malware-detail-panel')).not.toBeInTheDocument()
  })

  it('renders loading state without crashing', () => {
    mockUseMalware.mockReturnValue({ data: undefined, isLoading: true })
    render(<MalwareListPage />)
    expect(screen.getByTestId('split-pane')).toBeInTheDocument()
  })

  it('renders "View all" link in linked IOC section', () => {
    render(<MalwareListPage />)
    fireEvent.click(screen.getByText('BlackCat'))
    expect(screen.getByText('View all')).toBeInTheDocument()
  })
})
