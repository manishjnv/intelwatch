/**
 * @module components/search/SearchStatsBar
 * @description Search-specific stats bar: result count + time, type distribution mini-bar,
 * severity breakdown, pagination info. Search-engine feel.
 */
import { cn } from '@/lib/utils'
import type { EsSearchFacets } from '@/hooks/use-es-search'

interface SearchStatsBarProps {
  totalCount: number
  searchTimeMs: number
  page: number
  pageSize: number
  facets: EsSearchFacets
  isDemo: boolean
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-sev-critical',
  high: 'bg-sev-high',
  medium: 'bg-sev-medium',
  low: 'bg-sev-low',
}

const TYPE_COLORS: Record<string, string> = {
  ip: 'bg-blue-400',
  domain: 'bg-purple-400',
  hash_sha256: 'bg-slate-400',
  hash_md5: 'bg-slate-400',
  url: 'bg-cyan-400',
  cve: 'bg-orange-400',
  email: 'bg-green-400',
}

export function SearchStatsBar({ totalCount, searchTimeMs, page, pageSize, facets, isDemo }: SearchStatsBarProps) {
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)
  const total = facets.byType.reduce((sum, b) => sum + b.count, 0) || totalCount

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-bg-elevated/40 border-b border-border text-[11px] flex-wrap" data-testid="search-stats-bar">
      {/* Result count + time */}
      <span className="text-text-primary font-medium" data-testid="result-count">
        {totalCount > 0 ? (
          <>
            <strong className="tabular-nums">{totalCount.toLocaleString()}</strong> results
            {searchTimeMs > 0 && <span className="text-text-muted ml-1">in {searchTimeMs}ms</span>}
          </>
        ) : (
          'No results'
        )}
      </span>

      {/* Type distribution mini-bar */}
      {facets.byType.length > 0 && (
        <div className="flex items-center gap-1.5 hidden sm:flex">
          <div className="flex h-1.5 w-24 rounded-full overflow-hidden bg-bg-secondary" data-testid="type-distribution">
            {facets.byType.map(b => (
              <div
                key={b.key}
                className={cn('h-full', TYPE_COLORS[b.key] ?? 'bg-text-muted')}
                style={{ width: `${(b.count / total) * 100}%` }}
                title={`${b.key}: ${b.count}`}
              />
            ))}
          </div>
          <span className="text-text-muted">
            {facets.byType.map(b => `${b.count} ${b.key.replace('hash_', '')}`).join(', ')}
          </span>
        </div>
      )}

      {/* Severity mini-dots */}
      {facets.bySeverity.length > 0 && (
        <div className="flex items-center gap-1 hidden md:flex" data-testid="severity-summary">
          {facets.bySeverity.map(b => (
            <span key={b.key} className="flex items-center gap-0.5" title={`${b.key}: ${b.count}`}>
              <span className={cn('w-1.5 h-1.5 rounded-full', SEVERITY_COLORS[b.key] ?? 'bg-text-muted')} />
              <span className="text-text-muted tabular-nums">{b.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Pagination info */}
      {totalCount > 0 && (
        <span className="text-text-muted ml-auto tabular-nums" data-testid="pagination-info">
          Showing {start}–{end} of {totalCount.toLocaleString()}
        </span>
      )}

      {isDemo && (
        <span className="text-[10px] text-accent/70 bg-accent/5 px-1.5 py-0.5 rounded border border-accent/15">
          demo
        </span>
      )}
    </div>
  )
}
