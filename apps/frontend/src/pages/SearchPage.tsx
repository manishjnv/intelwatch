/**
 * @module pages/SearchPage
 * @description Full-text IOC search page powered by Elasticsearch.
 * Features: faceted sidebar, sortable results table, URL-synced state,
 * saved searches, export, keyboard shortcuts, and demo fallback.
 */
import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEsSearch } from '@/hooks/use-es-search'
import { SearchBar } from '@/components/search/SearchBar'
import { FacetedSidebar, MobileFilterTrigger } from '@/components/search/FacetedSidebar'
import { SearchResultsTable } from '@/components/search/SearchResultsTable'
// PageStatsBar replaced with inline compact toolbar
import { Search, Download, ChevronDown, Database, Zap, X, ExternalLink, Copy, Check, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EsSearchFilters, EsSearchResult } from '@/hooks/use-es-search'

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
  const [selectedResult, setSelectedResult] = useState<EsSearchResult | null>(null)

  const handleRowClick = useCallback((id: string) => {
    const result = results.find(r => r.id === id)
    if (result) setSelectedResult(prev => prev?.id === id ? null : result)
  }, [results])

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

  // Build active filter pills for display
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
      {/* Combined stats + toolbar — single row */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap" data-testid="search-toolbar">
        {/* Left: stats */}
        <MobileFilterTrigger activeCount={activeFilterCount} onClick={() => setShowMobileSidebar(!showMobileSidebar)} />
        <span className="text-[11px] text-text-muted">Results <strong className="text-text-primary">{totalCount > 0 ? totalCount.toLocaleString() : '—'}</strong></span>
        <span className="text-[11px] text-text-muted hidden sm:inline">Engine <strong className="text-text-primary">Elasticsearch</strong></span>
        <span className="text-[11px] text-text-muted hidden sm:inline">Index <strong className={isDemo ? 'text-text-primary' : 'text-accent'}>{isDemo ? 'demo' : 'live'}</strong></span>

        {/* Right: controls */}
        <div className="flex items-center gap-2 ml-auto">
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
          {isDemo && (
            <span className="text-[10px] text-accent/70 bg-accent/5 px-1.5 py-0.5 rounded border border-accent/15 whitespace-nowrap">
              ES unavailable — demo
            </span>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 pt-3 pb-2">
        <SearchBar query={query} onQueryChange={setQuery} onSearch={handleSearch} isLoading={isLoading} />
      </div>

      {/* Active filter pills strip */}
      {filterPills.length > 0 && (
        <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap" data-testid="active-filter-pills">
          {filterPills.map(pill => (
            <button key={pill.key} onClick={() => removePill(pill)}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
              data-testid={`pill-${pill.key}`}>
              {pill.label}
              <X className="w-3 h-3" />
            </button>
          ))}
          {filterPills.length > 1 && (
            <button onClick={clearAll}
              className="text-[10px] text-text-muted hover:text-accent transition-colors ml-1">
              Clear all
            </button>
          )}
        </div>
      )}

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

        {/* Detail panel */}
        {selectedResult && (
          <IocDetailPanel result={selectedResult} onClose={() => setSelectedResult(null)} onNavigate={navigate} />
        )}
      </div>
    </div>
  )
}

// ─── IOC Detail Panel ────────────────────────────────────────

const SEV_STYLES: Record<string, string> = {
  critical: 'bg-sev-critical/15 text-sev-critical border-sev-critical/30',
  high: 'bg-sev-high/15 text-sev-high border-sev-high/30',
  medium: 'bg-sev-medium/15 text-sev-medium border-sev-medium/30',
  low: 'bg-sev-low/15 text-sev-low border-sev-low/30',
}

function IocDetailPanel({ result, onClose, onNavigate }: {
  result: EsSearchResult; onClose: () => void; onNavigate: (path: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(result.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86_400_000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days}d ago`
  }

  return (
    <div className="w-[320px] shrink-0 border-l border-border bg-bg-secondary overflow-y-auto hidden lg:block" data-testid="ioc-detail-panel">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">IOC Detail</h3>
        <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-bg-hover">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Value */}
      <div className="p-3 border-b border-border">
        <div className="text-[10px] text-text-muted uppercase mb-1">Value</div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-text-primary font-mono break-all">{result.value}</span>
          <button onClick={handleCopy} className="p-1 text-text-muted hover:text-accent shrink-0" title="Copy">
            {copied ? <Check className="w-3 h-3 text-sev-low" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Properties grid */}
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-0.5">Type</div>
            <div className="text-xs text-text-primary capitalize">{result.iocType.replace('hash_', '')}</div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-0.5">Severity</div>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize font-medium', SEV_STYLES[result.severity] ?? 'text-text-muted')}>
              {result.severity}
            </span>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-0.5">Confidence</div>
            <div className={cn('text-xs font-medium tabular-nums', result.confidence >= 70 ? 'text-sev-low' : result.confidence >= 30 ? 'text-sev-medium' : 'text-sev-high')}>
              {result.confidence}%
            </div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-0.5">TLP</div>
            <div className="text-xs text-text-muted">TLP:{result.tlp}</div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-0.5">First Seen</div>
            <div className="text-xs text-text-muted">{relTime(result.firstSeen)}</div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-0.5">Last Seen</div>
            <div className="text-xs text-text-muted">{relTime(result.lastSeen)}</div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-0.5">Enriched</div>
            <div className={cn('text-xs', result.enriched ? 'text-sev-low' : 'text-text-muted')}>
              {result.enriched ? 'Yes' : 'No'}
            </div>
          </div>
        </div>

        {/* Tags */}
        {result.tags.length > 0 && (
          <div>
            <div className="text-[10px] text-text-muted uppercase mb-1.5">Tags</div>
            <div className="flex flex-wrap gap-1">
              {result.tags.map(t => (
                <span key={t} className="text-[10px] bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-text-muted">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 space-y-1.5">
          <button
            onClick={() => onNavigate(`/iocs?search=${encodeURIComponent(result.value)}`)}
            className="w-full flex items-center justify-center gap-1.5 text-xs bg-accent/10 text-accent border border-accent/20 rounded-md px-3 py-2 hover:bg-accent/20 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View in IOC Intelligence
          </button>
          <button
            onClick={() => onNavigate(`/threat-graph?search=${encodeURIComponent(result.value)}`)}
            className="w-full flex items-center justify-center gap-1.5 text-xs bg-bg-elevated text-text-secondary border border-border rounded-md px-3 py-2 hover:border-accent/30 hover:text-text-primary transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            View in Threat Graph
          </button>
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
