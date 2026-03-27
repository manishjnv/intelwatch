/**
 * @module pages/SearchPage
 * @description Full-text IOC search page powered by Elasticsearch.
 * Features: faceted sidebar, sortable results table, URL-synced state,
 * saved searches, export, keyboard shortcuts, and demo fallback.
 */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEsSearch } from '@/hooks/use-es-search'
import { SearchBar } from '@/components/search/SearchBar'
import { FacetedSidebar, MobileFilterTrigger } from '@/components/search/FacetedSidebar'
import { SearchResultsTable } from '@/components/search/SearchResultsTable'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { Search, Download, ChevronDown, Database, Zap } from 'lucide-react'
import type { EsSearchFilters } from '@/hooks/use-es-search'

// ─── Constants ───────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'confidence_desc', label: 'Confidence ↓' },
  { value: 'severity_desc', label: 'Severity ↓' },
  { value: 'lastSeen_desc', label: 'Last Seen ↓' },
  { value: 'firstSeen_asc', label: 'First Seen ↑' },
]

const PAGE_SIZES = [25, 50, 100]

// ─── Component ───────────────────────────────────────────────

export function SearchPage() {
  const {
    query, setQuery, filters, setFilters, sortBy, setSortBy,
    page, setPage, pageSize, setPageSize,
    results, totalCount, facets, isLoading, isDemo, searchTimeMs,
    clearAll, exportResults,
  } = useEsSearch()

  const navigate = useNavigate()
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const handleRowClick = useCallback((id: string) => {
    // Find the clicked result to get its value for the IOC page
    const result = results.find(r => r.id === id)
    if (result) {
      navigate(`/iocs?search=${encodeURIComponent(result.value)}`)
    }
  }, [results, navigate])

  const activeFilterCount = (filters.type?.length ?? 0)
    + (filters.severity?.length ?? 0)
    + (filters.tlp?.length ?? 0)
    + (filters.enriched ? 1 : 0)
    + (filters.confidenceMin != null && filters.confidenceMin > 0 ? 1 : 0)

  const handleFilterChange = useCallback((partial: Partial<EsSearchFilters>) => {
    setFilters({ ...filters, ...partial })
  }, [filters, setFilters])

  const handleSearch = useCallback(() => {
    // Explicit search — no-op since debounce auto-searches
  }, [])

  const handleExport = useCallback((format: 'csv' | 'json') => {
    exportResults(format)
    setShowExportMenu(false)
  }, [exportResults])

  const hasQuery = query.trim().length > 0

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stats bar */}
      <PageStatsBar title="IOC Search" isDemo={isDemo}>
        <CompactStat label="Results" value={totalCount > 0 ? totalCount.toLocaleString() : '—'} />
        <CompactStat label="Engine" value="Elasticsearch" />
        <CompactStat label="Index" value={isDemo ? 'demo' : 'live'} highlight={!isDemo} />
      </PageStatsBar>

      {/* Search bar */}
      <div className="px-4 pt-4 pb-3">
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          onSearch={handleSearch}
          isLoading={isLoading}
        />
      </div>

      {/* Toolbar: sort + page size + export + mobile filter trigger */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <MobileFilterTrigger activeCount={activeFilterCount} onClick={() => setShowMobileSidebar(!showMobileSidebar)} />

        <div className="flex items-center gap-2 ml-auto">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-xs bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-text-secondary focus:outline-none focus:border-accent cursor-pointer"
            data-testid="sort-select"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Page size */}
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="text-xs bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-text-secondary focus:outline-none focus:border-accent cursor-pointer"
            data-testid="page-size-select"
          >
            {PAGE_SIZES.map(s => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1 text-xs bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
              data-testid="export-btn"
            >
              <Download className="w-3.5 h-3.5" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 min-w-[120px]" data-testid="export-menu">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-bg-hover transition-colors rounded-t-lg"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-bg-hover transition-colors rounded-b-lg"
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Demo banner */}
        {isDemo && (
          <span className="text-[11px] text-accent/70 bg-accent/5 px-2 py-1 rounded border border-accent/15">
            ES unavailable — showing demo results
          </span>
        )}
      </div>

      {/* Main content: sidebar + results */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop sidebar */}
        <FacetedSidebar
          facets={facets}
          activeFilters={filters}
          onFilterChange={handleFilterChange}
          onClearAll={clearAll}
          className="w-[250px] shrink-0 hidden md:flex"
        />

        {/* Mobile sidebar overlay */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-40 md:hidden" data-testid="mobile-sidebar-overlay">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)} />
            <FacetedSidebar
              facets={facets}
              activeFilters={filters}
              onFilterChange={handleFilterChange}
              onClearAll={clearAll}
              className="absolute left-0 top-0 bottom-0 w-[280px] bg-bg-base z-50 shadow-xl"
            />
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {!hasQuery && !isDemo && results.length === 0 ? (
            <InitialState />
          ) : (
            <SearchResultsTable
              results={results}
              totalCount={totalCount}
              page={page}
              pageSize={pageSize}
              sortBy={sortBy}
              onSort={setSortBy}
              onPageChange={setPage}
              onRowClick={handleRowClick}
              searchTimeMs={searchTimeMs}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Initial state (no query) ────────────────────────────────

function InitialState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-5" data-testid="initial-state">
      <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center">
        <Search className="w-10 h-10 text-accent" />
      </div>
      <div>
        <p className="text-base font-medium text-text-primary">Search across all threat intelligence</p>
        <p className="text-sm text-text-muted mt-1.5">
          Search IOCs by value, type, tag, or description
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-xs justify-center">
        {[
          { icon: <Database className="w-4 h-4" />, label: 'Elasticsearch-powered' },
          { icon: <Zap className="w-4 h-4" />, label: 'Faceted filtering' },
          { icon: <Download className="w-4 h-4" />, label: 'CSV/JSON export' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated border border-border-subtle rounded-lg text-text-secondary">
            {item.icon}
            {item.label}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-text-muted justify-center mt-2">
        <span className="text-text-muted">Try:</span>
        {['185.220.101.34', 'CVE-2024-3400', 'cobalt strike', 'type:domain'].map(ex => (
          <span key={ex} className="px-2 py-1 rounded bg-bg-elevated border border-border-subtle font-mono">
            {ex}
          </span>
        ))}
      </div>
    </div>
  )
}
