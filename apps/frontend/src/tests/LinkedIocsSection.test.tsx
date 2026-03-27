import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { LinkedIocsSection } from '@/components/LinkedIocsSection'

const mockHook = vi.fn()

vi.mock('@/hooks/use-linked-iocs', () => ({
  useLinkedIocs: (...args: any[]) => mockHook(...args),
}))

const defaultReturn = {
  iocs: [
    { id: 'i1', iocType: 'ip', normalizedValue: '10.0.0.1', severity: 'critical', confidence: 90, relationship: 'attributed', lastSeen: '2025-03-20T00:00:00Z', source: 'global' },
    { id: 'i2', iocType: 'domain', normalizedValue: 'bad.com', severity: 'high', confidence: 75, relationship: 'used_by', lastSeen: '2025-03-18T00:00:00Z', source: 'private' },
    { id: 'i3', iocType: 'hash_sha256', normalizedValue: 'abc123def456', severity: 'medium', confidence: 60, relationship: 'drops', lastSeen: '2025-03-15T00:00:00Z', source: 'global' },
  ],
  totalCount: 3,
  filteredCount: 3,
  isLoading: false,
  isDemo: true,
  typeFilter: 'all',
  setTypeFilter: vi.fn(),
  sevFilter: 'all',
  setSevFilter: vi.fn(),
  sortKey: 'confidence' as const,
  setSortKey: vi.fn(),
  hasMore: false,
  loadMore: vi.fn(),
  typeBreakdown: { ip: 1, domain: 1, hash_sha256: 1 },
  sevBreakdown: { critical: 1, high: 1, medium: 1 },
}

describe('LinkedIocsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHook.mockReturnValue(defaultReturn)
  })

  it('renders IOC table with correct columns', () => {
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    const rows = screen.getAllByTestId('linked-ioc-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('10.0.0.1')
    expect(rows[0]).toHaveTextContent('critical')
    expect(rows[0]).toHaveTextContent('attributed')
  })

  it('type filter calls setTypeFilter', () => {
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    fireEvent.click(screen.getByTestId('type-filter-ip'))
    expect(defaultReturn.setTypeFilter).toHaveBeenCalledWith('ip')
  })

  it('severity filter calls setSevFilter', () => {
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    fireEvent.click(screen.getByTestId('sev-filter-critical'))
    expect(defaultReturn.setSevFilter).toHaveBeenCalledWith('critical')
  })

  it('click IOC row calls onIocClick', () => {
    const onIocClick = vi.fn()
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" onIocClick={onIocClick} />)
    fireEvent.click(screen.getAllByTestId('linked-ioc-row')[0])
    expect(onIocClick).toHaveBeenCalledWith('i1')
  })

  it('relationship column shows correct label', () => {
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    const rows = screen.getAllByTestId('linked-ioc-row')
    expect(rows[0]).toHaveTextContent('attributed')
    expect(rows[1]).toHaveTextContent('used_by')
    expect(rows[2]).toHaveTextContent('drops')
  })

  it('summary bar shows type + severity breakdown', () => {
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    const summary = screen.getByTestId('linked-iocs-summary')
    expect(summary).toHaveTextContent('IP')
    expect(summary).toHaveTextContent('DOMAIN')
    expect(summary).toHaveTextContent('critical')
  })

  it('load more button shows when hasMore=true', () => {
    mockHook.mockReturnValue({ ...defaultReturn, hasMore: true })
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    const btn = screen.getByTestId('load-more-iocs')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(defaultReturn.loadMore).toHaveBeenCalled()
  })

  it('empty state when no IOCs linked', () => {
    mockHook.mockReturnValue({ ...defaultReturn, iocs: [], totalCount: 0, filteredCount: 0, typeBreakdown: {}, sevBreakdown: {} })
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    expect(screen.getByTestId('linked-iocs-empty')).toHaveTextContent('No IOCs linked to APT29')
  })

  it('header shows total count badge', () => {
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    const header = screen.getByTestId('linked-iocs-header')
    expect(header).toHaveTextContent('3')
  })

  it('demo fallback renders with Demo badge', () => {
    render(<LinkedIocsSection entityId="a1" entityType="actor" entityName="APT29" />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })
})
