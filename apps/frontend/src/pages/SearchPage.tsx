/**
 * @module pages/SearchPage
 * @description Full-text IOC search page powered by Elasticsearch (es-indexing service, port 3020).
 * Endpoint: GET /api/v1/search/iocs?q=...&type=...&severity=...&page=...
 * Demo fallback: 5 hardcoded results when API unavailable or query < 2 chars.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIOCSearch, type SearchResult, type SearchFilters } from '@/hooks/use-search-data'
import { EntityChip } from '@etip/shared-ui/components/EntityChip'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { cn } from '@/lib/utils'
import { Search, X, Clock, Shield, Zap, ArrowRight } from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────

const IOC_TYPES = [
  { value: '',           label: 'All Types' },
  { value: 'ip',         label: 'IP' },
  { value: 'domain',     label: 'Domain' },
  { value: 'url',        label: 'URL' },
  { value: 'hash_sha256', label: 'SHA-256' },
  { value: 'hash_md5',   label: 'MD5' },
  { value: 'cve',        label: 'CVE' },
  { value: 'email',      label: 'Email' },
]

const SEVERITIES = [
  { value: '',         label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High' },
  { value: 'medium',   label: 'Medium' },
  { value: 'low',      label: 'Low' },
]

const TLP_OPTIONS = [
  { value: '',       label: 'All TLP' },
  { value: 'red',    label: 'TLP:RED' },
  { value: 'amber',  label: 'TLP:AMBER' },
  { value: 'green',  label: 'TLP:GREEN' },
  { value: 'white',  label: 'TLP:WHITE' },
]

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-l-sev-critical',
  high:     'border-l-sev-high',
  medium:   'border-l-sev-medium',
  low:      'border-l-sev-low',
  info:     'border-l-border-strong',
}

// ─── Filter pill ──────────────────────────────────────────────────

function FilterSelect({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-text-secondary focus:outline-none focus:border-accent cursor-pointer"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── Result row ───────────────────────────────────────────────────

function ResultRow({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const borderColor = SEVERITY_COLORS[result.severity] ?? 'border-l-border-strong'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left bg-bg-elevated border border-border-subtle rounded-lg p-3 border-l-[3px] transition-all',
        'hover:border-accent/50 hover:bg-bg-hover cursor-pointer group',
        borderColor,
      )}
      data-testid="search-result-row"
    >
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
        {/* Entity chip + value */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <EntityChip
              type={result.iocType as Parameters<typeof EntityChip>[0]['type']}
              value={result.normalizedValue}
              className="shrink-0"
            />
            <SeverityBadge severity={result.severity as Parameters<typeof SeverityBadge>[0]['severity']} />
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase',
              result.tlp === 'red'   ? 'bg-sev-critical/10 text-sev-critical' :
              result.tlp === 'amber' ? 'bg-sev-medium/10 text-sev-medium' :
              result.tlp === 'green' ? 'bg-sev-low/10 text-sev-low' :
                                       'bg-bg-elevated text-text-muted border border-border',
            )}>
              TLP:{result.tlp?.toUpperCase()}
            </span>
            <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-base border border-border-subtle capitalize">
              {result.lifecycle}
            </span>
          </div>
        </div>

        {/* Meta: confidence + dates + drill-down arrow */}
        <div className="flex items-center gap-4 text-[11px] text-text-muted shrink-0 ml-auto">
          {result.score !== undefined && (
            <span className="flex items-center gap-1" title="Elasticsearch relevance score">
              <Zap className="w-3 h-3 text-accent" />
              <span className="text-accent font-medium">{result.score.toFixed(1)}</span>
            </span>
          )}
          <span className="flex items-center gap-1" title="Confidence">
            <Shield className="w-3 h-3" />
            <span className={cn(
              'font-medium',
              result.confidence >= 80 ? 'text-sev-low' :
              result.confidence >= 60 ? 'text-sev-medium' :
                                         'text-sev-high',
            )}>
              {result.confidence}%
            </span>
          </span>
          <span className="flex items-center gap-1 hidden sm:flex" title="First seen">
            <Clock className="w-3 h-3" />
            {new Date(result.firstSeen).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </button>
  )
}

// ─── Empty state ─────────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  if (!query.trim() || query.trim().length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
          <Search className="w-8 h-8 text-accent" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">Search IOCs across the platform</p>
          <p className="text-xs text-text-muted mt-1">
            Enter at least 2 characters — IP addresses, domains, hashes, CVEs, URLs
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-text-muted justify-center">
          {['185.220.101.34', 'CVE-2024-3400', 'cobalt strike', 'darknet.ru'].map(ex => (
            <span key={ex} className="px-2 py-1 rounded bg-bg-elevated border border-border-subtle font-mono">
              {ex}
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <Search className="w-8 h-8 text-text-muted" />
      <p className="text-sm text-text-secondary">No results for <span className="font-mono text-text-primary">"{query}"</span></p>
      <p className="text-xs text-text-muted">Try a different search term or adjust filters.</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

/** Map IOC type to the target navigation route */
function entityRoute(result: SearchResult): string {
  if (result.iocType === 'cve') return '/vulnerabilities'
  return '/iocs'
}

export function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery]       = useState('')
  const [filters, setFilters]   = useState<SearchFilters>({})

  const { data, isLoading, isDemo } = useIOCSearch(query, filters)

  const results  = data?.data  ?? []
  const total    = data?.total ?? 0
  const took     = data?.took  ?? 0

  function setFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setFilters(prev => ({ ...prev, [key]: value || undefined }))
  }

  function clearQuery() {
    setQuery('')
    setFilters({})
  }

  const hasQuery = query.trim().length >= 2

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Stats bar ─── */}
      <PageStatsBar title="IOC Search" isDemo={isDemo}>
        <CompactStat label="Results" value={hasQuery ? String(total) : '—'} />
        <CompactStat label="Query Time" value={hasQuery && took ? `${took}ms` : '—'} />
        <CompactStat label="Engine" value="Elasticsearch" />
        <CompactStat label="Index" value={isDemo ? 'demo' : 'live'} highlight={!isDemo && hasQuery} />
      </PageStatsBar>

      {/* ─── Search bar ─── */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search IOCs — IP, domain, hash, URL, CVE…"
            autoFocus
            className={cn(
              'w-full pl-10 pr-10 py-3 rounded-lg text-sm text-text-primary placeholder:text-text-muted',
              'bg-bg-elevated border transition-colors focus:outline-none',
              hasQuery ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.2)]' : 'border-border focus:border-accent',
            )}
          />
          {query && (
            <button
              onClick={clearQuery}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Filter row ─── */}
      <div className="px-4 pb-3 flex flex-wrap gap-2 items-center">
        <FilterSelect
          value={filters.type ?? ''}
          onChange={v => setFilter('type', v)}
          options={IOC_TYPES}
        />
        <FilterSelect
          value={filters.severity ?? ''}
          onChange={v => setFilter('severity', v)}
          options={SEVERITIES}
        />
        <FilterSelect
          value={filters.tlp ?? ''}
          onChange={v => setFilter('tlp', v)}
          options={TLP_OPTIONS}
        />
        {(filters.type || filters.severity || filters.tlp) && (
          <button
            onClick={() => setFilters({})}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors px-2 py-1.5"
          >
            <X className="w-3 h-3" />
            Clear filters
          </button>
        )}
        {isDemo && hasQuery && (
          <span className="ml-auto text-[11px] text-accent/70 bg-accent/5 px-2 py-1 rounded border border-accent/15">
            Live ES unavailable — showing demo results
          </span>
        )}
      </div>

      {/* ─── Results ─── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading && hasQuery ? (
          /* Skeleton */
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-bg-elevated border border-border-subtle rounded-lg animate-pulse" />
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-2">
            {hasQuery && !isDemo && (
              <p className="text-[11px] text-text-muted pb-1">
                {total} result{total !== 1 ? 's' : ''} · {took}ms
              </p>
            )}
            {results.map(r => (
              <ResultRow key={r.id} result={r} onClick={() => navigate(entityRoute(r))} />
            ))}
          </div>
        ) : (
          <EmptyState query={query} />
        )}
      </div>
    </div>
  )
}
