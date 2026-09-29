/**
 * @module __tests__/honest-search-iocs
 * @description DECISION-048 honest-UI coverage for /search (useEsSearch) and the
 * /iocs feed count: a real tenant never sees demo IOCs or a fabricated "12 active
 * feeds" figure — only real data, an honest empty state, or an error card with Retry.
 *
 * useEsSearch's own real-API contract (no demo swap, isError + refetch on rejection)
 * is covered in __tests__/use-es-search.test.ts. This file covers the two page-level
 * consumers with hook-level mocks — the established pattern for these pages (see
 * __tests__/session76-detail-drilldown.test.tsx and tests/SearchPage.test.tsx) — so
 * page rendering isn't coupled to every sibling hook's real API shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── SearchPage — hook-level mock, honest empty/error/no-demo-chip ─────────

const mockUseEsSearch = vi.fn()
vi.mock('@/hooks/use-es-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-es-search')>()
  return { ...actual, useEsSearch: () => mockUseEsSearch() }
})

vi.mock('@/pages/IocDetailPanel', () => ({
  IocDetailPanel: ({ record }: { record: { normalizedValue: string } }) => <div data-testid="ioc-detail-panel">{record.normalizedValue}</div>,
}))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: { left: React.ReactNode; right: React.ReactNode; showRight: boolean }) => (
    <div data-testid="split-pane">{left}{showRight && right}</div>
  ),
}))

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn(), ToastContainer: () => null }))

import { SearchPage } from '@/pages/SearchPage'
import { DEMO_ES_RESULTS } from '@/hooks/use-es-search'

const SEARCH_HOOK_BASE = {
  query: '', setQuery: vi.fn(), filters: {}, setFilters: vi.fn(),
  sortBy: 'relevance', setSortBy: vi.fn(), page: 1, setPage: vi.fn(),
  pageSize: 50, setPageSize: vi.fn(),
  results: [] as typeof DEMO_ES_RESULTS, totalCount: 0,
  facets: { byType: [], bySeverity: [], byTlp: [] },
  isLoading: false, isError: false, refetch: vi.fn(), error: null, searchTimeMs: 0,
  clearAll: vi.fn(), exportResults: vi.fn(),
  selectedIds: new Set<string>(), toggleSelection: vi.fn(), clearSelection: vi.fn(),
  toggleSelectAll: vi.fn(), bulkSearch: vi.fn(),
}

describe('SearchPage — no demo chip, honest empty/error states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('never renders a "demo" indicator even with 20 fixture-shaped results', () => {
    mockUseEsSearch.mockReturnValue({ ...SEARCH_HOOK_BASE, query: 'test', results: DEMO_ES_RESULTS, totalCount: DEMO_ES_RESULTS.length })
    render(<SearchPage />)
    expect(screen.queryByText('demo')).not.toBeInTheDocument()
  })

  it('shows the honest table-view empty state on a no-match query', () => {
    mockUseEsSearch.mockReturnValue({ ...SEARCH_HOOK_BASE, query: 'zzz-nomatch', results: [], totalCount: 0 })
    render(<SearchPage />)
    expect(screen.getByTestId('results-empty')).toBeInTheDocument()
    expect(screen.getByText('No IOCs match your search')).toBeInTheDocument()
    expect(screen.queryByText('185.220.101.34')).not.toBeInTheDocument()
  })

  it('shows the honest card-view empty state on a no-match query', () => {
    mockUseEsSearch.mockReturnValue({ ...SEARCH_HOOK_BASE, query: 'zzz-nomatch', results: [], totalCount: 0 })
    render(<SearchPage />)
    fireEvent.click(screen.getByTestId('view-card'))
    expect(screen.getByTestId('search-no-results')).toBeInTheDocument()
    expect(screen.getByText('No results — try a different query')).toBeInTheDocument()
  })

  it('shows an error card with Retry when the search query rejects', () => {
    const refetch = vi.fn()
    mockUseEsSearch.mockReturnValue({ ...SEARCH_HOOK_BASE, query: 'test', isError: true, refetch, error: new Error('boom') })
    render(<SearchPage />)
    expect(screen.getByTestId('search-error-state')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('search-retry-btn'))
    expect(refetch).toHaveBeenCalled()
  })

  it('renders real results with no demo chip', () => {
    mockUseEsSearch.mockReturnValue({ ...SEARCH_HOOK_BASE, query: 'test', results: [DEMO_ES_RESULTS[0]!], totalCount: 1 })
    render(<SearchPage />)
    expect(screen.getByTestId('search-results-table')).toBeInTheDocument()
    expect(screen.queryByText('demo')).not.toBeInTheDocument()
  })
})

// ─── IocListPage — real feed count, not the hardcoded 12 ───────────────────

const mockUseIOCs = vi.fn()
const mockUseIOCStats = vi.fn()
const mockUseFeeds = vi.fn()
const mockUseUpdateIOCLifecycle = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: (...args: unknown[]) => mockUseIOCs(...args),
  useIOCStats: () => mockUseIOCStats(),
  useFeeds: (...args: unknown[]) => mockUseFeeds(...args),
  useUpdateIOCLifecycle: () => mockUseUpdateIOCLifecycle(),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useEnrichmentStats: () => ({ data: { total: 0, enriched: 0, pending: 0, failed: 0 } }),
}))

vi.mock('@/hooks/use-campaigns', () => ({
  useCampaigns: () => ({ data: { data: [], total: 0, page: 1, limit: 50 } }),
}))

import { IocListPage } from '@/pages/IocListPage'

const IOC_LIST_EMPTY = { data: [], total: 0, page: 1, limit: 50 }

function feedRow(id: string, status = 'active') {
  return {
    id, name: `Feed ${id}`, description: null, feedType: 'rss', url: null, schedule: null,
    status, enabled: true, lastFetchAt: null, lastErrorAt: null, lastErrorMessage: null,
    consecutiveFailures: 0, totalItemsIngested: 0, feedReliability: 100,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('IocListPage — real feed count (DECISION-048, not hardcoded 12)', () => {
  beforeEach(() => {
    mockUseIOCs.mockReturnValue({ data: IOC_LIST_EMPTY, isLoading: false, isDemo: false })
    mockUseIOCStats.mockReturnValue({ data: { total: 0, byType: {}, bySeverity: {}, byLifecycle: {} } })
    mockUseUpdateIOCLifecycle.mockReturnValue({ mutate: vi.fn() })
  })

  it('shows the real active-feed count from useFeeds, never 12', () => {
    mockUseFeeds.mockReturnValue({
      data: { data: [feedRow('f1'), feedRow('f2'), feedRow('f3', 'disabled')], total: 3, page: 1, limit: 100 },
      isLoading: false,
    })
    render(<IocListPage />)
    // 2 of 3 mocked feeds are 'active' — the old hardcoded value was 12
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })

  it('shows "—" for feed count while /feeds is still loading', () => {
    mockUseFeeds.mockReturnValue({ data: undefined, isLoading: true })
    render(<IocListPage />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })
})
