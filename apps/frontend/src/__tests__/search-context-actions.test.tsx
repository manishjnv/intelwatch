/**
 * Tests for SearchPage integration — context menu, multi-select, bulk actions, expandable rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock hooks and components ──────────────────────────────

const mockUseEsSearch = vi.fn()

vi.mock('@/hooks/use-es-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-es-search')>()
  return { ...actual, useEsSearch: () => mockUseEsSearch() }
})

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector?: (s: { user: { tenantId: string } }) => unknown) =>
    selector ? selector({ user: { tenantId: 'test-tenant' } }) : ({ user: { tenantId: 'test-tenant' } }),
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CompactStat: ({ value }: { label: string; value: string }) => <span>{value}</span>,
}))

vi.mock('@/pages/IocDetailPanel', () => ({
  IocDetailPanel: ({ record }: { record: { normalizedValue: string } }) => <div data-testid="ioc-detail-panel">{record.normalizedValue}</div>,
}))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: { left: React.ReactNode; right: React.ReactNode; showRight: boolean }) => (
    <div data-testid="split-pane">{left}{showRight && right}</div>
  ),
}))

vi.mock('@/components/ioc/IocContextMenu', () => ({
  IocContextMenu: ({ ioc, position }: { ioc: unknown; position: unknown }) => (
    ioc && position ? <div data-testid="context-menu">Context Menu</div> : null
  ),
}))

vi.mock('@/components/viz/QuickActionToolbar', () => ({
  QuickActionToolbar: ({ selectedCount }: { selectedCount: number }) => (
    selectedCount > 0 ? <div data-testid="quick-action-toolbar">{selectedCount} selected</div> : null
  ),
}))

vi.mock('@/components/ioc/IocComparePanel', () => ({
  IocComparePanel: ({ records }: { records: unknown[] }) => <div data-testid="compare-panel">{records.length} IOCs</div>,
}))

vi.mock('@/components/ioc/InlineEnrichmentRow', () => ({
  InlineEnrichmentRow: () => <div data-testid="inline-enrichment">Enrichment Row</div>,
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
}))

import { SearchPage } from '@/pages/SearchPage'
import { DEMO_ES_RESULTS } from '@/hooks/use-es-search'

// ─── Helpers ────────────────────────────────────────────────

const DEFAULT_HOOK = {
  query: 'test',
  setQuery: vi.fn(),
  filters: {},
  setFilters: vi.fn(),
  sortBy: 'relevance',
  setSortBy: vi.fn(),
  page: 1,
  setPage: vi.fn(),
  pageSize: 50,
  setPageSize: vi.fn(),
  results: DEMO_ES_RESULTS.slice(0, 5),
  totalCount: 5,
  facets: {
    byType: [{ key: 'ip', count: 3 }, { key: 'domain', count: 2 }],
    bySeverity: [{ key: 'critical', count: 3 }, { key: 'high', count: 2 }],
    byTlp: [{ key: 'RED', count: 3 }],
  },
  isLoading: false,
  isDemo: false,
  error: null,
  searchTimeMs: 12,
  clearAll: vi.fn(),
  exportResults: vi.fn(),
  selectedIds: new Set<string>(),
  toggleSelection: vi.fn(),
  clearSelection: vi.fn(),
  toggleSelectAll: vi.fn(),
  bulkSearch: vi.fn(),
}

describe('SearchPage — context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseEsSearch.mockReturnValue(DEFAULT_HOOK)
    localStorage.clear()
  })

  it('renders search stats bar with results', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('search-stats-bar')).toBeInTheDocument()
  })

  it('renders table view by default', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('search-results-table')).toBeInTheDocument()
  })

  it('switches to card view', () => {
    render(<SearchPage />)
    fireEvent.click(screen.getByTestId('view-card'))
    expect(screen.getByTestId('card-view')).toBeInTheDocument()
  })

  it('shows bulk search button', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('bulk-search-btn')).toBeInTheDocument()
  })

  it('opens bulk search modal', () => {
    render(<SearchPage />)
    fireEvent.click(screen.getByTestId('bulk-search-btn'))
    expect(screen.getByTestId('bulk-search-modal')).toBeInTheDocument()
  })

  it('shows saved searches button', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('saved-searches-btn')).toBeInTheDocument()
  })

  it('opens saved searches panel', () => {
    render(<SearchPage />)
    fireEvent.click(screen.getByTestId('saved-searches-btn'))
    expect(screen.getByTestId('saved-searches-panel')).toBeInTheDocument()
  })

  it('renders select-all checkbox', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument()
  })

  it('renders row checkboxes', () => {
    render(<SearchPage />)
    expect(screen.getAllByTestId('row-checkbox').length).toBe(5)
  })

  it('renders expand buttons', () => {
    render(<SearchPage />)
    expect(screen.getAllByTestId('expand-row-btn').length).toBe(5)
  })

  it('shows quick action toolbar when items selected', () => {
    mockUseEsSearch.mockReturnValue({ ...DEFAULT_HOOK, selectedIds: new Set(['es-1', 'es-2']) })
    render(<SearchPage />)
    expect(screen.getByTestId('quick-action-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('quick-action-toolbar')).toHaveTextContent('2 selected')
  })

  it('does not show toolbar when nothing selected', () => {
    render(<SearchPage />)
    expect(screen.queryByTestId('quick-action-toolbar')).not.toBeInTheDocument()
  })

  it('renders view toggle', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
  })

  it('shows sort and page size selects', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('sort-select')).toBeInTheDocument()
    expect(screen.getByTestId('page-size-select')).toBeInTheDocument()
  })

  it('shows export button and menu', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('export-btn')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('export-btn'))
    expect(screen.getByTestId('export-menu')).toBeInTheDocument()
  })
})
