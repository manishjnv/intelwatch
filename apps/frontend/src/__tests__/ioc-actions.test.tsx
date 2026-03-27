/**
 * Tests for IocListPage export functionality:
 * export button, dropdown, CSV/JSON/STIX downloads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Shared mock data ─────────────────────────────────────────────
const IOC_ROWS = [
  { id: 'i1', normalizedValue: '1.2.3.4', iocType: 'ip', severity: 'critical', confidence: 85, lifecycle: 'active', tlp: 'amber', tags: [], firstSeen: '2024-01-01T00:00:00Z', lastSeen: '2024-03-01T00:00:00Z', campaignId: null, threatActors: [], malwareFamilies: [], enrichmentData: null, sightingSources: [] },
  { id: 'i2', normalizedValue: 'evil.com', iocType: 'domain', severity: 'high', confidence: 70, lifecycle: 'active', tlp: 'white', tags: [], firstSeen: '2024-01-02T00:00:00Z', lastSeen: '2024-03-02T00:00:00Z', campaignId: null, threatActors: [], malwareFamilies: [], enrichmentData: null, sightingSources: [] },
  { id: 'i3', normalizedValue: 'http://bad.url/path', iocType: 'url', severity: 'medium', confidence: 55, lifecycle: 'aging', tlp: 'green', tags: [], firstSeen: '2024-01-03T00:00:00Z', lastSeen: '2024-03-03T00:00:00Z', campaignId: null, threatActors: [], malwareFamilies: [], enrichmentData: null, sightingSources: [] },
]

// ─── Hook mocks ──────────────────────────────────────────────────
vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs:               vi.fn(() => ({ data: { data: IOC_ROWS, total: 3 }, isLoading: false, isDemo: false })),
  useIOCStats:           vi.fn(() => ({ data: { total: 3, bySeverity: { critical: 1 }, byLifecycle: { active: 2 } } })),
  useIOCPivot:           vi.fn(() => ({ data: null, isLoading: false })),
  useIOCTimeline:        vi.fn(() => ({ data: null, isLoading: false })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: unknown) => v,
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useIOCEnrichment: vi.fn(() => ({ data: null })),
}))

vi.mock('@/hooks/use-phase4-data', () => ({
  useNodeNeighbors: vi.fn(() => ({ data: null, isLoading: false })),
}))

// ─── UI mocks ─────────────────────────────────────────────────────
vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => <div data-testid="toast-container" />,
}))

vi.mock('@/components/data/DataTable', () => ({
  DataTable: ({ data }: any) => (
    <div data-testid="data-table">
      {data.map((row: any) => <div key={row.id} data-testid={`row-${row.id}`}>{row.normalizedValue}</div>)}
    </div>
  ),
}))

vi.mock('@/components/data/FilterBar', () => ({
  FilterBar: ({ children }: any) => <div data-testid="filter-bar">{children}</div>,
}))

vi.mock('@/components/data/Pagination',    () => ({ Pagination:    () => <div /> }))
vi.mock('@/components/data/TableSkeleton', () => ({ TableSkeleton: () => <div data-testid="table-skeleton" /> }))

vi.mock('@etip/shared-ui/components/EntityChip',   () => ({ EntityChip:   ({ value }: any) => <span>{value}</span> }))
vi.mock('@etip/shared-ui/components/SeverityBadge',() => ({ SeverityBadge:({ severity }: any) => <span>{severity}</span> }))

vi.mock('@/components/viz/EntityPreview',      () => ({ EntityPreview:      ({ children }: any) => <>{children}</> }))
vi.mock('@/components/viz/SplitPane',          () => ({ SplitPane:          ({ left }: any) => <div>{left}</div> }))
vi.mock('@/components/viz/QuickActionToolbar', () => ({ QuickActionToolbar: () => <div /> }))
vi.mock('@/components/viz/SparklineCell',      () => ({ SparklineCell: () => <span />, generateStubTrend: () => [] }))
vi.mock('@/pages/IocDetailPanel',              () => ({ IocDetailPanel: () => <div data-testid="ioc-detail-panel" /> }))

import { IocListPage } from '@/pages/IocListPage'

// ─────────────────────────────────────────────────────────────────

// Helpers for download spy
let createdAnchor: any
let blobContent: string

function setupDownloadSpy() {
  createdAnchor = { click: vi.fn(), download: '', href: '' }
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') return createdAnchor as any
    return origCreate(tag)
  })
  // jsdom has no URL.createObjectURL — define it
  if (!URL.createObjectURL) (URL as any).createObjectURL = vi.fn()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const OrigBlob = globalThis.Blob
  vi.spyOn(globalThis, 'Blob').mockImplementation((parts: any[]) => {
    blobContent = parts?.[0] as string ?? ''
    return new OrigBlob(parts)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  blobContent = ''
  createdAnchor = null
})

// ─── Export button ────────────────────────────────────────────────

describe('IocListPage — export button', () => {
  it('export button renders with correct testid', () => {
    render(<IocListPage />)
    expect(screen.getByTestId('export-iocs-btn')).toBeTruthy()
  })

  it('clicking export button shows the dropdown', () => {
    render(<IocListPage />)
    expect(screen.queryByTestId('export-dropdown')).toBeNull()
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    expect(screen.getByTestId('export-dropdown')).toBeTruthy()
  })

  it('dropdown contains CSV, JSON, and STIX options', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    const dropdown = screen.getByTestId('export-dropdown')
    expect(dropdown.textContent).toContain('CSV')
    expect(dropdown.textContent).toContain('JSON')
    expect(dropdown.textContent).toContain('STIX')
  })

  it('clicking export button again closes the dropdown (toggle)', () => {
    render(<IocListPage />)
    const btn = screen.getByTestId('export-iocs-btn')
    fireEvent.click(btn)
    expect(screen.getByTestId('export-dropdown')).toBeTruthy()
    fireEvent.click(btn)
    expect(screen.queryByTestId('export-dropdown')).toBeNull()
  })
})

// ─── CSV export ───────────────────────────────────────────────────

describe('IocListPage — CSV export', () => {
  it('CSV export creates anchor with .csv extension', () => {
    setupDownloadSpy()
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    fireEvent.click(screen.getByText('CSV'))
    expect(createdAnchor.download).toBe('iocs.csv')
    expect(createdAnchor.click).toHaveBeenCalled()
  })

  it('CSV content has the correct header columns', () => {
    setupDownloadSpy()
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    fireEvent.click(screen.getByText('CSV'))
    expect(blobContent).toContain('type,value,severity,confidence,lifecycle,firstSeen,lastSeen,tags')
  })

  it('dropdown closes after CSV export', () => {
    setupDownloadSpy()
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    fireEvent.click(screen.getByText('CSV'))
    expect(screen.queryByTestId('export-dropdown')).toBeNull()
  })
})

// ─── JSON export ──────────────────────────────────────────────────

describe('IocListPage — JSON export', () => {
  it('JSON export creates anchor with .json extension', () => {
    setupDownloadSpy()
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    fireEvent.click(screen.getByText('JSON'))
    expect(createdAnchor.download).toBe('iocs.json')
    expect(createdAnchor.click).toHaveBeenCalled()
  })

  it('dropdown closes after JSON export', () => {
    setupDownloadSpy()
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    fireEvent.click(screen.getByText('JSON'))
    expect(screen.queryByTestId('export-dropdown')).toBeNull()
  })
})

// ─── STIX export ──────────────────────────────────────────────────

describe('IocListPage — STIX export', () => {
  it('STIX export creates anchor with stix in filename', () => {
    setupDownloadSpy()
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    fireEvent.click(screen.getByText('STIX 2.1 Bundle'))
    expect(createdAnchor.download).toContain('stix')
    expect(createdAnchor.click).toHaveBeenCalled()
  })

  it('STIX bundle content has type=bundle', () => {
    setupDownloadSpy()
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('export-iocs-btn'))
    fireEvent.click(screen.getByText('STIX 2.1 Bundle'))
    expect(blobContent).toContain('"type": "bundle"')
  })
})
