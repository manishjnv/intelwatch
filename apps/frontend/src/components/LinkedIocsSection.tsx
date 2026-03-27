/**
 * @module components/LinkedIocsSection
 * @description Reusable linked IOCs section for entity detail panels.
 * Shows IOC table with type/severity filters, sort, relationship column.
 * Click row → opens GlobalIocOverlayPanel.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useLinkedIocs, type EntityType } from '@/hooks/use-linked-iocs'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────

const TYPE_OPTIONS = ['all', 'ip', 'domain', 'hash_sha256', 'url', 'cve', 'email'] as const
const SEV_OPTIONS = ['all', 'critical', 'high', 'medium', 'low'] as const
const SORT_OPTIONS = [
  { key: 'confidence' as const, label: 'Confidence' },
  { key: 'severity' as const, label: 'Severity' },
  { key: 'lastSeen' as const, label: 'Last Seen' },
]

const SEV_COLORS: Record<string, string> = {
  critical: 'text-sev-critical bg-sev-critical/10',
  high: 'text-sev-high bg-sev-high/10',
  medium: 'text-sev-medium bg-sev-medium/10',
  low: 'text-sev-low bg-sev-low/10',
  info: 'text-text-muted bg-bg-elevated',
}

const REL_COLORS: Record<string, string> = {
  attributed: 'text-sev-critical', used_by: 'text-sev-high',
  drops: 'text-sev-medium', contacts: 'text-accent',
  exploits: 'text-sev-critical',
}

const IOC_TYPE_ICONS: Record<string, string> = {
  ip: '🌐', domain: '🔗', hash_sha256: '#️⃣', hash_md5: '#️⃣',
  hash_sha1: '#️⃣', url: '🔗', email: '📧', cve: '🛡️',
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ─── Component ──────────────────────────────────────────────────

export interface LinkedIocsSectionProps {
  entityId: string
  entityType: EntityType
  entityName: string
  onIocClick?: (iocId: string) => void
  defaultCollapsed?: boolean
}

export function LinkedIocsSection({
  entityId,
  entityType,
  entityName,
  onIocClick,
  defaultCollapsed = false,
}: LinkedIocsSectionProps) {
  const {
    iocs, totalCount, filteredCount, isLoading, isDemo,
    typeFilter, setTypeFilter, sevFilter, setSevFilter,
    sortKey, setSortKey, hasMore, loadMore,
    typeBreakdown, sevBreakdown,
  } = useLinkedIocs(entityId, entityType)

  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (isLoading) {
    return (
      <div className="p-3 space-y-1.5" data-testid="linked-iocs-loading">
        <div className="h-3 w-32 bg-bg-elevated rounded animate-pulse" />
        <div className="space-y-1">
          {[1, 2, 3].map(i => <div key={i} className="h-5 bg-bg-elevated rounded animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="linked-iocs-section">
      {/* Header with count + collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full p-3 flex items-center justify-between border-b border-border hover:bg-bg-hover/50 transition-colors"
        data-testid="linked-iocs-header"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="w-3 h-3 text-text-muted" /> : <ChevronDown className="w-3 h-3 text-text-muted" />}
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Linked IOCs</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium tabular-nums">
            {totalCount}
          </span>
          {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-400/10 text-blue-400">Demo</span>}
        </div>
        <a href="/iocs" onClick={e => e.stopPropagation()} className="text-[10px] text-accent hover:underline flex items-center gap-0.5">
          View all <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </button>

      {collapsed ? null : (
        <div className="p-3 space-y-2">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-1.5 items-center" data-testid="linked-iocs-filters">
            {/* Type pills */}
            <div className="flex gap-0.5">
              {TYPE_OPTIONS.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full transition-colors',
                    typeFilter === t ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary',
                  )}
                  data-testid={`type-filter-${t}`}>
                  {t === 'all' ? 'All' : t.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="text-border">|</span>
            {/* Severity pills */}
            <div className="flex gap-0.5">
              {SEV_OPTIONS.map(s => (
                <button key={s} onClick={() => setSevFilter(s)}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full transition-colors capitalize',
                    sevFilter === s ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary',
                  )}
                  data-testid={`sev-filter-${s}`}>
                  {s}
                </button>
              ))}
            </div>
            <span className="text-border">|</span>
            {/* Sort */}
            <div className="flex gap-0.5">
              {SORT_OPTIONS.map(s => (
                <button key={s.key} onClick={() => setSortKey(s.key)}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full transition-colors',
                    sortKey === s.key ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary',
                  )}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* IOC rows */}
          {iocs.length === 0 ? (
            <div className="text-[10px] text-text-muted py-2" data-testid="linked-iocs-empty">
              No IOCs linked to {entityName}
            </div>
          ) : (
            <div className="space-y-0.5" data-testid="linked-iocs-table">
              {iocs.map(ioc => (
                <button
                  key={ioc.id}
                  onClick={() => onIocClick?.(ioc.id)}
                  className="w-full flex items-center gap-2 py-1 px-1 rounded hover:bg-bg-hover/50 transition-colors text-left"
                  data-testid="linked-ioc-row"
                >
                  <span className="text-[10px] shrink-0">{IOC_TYPE_ICONS[ioc.iocType] ?? '📌'}</span>
                  <span className="text-[10px] text-text-secondary truncate flex-1 font-mono">{ioc.normalizedValue}</span>
                  <span className={cn('text-[10px] px-1 py-0.5 rounded-full shrink-0', SEV_COLORS[ioc.severity] ?? '')}>
                    {ioc.severity}
                  </span>
                  {ioc.confidence != null && (
                    <span className="text-[10px] tabular-nums text-text-muted shrink-0 w-6 text-right">{ioc.confidence}</span>
                  )}
                  {ioc.relationship && (
                    <span className={cn('text-[10px] shrink-0 font-medium', REL_COLORS[ioc.relationship] ?? 'text-text-muted')}>
                      {ioc.relationship}
                    </span>
                  )}
                  <span className="text-[10px] text-text-muted tabular-nums shrink-0 w-12 text-right">{timeAgo(ioc.lastSeen)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <button onClick={loadMore}
              className="w-full text-[10px] text-accent hover:underline py-1"
              data-testid="load-more-iocs">
              Load more ({filteredCount - iocs.length} remaining)
            </button>
          )}

          {/* Summary bar */}
          <div className="flex flex-wrap gap-2 text-[10px] text-text-muted border-t border-border pt-1.5" data-testid="linked-iocs-summary">
            <span>
              {Object.entries(typeBreakdown).map(([t, c]) => `${c} ${t.toUpperCase()}`).join(', ')}
            </span>
            <span className="text-border">|</span>
            <span>
              {Object.entries(sevBreakdown).map(([s, c]) => `${c} ${s}`).join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
