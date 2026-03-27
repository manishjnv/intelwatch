/**
 * @module components/search/SearchResultsTable
 * @description Sortable, paginated results table for IOC search with type icons and severity badges.
 */
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Globe, Link2, Fingerprint, Shield, ExternalLink, Mail,
  ArrowUpDown, ArrowUp, ArrowDown, Copy, Check, ChevronRight,
} from 'lucide-react'
import { Pagination } from '@/components/data/Pagination'
import type { EsSearchResult } from '@/hooks/use-es-search'

// ─── Types ───────────────────────────────────────────────────

interface SearchResultsTableProps {
  results: EsSearchResult[]
  totalCount: number
  page: number
  pageSize: number
  sortBy: string
  onSort: (col: string) => void
  onPageChange: (page: number) => void
  onRowClick: (id: string) => void
  searchTimeMs: number
  isLoading?: boolean
}

// ─── Constants ───────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  ip: <Globe className="w-3.5 h-3.5" />,
  domain: <Link2 className="w-3.5 h-3.5" />,
  hash_sha256: <Fingerprint className="w-3.5 h-3.5" />,
  hash_md5: <Fingerprint className="w-3.5 h-3.5" />,
  cve: <Shield className="w-3.5 h-3.5" />,
  url: <ExternalLink className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-sev-critical/15 text-sev-critical border-sev-critical/30',
  high: 'bg-sev-high/15 text-sev-high border-sev-high/30',
  medium: 'bg-sev-medium/15 text-sev-medium border-sev-medium/30',
  low: 'bg-sev-low/15 text-sev-low border-sev-low/30',
}

const CONFIDENCE_COLOR = (c: number) =>
  c >= 70 ? 'text-sev-low' : c >= 30 ? 'text-sev-medium' : 'text-sev-high'

const COLUMNS = [
  { key: 'type', label: 'Type', sortable: false, width: 'w-16' },
  { key: 'value', label: 'Value', sortable: false, width: 'flex-1 min-w-0' },
  { key: 'severity', label: 'Severity', sortable: true, width: 'w-24' },
  { key: 'confidence', label: 'Conf.', sortable: true, width: 'w-16' },
  { key: 'tlp', label: 'TLP', sortable: false, width: 'w-20' },
  { key: 'tags', label: 'Tags', sortable: false, width: 'w-40 hidden lg:flex' },
  { key: 'firstSeen', label: 'First Seen', sortable: true, width: 'w-24 hidden xl:flex' },
  { key: 'lastSeen', label: 'Last Seen', sortable: true, width: 'w-24 hidden md:flex' },
]

// ─── Helpers ─────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="p-0.5 rounded opacity-0 group-hover/row:opacity-100 transition-opacity text-text-muted hover:text-accent"
      title="Copy to clipboard"
      data-testid="copy-value"
    >
      {copied ? <Check className="w-3 h-3 text-sev-low" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-text-muted" />
  return direction === 'asc'
    ? <ArrowUp className="w-3 h-3 text-accent" />
    : <ArrowDown className="w-3 h-3 text-accent" />
}

// ─── Component ───────────────────────────────────────────────

export function SearchResultsTable({
  results, totalCount, page, pageSize, sortBy, onSort, onPageChange, onRowClick, searchTimeMs, isLoading,
}: SearchResultsTableProps) {
  const sortCol = sortBy.replace(/_(?:asc|desc)$/, '')
  const sortDir = sortBy.endsWith('_asc') ? 'asc' as const : 'desc' as const

  const handleHeaderClick = (key: string) => {
    if (sortCol === key) {
      onSort(`${key}_${sortDir === 'asc' ? 'desc' : 'asc'}`)
    } else {
      onSort(`${key}_desc`)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-1" data-testid="results-loading">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-bg-elevated border border-border-subtle rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3" data-testid="results-empty">
        <Shield className="w-8 h-8 text-text-muted" />
        <p className="text-sm text-text-secondary">No IOCs match your search</p>
        <p className="text-xs text-text-muted">Try broadening your query or removing filters.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" data-testid="search-results-table">
      {/* Result count header */}
      <div className="flex items-center justify-between px-1 pb-2 text-[11px] text-text-muted" data-testid="results-header">
        <span>
          Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()} results
          {searchTimeMs > 0 && ` (${searchTimeMs}ms)`}
        </span>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary/50 border border-border rounded-t-lg text-[10px] uppercase tracking-wider text-text-muted font-medium">
        {COLUMNS.map(col => (
          <div
            key={col.key}
            className={cn('flex items-center gap-1', col.width, col.sortable && 'cursor-pointer hover:text-text-primary')}
            onClick={col.sortable ? () => handleHeaderClick(col.key) : undefined}
            data-testid={`col-header-${col.key}`}
          >
            {col.label}
            {col.sortable && <SortIcon active={sortCol === col.key} direction={sortDir} />}
          </div>
        ))}
        <div className="w-8" /> {/* Actions spacer */}
      </div>

      {/* Rows */}
      <div className="border-x border-b border-border rounded-b-lg divide-y divide-border-subtle">
        {results.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => onRowClick(r.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-bg-hover transition-colors group/row"
            data-testid="search-result-row"
          >
            {/* Type icon */}
            <div className="w-16 flex items-center gap-1.5 text-text-muted text-xs shrink-0">
              {TYPE_ICONS[r.iocType] ?? <Shield className="w-3.5 h-3.5" />}
              <span className="text-[10px] uppercase">{r.iocType.replace('hash_', '')}</span>
            </div>

            {/* Value */}
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <span className="text-xs text-text-primary font-mono truncate" title={r.value}>
                {r.value}
              </span>
              <CopyButton text={r.value} />
            </div>

            {/* Severity */}
            <div className="w-24 shrink-0">
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize font-medium', SEVERITY_STYLES[r.severity] ?? 'text-text-muted')}>
                {r.severity}
              </span>
            </div>

            {/* Confidence */}
            <div className="w-16 shrink-0">
              <span className={cn('text-xs font-medium tabular-nums', CONFIDENCE_COLOR(r.confidence))}>
                {r.confidence}%
              </span>
            </div>

            {/* TLP */}
            <div className="w-20 shrink-0">
              <span className="text-[10px] text-text-muted uppercase">
                TLP:{r.tlp}
              </span>
            </div>

            {/* Tags */}
            <div className="w-40 hidden lg:flex items-center gap-1 shrink-0 overflow-hidden">
              {r.tags.slice(0, 3).map(t => (
                <span key={t} className="text-[10px] bg-bg-elevated border border-border-subtle rounded px-1.5 py-0.5 text-text-muted truncate max-w-[80px]">
                  {t}
                </span>
              ))}
              {r.tags.length > 3 && (
                <span className="text-[10px] text-text-muted">+{r.tags.length - 3}</span>
              )}
            </div>

            {/* First Seen */}
            <div className="w-24 hidden xl:flex text-[11px] text-text-muted tabular-nums shrink-0">
              {relativeTime(r.firstSeen)}
            </div>

            {/* Last Seen */}
            <div className="w-24 hidden md:flex text-[11px] text-text-muted tabular-nums shrink-0">
              {relativeTime(r.lastSeen)}
            </div>

            {/* Action arrow */}
            <div className="w-8 flex justify-end shrink-0">
              <ChevronRight className="w-4 h-4 text-text-muted opacity-0 group-hover/row:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-2">
        <Pagination page={page} limit={pageSize} total={totalCount} onPageChange={onPageChange} />
      </div>
    </div>
  )
}
