/**
 * Tests for SearchPage — assembly of SearchBar, FacetedSidebar, SearchResultsTable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock hook ──────────────────────────────────────────────

const mockUseEsSearch = vi.fn()

vi.mock('@/hooks/use-es-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-es-search')>()
  return { ...actual, useEsSearch: () => mockUseEsSearch() }
})

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector?: (s: { user: { tenantId: string } }) => unknown) =>
    selector ? selector({ user: { tenantId: 'test-tenant' } }) : ({ user: { tenantId: 'test-tenant' } }),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span data-testid={`stat-${label.toLowerCase()}`}>{value}</span>,
}))

import { SearchPage } from '@/pages/SearchPage'
import { DEMO_ES_RESULTS } from '@/hooks/use-es-search'

// ─── Helpers ────────────────────────────────────────────────

const DEFAULT_HOOK = {
  query: '',
  setQuery: vi.fn(),
  filters: {},
  setFilters: vi.fn(),
  sortBy: 'relevance',
  setSortBy: vi.fn(),
  page: 1,
  setPage: vi.fn(),
  pageSize: 50,
  setPageSize: vi.fn(),
  results: [],
  totalCount: 0,
  facets: { byType: [], bySeverity: [], byTlp: [] },
  isLoading: false,
  isDemo: false,
  error: null,
  searchTimeMs: 0,
  clearAll: vi.fn(),
  exportResults: vi.fn(),
}

// ─── Tests ──────────────────────────────────────────────────

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseEsSearch.mockReturnValue(DEFAULT_HOOK)
  })

  it('renders SearchBar, sidebar, and toolbar', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
    expect(screen.getByTestId('search-toolbar')).toBeInTheDocument()
  })

  it('shows initial state when no query and no results', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('initial-state')).toBeInTheDocument()
    expect(screen.getByText('Search across all threat intelligence')).toBeInTheDocument()
  })

  it('shows sort and page size dropdowns', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('sort-select')).toBeInTheDocument()
    expect(screen.getByTestId('page-size-select')).toBeInTheDocument()
  })

  it('shows export button', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('export-btn')).toBeInTheDocument()
  })

  it('export menu opens on click', () => {
    render(<SearchPage />)
    fireEvent.click(screen.getByTestId('export-btn'))
    expect(screen.getByTestId('export-menu')).toBeInTheDocument()
  })

  it('export CSV triggers exportResults', () => {
    const exportResults = vi.fn()
    mockUseEsSearch.mockReturnValue({ ...DEFAULT_HOOK, exportResults })
    render(<SearchPage />)
    fireEvent.click(screen.getByTestId('export-btn'))
    fireEvent.click(screen.getByText('Export CSV'))
    expect(exportResults).toHaveBeenCalledWith('csv')
  })

  it('shows demo banner when isDemo', () => {
    mockUseEsSearch.mockReturnValue({ ...DEFAULT_HOOK, isDemo: true, results: DEMO_ES_RESULTS, totalCount: 20 })
    render(<SearchPage />)
    expect(screen.getByText(/ES unavailable/)).toBeInTheDocument()
  })

  it('renders results table when results exist', () => {
    mockUseEsSearch.mockReturnValue({
      ...DEFAULT_HOOK,
      query: 'test',
      results: DEMO_ES_RESULTS.slice(0, 3),
      totalCount: 3,
      facets: {
        byType: [{ key: 'ip', count: 2 }],
        bySeverity: [{ key: 'critical', count: 2 }],
        byTlp: [{ key: 'RED', count: 2 }],
      },
    })
    render(<SearchPage />)
    expect(screen.getByTestId('search-results-table')).toBeInTheDocument()
  })

  it('sort dropdown triggers setSortBy', () => {
    const setSortBy = vi.fn()
    mockUseEsSearch.mockReturnValue({ ...DEFAULT_HOOK, setSortBy })
    render(<SearchPage />)
    fireEvent.change(screen.getByTestId('sort-select'), { target: { value: 'confidence_desc' } })
    expect(setSortBy).toHaveBeenCalledWith('confidence_desc')
  })

  it('page size dropdown triggers setPageSize', () => {
    const setPageSize = vi.fn()
    mockUseEsSearch.mockReturnValue({ ...DEFAULT_HOOK, setPageSize })
    render(<SearchPage />)
    fireEvent.change(screen.getByTestId('page-size-select'), { target: { value: '100' } })
    expect(setPageSize).toHaveBeenCalledWith(100)
  })

  it('mobile filter trigger is present', () => {
    render(<SearchPage />)
    expect(screen.getByTestId('mobile-filter-trigger')).toBeInTheDocument()
  })

  it('mobile filter trigger opens sidebar overlay', () => {
    render(<SearchPage />)
    fireEvent.click(screen.getByTestId('mobile-filter-trigger'))
    expect(screen.getByTestId('mobile-sidebar-overlay')).toBeInTheDocument()
  })

  it('renders demo fallback with 20 results', () => {
    mockUseEsSearch.mockReturnValue({
      ...DEFAULT_HOOK,
      isDemo: true,
      results: DEMO_ES_RESULTS,
      totalCount: DEMO_ES_RESULTS.length,
    })
    render(<SearchPage />)
    expect(screen.getAllByTestId('search-result-row').length).toBe(DEMO_ES_RESULTS.length)
  })
})
