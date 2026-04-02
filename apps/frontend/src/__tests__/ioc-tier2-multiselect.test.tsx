/**
 * @module __tests__/ioc-tier2-multiselect.test
 * @description Tier 2 tests: multi-select checkboxes, bulk actions toolbar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const MOCK_IOCS = [
  { id: 'ioc-1', iocType: 'ip', normalizedValue: '1.2.3.4', severity: 'critical', confidence: 92, lifecycle: 'active', tlp: 'red', tags: ['apt'], threatActors: [], malwareFamilies: [], firstSeen: '2026-04-01T10:00:00Z', lastSeen: '2026-04-02T08:00:00Z', corroborationCount: 3 },
  { id: 'ioc-2', iocType: 'domain', normalizedValue: 'evil.xyz', severity: 'high', confidence: 75, lifecycle: 'active', tlp: 'amber', tags: [], threatActors: [], malwareFamilies: [], firstSeen: '2026-03-30T14:00:00Z', lastSeen: '2026-04-01T12:00:00Z' },
  { id: 'ioc-3', iocType: 'hash_sha256', normalizedValue: 'a1b2c3d4e5f6', severity: 'medium', confidence: 55, lifecycle: 'new', tlp: 'green', tags: [], threatActors: [], malwareFamilies: [], firstSeen: '2026-04-02T06:00:00Z', lastSeen: '2026-04-02T06:00:00Z' },
]

const mockMutate = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: () => ({ data: { data: MOCK_IOCS, total: 3, page: 1, limit: 50 }, isLoading: false, isDemo: false }),
  useIOCStats: () => ({ data: { total: 3, byType: {}, bySeverity: {}, byLifecycle: {} } }),
  useUpdateIOCLifecycle: () => ({ mutate: mockMutate }),
}))
vi.mock('@/hooks/use-enrichment-data', () => ({ useEnrichmentStats: () => ({ data: null }) }))
vi.mock('@/hooks/use-campaigns', () => ({ useCampaigns: () => ({ data: { data: [] } }) }))
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (v: string) => v }))
vi.mock('@etip/shared-ui/components/EntityChip', () => ({ EntityChip: ({ value }: { value: string }) => <span>{value}</span> }))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({ SeverityBadge: ({ severity }: { severity: string }) => <span>{severity}</span> }))
vi.mock('@/components/viz/EntityPreview', () => ({ EntityPreview: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left }: { left: React.ReactNode }) => <div data-testid="split-pane">{left}</div>,
}))
vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn(), ToastContainer: () => null }))
vi.mock('@/components/data/FilterBar', () => ({
  FilterBar: ({ children }: { children?: React.ReactNode }) => <div data-testid="filter-bar">{children}</div>,
}))
vi.mock('@/components/data/TableSkeleton', () => ({ TableSkeleton: () => <div /> }))
vi.mock('@/components/data/Pagination', () => ({ Pagination: () => <div /> }))
vi.mock('./IocDetailPanel', () => ({ IocDetailPanel: () => <div /> }))
vi.mock('@/components/campaigns/CampaignPanel', () => ({ CampaignPanel: () => null }))
vi.mock('@/components/ioc/IocStatsCards', () => ({ IocStatsCards: () => <div data-testid="ioc-stats-cards" /> }))
vi.mock('@/components/ioc/SavedFilterPresets', () => ({ SavedFilterPresets: () => <div data-testid="saved-views" /> }))
vi.mock('@/components/ioc/CreateIocModal', () => ({ CreateIocModal: () => null }))
vi.mock('@/components/ioc/IocContextMenu', () => ({ IocContextMenu: () => null }))

import { IocListPage } from '@/pages/IocListPage'

beforeEach(() => { mockMutate.mockClear() })

describe('IocListPage — Tier 2 Multi-Select', () => {
  it('renders checkbox column with select-all header', () => {
    render(<IocListPage />)
    expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument()
  })

  it('renders row checkboxes for each IOC', () => {
    render(<IocListPage />)
    expect(screen.getByTestId('row-checkbox-ioc-1')).toBeInTheDocument()
    expect(screen.getByTestId('row-checkbox-ioc-2')).toBeInTheDocument()
    expect(screen.getByTestId('row-checkbox-ioc-3')).toBeInTheDocument()
  })

  it('toggles row checkbox on click', () => {
    render(<IocListPage />)
    const cb = screen.getByTestId('row-checkbox-ioc-1') as HTMLInputElement
    expect(cb.checked).toBe(false)
    fireEvent.click(cb)
    expect(cb.checked).toBe(true)
    fireEvent.click(cb)
    expect(cb.checked).toBe(false)
  })

  it('shows quick action toolbar when rows are selected', () => {
    render(<IocListPage />)
    // Select two rows to trigger bulk actions
    fireEvent.click(screen.getByTestId('row-checkbox-ioc-1'))
    fireEvent.click(screen.getByTestId('row-checkbox-ioc-2'))
    expect(screen.getByTestId('quick-action-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('selection-count')).toHaveTextContent('2 selected')
  })

  it('select-all checkbox toggles all rows on page', () => {
    render(<IocListPage />)
    const selectAll = screen.getByTestId('select-all-checkbox') as HTMLInputElement
    fireEvent.click(selectAll)
    // All 3 should be checked
    expect((screen.getByTestId('row-checkbox-ioc-1') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('row-checkbox-ioc-2') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('row-checkbox-ioc-3') as HTMLInputElement).checked).toBe(true)
  })

  it('clears selection via toolbar clear button', () => {
    render(<IocListPage />)
    fireEvent.click(screen.getByTestId('row-checkbox-ioc-1'))
    fireEvent.click(screen.getByTestId('row-checkbox-ioc-2'))
    expect(screen.getByTestId('quick-action-toolbar')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('action-clear'))
    expect((screen.getByTestId('row-checkbox-ioc-1') as HTMLInputElement).checked).toBe(false)
  })

  it('shows "+ IOC" button in filter bar area', () => {
    render(<IocListPage />)
    expect(screen.getByTestId('add-ioc-btn')).toBeInTheDocument()
  })

  it('shows saved views button in filter bar area', () => {
    render(<IocListPage />)
    expect(screen.getByTestId('saved-views')).toBeInTheDocument()
  })
})
