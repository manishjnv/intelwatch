/**
 * @module components/search/SearchResultCard
 * @description Card-view layout for a single IOC search result.
 * Shows value, type icon, severity badge, confidence gauge, tags, enrichment status.
 * 2-3 column responsive grid item. Distinct from table view.
 */
import { cn } from '@/lib/utils'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { ConfidenceGauge } from '@/components/ioc/ConfidenceGauge'
import { highlightMatches } from '@/utils/search-helpers'
import {
  Globe, Link2, Fingerprint, Shield, ExternalLink, Mail,
  CheckCircle2, Clock,
} from 'lucide-react'
import type { EsSearchResult } from '@/hooks/use-es-search'

interface SearchResultCardProps {
  result: EsSearchResult
  query: string
  selected: boolean
  onSelect: (id: string) => void
  onClick: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  ip: <Globe className="w-4 h-4" />,
  domain: <Link2 className="w-4 h-4" />,
  hash_sha256: <Fingerprint className="w-4 h-4" />,
  hash_md5: <Fingerprint className="w-4 h-4" />,
  cve: <Shield className="w-4 h-4" />,
  url: <ExternalLink className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
}

const TYPE_COLORS: Record<string, string> = {
  ip: 'border-blue-500/30 bg-blue-500/5',
  domain: 'border-purple-500/30 bg-purple-500/5',
  hash_sha256: 'border-slate-500/30 bg-slate-500/5',
  hash_md5: 'border-slate-500/30 bg-slate-500/5',
  cve: 'border-orange-500/30 bg-orange-500/5',
  url: 'border-cyan-500/30 bg-cyan-500/5',
  email: 'border-green-500/30 bg-green-500/5',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`
}

function EnrichmentIcon({ enriched }: { enriched: boolean }) {
  return enriched
    ? <span className="inline-flex items-center gap-0.5 text-[10px] text-sev-low"><CheckCircle2 className="w-3 h-3" />Enriched</span>
    : <span className="inline-flex items-center gap-0.5 text-[10px] text-text-muted"><Clock className="w-3 h-3" />Pending</span>
}

export function SearchResultCard({ result, query, selected, onSelect, onClick, onContextMenu }: SearchResultCardProps) {
  const highlights = highlightMatches(result.value, query)

  return (
    <div
      className={cn(
        'rounded-xl border p-3 cursor-pointer transition-all hover:shadow-md group/card',
        TYPE_COLORS[result.iocType] ?? 'border-border bg-bg-secondary',
        selected && 'ring-2 ring-accent ring-offset-1 ring-offset-bg-base',
      )}
      onClick={() => onClick(result.id)}
      onContextMenu={(e) => onContextMenu(e, result.id)}
      data-testid="search-result-card"
    >
      {/* Top row: checkbox + type + severity */}
      <div className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onSelect(result.id) }}
          className="w-3.5 h-3.5 accent-accent rounded cursor-pointer"
          data-testid="card-checkbox"
        />
        <span className="flex items-center gap-1 text-text-muted">
          {TYPE_ICONS[result.iocType] ?? <Shield className="w-4 h-4" />}
          <span className="text-[10px] uppercase font-medium">{result.iocType.replace('hash_', '')}</span>
        </span>
        <div className="ml-auto">
          <SeverityBadge severity={result.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'} />
        </div>
      </div>

      {/* Value with highlighting */}
      <p className="text-sm font-mono text-text-primary truncate mb-2" title={result.value}>
        {highlights.map((part) =>
          typeof part === 'string' ? part : (
            <mark key={part.key} className="bg-accent/20 text-accent rounded px-0.5">{part.match}</mark>
          )
        )}
      </p>

      {/* Middle: confidence + enrichment */}
      <div className="flex items-center gap-3 mb-2">
        <ConfidenceGauge value={result.confidence} />
        <EnrichmentIcon enriched={result.enriched} />
        <span className="text-[10px] text-text-muted uppercase ml-auto">TLP:{result.tlp}</span>
      </div>

      {/* Tags */}
      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {result.tags.slice(0, 4).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-text-muted truncate max-w-[90px]">
              {t}
            </span>
          ))}
          {result.tags.length > 4 && <span className="text-[10px] text-text-muted">+{result.tags.length - 4}</span>}
        </div>
      )}

      {/* Footer: timestamps */}
      <div className="flex items-center justify-between text-[10px] text-text-muted pt-1 border-t border-border/30">
        <span>First: {relativeTime(result.firstSeen)}</span>
        <span>Last: {relativeTime(result.lastSeen)}</span>
      </div>
    </div>
  )
}
