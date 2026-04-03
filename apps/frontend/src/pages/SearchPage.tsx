/**
 * @module pages/SearchPage
 * @description Full-text IOC search page — search-engine experience.
 * Features: faceted sidebar, table/card view toggle, multi-select + bulk actions,
 * right-click context menu, expandable enrichment rows, bulk IOC paste,
 * search history, saved searches, search stats bar, highlight matches.
 */
import { useState, useCallback, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useEsSearch } from '@/hooks/use-es-search'
import { SearchBar } from '@/components/search/SearchBar'
import { FacetedSidebar, MobileFilterTrigger } from '@/components/search/FacetedSidebar'
import { SearchResultsTable } from '@/components/search/SearchResultsTable'
import { SearchStatsBar } from '@/components/search/SearchStatsBar'
import { SearchResultCard } from '@/components/search/SearchResultCard'
import { ViewToggle, type ViewMode } from '@/components/search/ViewToggle'
import { BulkSearchModal } from '@/components/search/BulkSearchModal'
import { SavedSearches, type SavedSearch } from '@/components/search/SavedSearches'
import { addSearchHistory } from '@/components/search/SearchHistoryPanel'
import { SplitPane } from '@/components/viz/SplitPane'
import { IocDetailPanel } from '@/pages/IocDetailPanel'
import { IocContextMenu } from '@/components/ioc/IocContextMenu'
import { IocComparePanel } from '@/components/ioc/IocComparePanel'
import { InlineEnrichmentRow } from '@/components/ioc/InlineEnrichmentRow'
import { QuickActionToolbar } from '@/components/viz/QuickActionToolbar'
import { toIOCRecord } from '@/utils/search-helpers'
import { toast } from '@/components/ui/Toast'
import type { IOCRecord } from '@/hooks/use-intel-data'
import type { EsSearchFilters, EsSearchResult } from '@/hooks/use-es-search'
import {
  Search, Download, ChevronDown, Database, Zap, X,
  Upload, Bookmark,
} from 'lucide-react'

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
    clearAll, exportResults, selectedIds, toggleSelection,
    clearSelection, toggleSelectAll, bulkSearch,
  } = useEsSearch()

  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [showBulkSearch, setShowBulkSearch] = useState(false)
  const [showSavedSearches, setShowSavedSearches] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)

  // Context menu state
  const [ctxIoc, setCtxIoc] = useState<IOCRecord | null>(null)
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null)

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const selectedRecord: IOCRecord | null = useMemo(() => {
    if (!selectedId) return null
    const r = results.find(res => res.id === selectedId)
    if (!r) return null
    return toIOCRecord(r)
  }, [selectedId, results])

  const activeFilterCount = (filters.type?.length ?? 0)
    + (filters.severity?.length ?? 0)
    + (filters.tlp?.length ?? 0)
    + (filters.enriched ? 1 : 0)
    + (filters.confidenceMin != null && filters.confidenceMin > 0 ? 1 : 0)

  const handleFilterChange = useCallback((partial: Partial<EsSearchFilters>) => {
    setFilters({ ...filters, ...partial })
  }, [filters, setFilters])

  const handleSearch = useCallback(() => {
    if (query.trim()) addSearchHistory(query.trim())
  }, [query])

  const handleExport = useCallback((format: 'csv' | 'json') => {
    exportResults(format)
    setShowExportMenu(false)
  }, [exportResults])

  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const r = results.find(res => res.id === id)
    if (!r) return
    setCtxIoc(toIOCRecord(r))
    setCtxPos({ x: e.clientX, y: e.clientY })
  }, [results])

  const handleSavedSelect = useCallback((saved: SavedSearch) => {
    setQuery(saved.query)
    setFilters(saved.filters)
    setSortBy(saved.sortBy)
  }, [setQuery, setFilters, setSortBy])

  const handleBulkSearch = useCallback((values: string[]) => {
    bulkSearch(values)
  }, [bulkSearch])

  // Compare panel — get selected IOCRecords
  const compareRecords = useMemo(() => {
    if (!showCompare) return []
    return results
      .filter(r => selectedIds.has(r.id))
      .map(toIOCRecord)
  }, [showCompare, results, selectedIds])

  const renderExpandedRow = useCallback((_r: EsSearchResult) => {
    return <InlineEnrichmentRow enrichment={null} isLoading={false} />
  }, [])

  const hasQuery = query.trim().length > 0
  const hasResults = results.length > 0 || isDemo

  // Build active filter pills
  const filterPills = useMemo(() => {
    const pills: { label: string; key: string; group: keyof EsSearchFilters }[] = []
    filters.type?.forEach(t => pills.push({ label: t, key: `type:${t}`, group: 'type' }))
    filters.severity?.forEach(s => pills.push({ label: s, key: `sev:${s}`, group: 'severity' }))
    filters.tlp?.forEach(t => pills.push({ label: `TLP:${t}`, key: `tlp:${t}`, group: 'tlp' }))
    if (filters.enriched) pills.push({ label: 'Enriched', key: 'enriched', group: 'enriched' })
    if (filters.confidenceMin != null && filters.confidenceMin > 0) pills.push({ label: `Conf ≥${filters.confidenceMin}`, key: 'conf', group: 'confidenceMin' })
    return pills
  }, [filters])

  const removePill = useCallback((pill: { label: string; group: keyof EsSearchFilters }) => {
    const next = { ...filters }
    if (pill.group === 'type') next.type = filters.type?.filter(t => t !== pill.label)
    else if (pill.group === 'severity') next.severity = filters.severity?.filter(s => s !== pill.label)
    else if (pill.group === 'tlp') next.tlp = filters.tlp?.filter(t => `TLP:${t}` !== pill.label)
    else if (pill.group === 'enriched') next.enriched = undefined
    else if (pill.group === 'confidenceMin') next.confidenceMin = undefined
    if (!next.type?.length) next.type = undefined
    if (!next.severity?.length) next.severity = undefined
    if (!next.tlp?.length) next.tlp = undefined
    setFilters(next)
  }, [filters, setFilters])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar row */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap" data-testid="search-toolbar">
        <MobileFilterTrigger activeCount={activeFilterCount} onClick={() => setShowMobileSidebar(!showMobileSidebar)} />

        {/* Bulk search + saved searches */}
        <button onClick={() => setShowBulkSearch(true)}
          className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-accent transition-colors"
          data-testid="bulk-search-btn"
        >
          <Upload className="w-3 h-3" /> Paste IOCs
        </button>
        <div className="relative">
          <button onClick={() => setShowSavedSearches(!showSavedSearches)}
            className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-accent transition-colors"
            data-testid="saved-searches-btn"
          >
            <Bookmark className="w-3 h-3" /> Saved
          </button>
          <SavedSearches
            open={showSavedSearches}
            onClose={() => setShowSavedSearches(false)}
            onSelect={handleSavedSelect}
            currentQuery={query}
            currentFilters={filters}
            currentSortBy={sortBy}
          />
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 ml-auto">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-[11px] bg-bg-elevated border border-border rounded-md px-2 py-1 text-text-secondary focus:outline-none focus:border-accent cursor-pointer"
            data-testid="sort-select">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
            className="text-[11px] bg-bg-elevated border border-border rounded-md px-2 py-1 text-text-secondary focus:outline-none focus:border-accent cursor-pointer"
            data-testid="page-size-select">
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1 text-[11px] bg-bg-elevated border border-border rounded-md px-2 py-1 text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
              data-testid="export-btn">
              <Download className="w-3 h-3" />Export<ChevronDown className="w-2.5 h-2.5" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 min-w-[120px]" data-testid="export-menu">
                <button onClick={() => handleExport('csv')} className="w-full text-left text-xs px-3 py-2 hover:bg-bg-hover transition-colors rounded-t-lg">Export CSV</button>
                <button onClick={() => handleExport('json')} className="w-full text-left text-xs px-3 py-2 hover:bg-bg-hover transition-colors rounded-b-lg">Export JSON</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 pt-3 pb-2">
        <SearchBar query={query} onQueryChange={setQuery} onSearch={handleSearch} isLoading={isLoading} />
      </div>

      {/* Search stats bar */}
      {(hasResults || isLoading) && (
        <SearchStatsBar
          totalCount={totalCount}
          searchTimeMs={searchTimeMs}
          page={page}
          pageSize={pageSize}
          facets={facets}
          isDemo={isDemo}
        />
      )}

      {/* Active filter pills */}
      {filterPills.length > 0 && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 flex-wrap" data-testid="active-filter-pills">
          {filterPills.map(pill => (
            <button key={pill.key} onClick={() => removePill(pill)}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
              data-testid={`pill-${pill.key}`}>
              {pill.label}<X className="w-3 h-3" />
            </button>
          ))}
          {filterPills.length > 1 && (
            <button onClick={clearAll} className="text-[10px] text-text-muted hover:text-accent transition-colors ml-1">Clear all</button>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop sidebar */}
        <FacetedSidebar facets={facets} activeFilters={filters} onFilterChange={handleFilterChange} onClearAll={clearAll}
          className="w-[250px] shrink-0 hidden md:flex" />

        {/* Mobile sidebar */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-40 md:hidden" data-testid="mobile-sidebar-overlay">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)} />
            <FacetedSidebar facets={facets} activeFilters={filters} onFilterChange={handleFilterChange} onClearAll={clearAll}
              className="absolute left-0 top-0 bottom-0 w-[280px] bg-bg-base z-50 shadow-xl" />
          </div>
        )}

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <SplitPane
            onCloseRight={() => setSelectedId(null)}
            defaultSplit={55}
            left={
              <div className="overflow-y-auto h-full px-4 pb-4">
                {!hasQuery && !isDemo && results.length === 0 ? (
                  <InitialState />
                ) : viewMode === 'card' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pt-2" data-testid="card-view">
                    {results.map(r => (
                      <SearchResultCard key={r.id} result={r} query={query}
                        selected={selectedIds.has(r.id)} onSelect={toggleSelection}
                        onClick={handleRowClick} onContextMenu={handleContextMenu} />
                    ))}
                  </div>
                ) : (
                  <SearchResultsTable
                    results={results} totalCount={totalCount} page={page}
                    pageSize={pageSize} sortBy={sortBy} query={query}
                    selectedIds={selectedIds} expandedId={expandedRowId}
                    onSort={setSortBy} onPageChange={setPage} onRowClick={handleRowClick}
                    onToggleSelect={toggleSelection} onToggleSelectAll={toggleSelectAll}
                    onExpandRow={setExpandedRowId} onContextMenu={handleContextMenu}
                    searchTimeMs={searchTimeMs} isLoading={isLoading}
                    renderExpandedRow={renderExpandedRow}
                  />
                )}
              </div>
            }
            right={selectedRecord ? <IocDetailPanel record={selectedRecord} isDemo={isDemo} /> : null}
            showRight={!!selectedRecord}
          />
        </div>
      </div>

      {/* Context menu */}
      <IocContextMenu ioc={ctxIoc} position={ctxPos} onClose={() => { setCtxIoc(null); setCtxPos(null) }} />

      {/* Bulk action toolbar */}
      <QuickActionToolbar
        selectedCount={selectedIds.size}
        onCompare={selectedIds.size >= 2 && selectedIds.size <= 3 ? () => setShowCompare(true) : undefined}
        onExport={() => exportResults('csv')}
        onBulkExport={(fmt) => exportResults(fmt === 'stix' ? 'json' : fmt)}
        onReEnrich={() => toast('Bulk re-enrichment coming soon', 'info')}
        onArchive={() => toast('Archive coming soon', 'info')}
        onLifecycleChange={() => toast('Lifecycle change coming soon', 'info')}
        onBulkTag={() => toast('Bulk tagging coming soon', 'info')}
        onClear={clearSelection}
      />

      {/* Compare panel */}
      <AnimatePresence>
        {showCompare && compareRecords.length >= 2 && (
          <IocComparePanel records={compareRecords} onClose={() => setShowCompare(false)} />
        )}
      </AnimatePresence>

      {/* Bulk search modal */}
      <BulkSearchModal
        open={showBulkSearch}
        onClose={() => setShowBulkSearch(false)}
        onSearch={handleBulkSearch}
        results={results}
      />
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
        <p className="text-sm text-text-muted mt-1.5">Search IOCs by value, type, tag, or description</p>
      </div>
      <div className="flex flex-wrap gap-3 text-xs justify-center">
        {[
          { icon: <Database className="w-4 h-4" />, label: 'Elasticsearch-powered' },
          { icon: <Zap className="w-4 h-4" />, label: 'Faceted filtering' },
          { icon: <Download className="w-4 h-4" />, label: 'CSV/JSON export' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated border border-border-subtle rounded-lg text-text-secondary">
            {item.icon}{item.label}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-text-muted justify-center mt-2">
        <span>Try:</span>
        {['185.220.101.34', 'CVE-2024-3400', 'cobalt strike', 'type:domain', 'severity:critical'].map(ex => (
          <span key={ex} className="px-2 py-1 rounded bg-bg-elevated border border-border-subtle font-mono">{ex}</span>
        ))}
      </div>
    </div>
  )
}
