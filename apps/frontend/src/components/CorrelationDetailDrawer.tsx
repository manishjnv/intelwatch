/**
 * @module components/CorrelationDetailDrawer
 * @description Side drawer for full correlation detail — timeline, linked entities,
 * confidence breakdown. Fetched from GET /api/v1/correlations/:id.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { X, ExternalLink, Clock, Zap, Shield, TrendingUp } from 'lucide-react'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import type { CorrelationResult } from '@/hooks/use-phase4-data'

// Extended detail type returned by the single-correlation endpoint
interface CorrelationDetail extends CorrelationResult {
  timeline?: { timestamp: string; event: string }[]
  confidenceBreakdown?: { factor: string; weight: number; score: number }[]
}

function useCorrelationDetail(id: string | null) {
  return useQuery({
    queryKey: ['correlation-detail', id],
    queryFn: () => api<CorrelationDetail>(`/correlations/${id}`).catch(() => null),
    enabled: !!id,
    staleTime: 30_000,
  })
}

const TYPE_LABELS: Record<string, string> = {
  cooccurrence: 'Co-occurrence', infrastructure: 'Infrastructure',
  temporal: 'Temporal', ttp_similarity: 'TTP Similarity', campaign: 'Campaign',
}

const TYPE_COLORS: Record<string, string> = {
  cooccurrence: 'text-blue-400 bg-blue-400/10',
  infrastructure: 'text-cyan-400 bg-cyan-400/10',
  temporal: 'text-purple-400 bg-purple-400/10',
  ttp_similarity: 'text-amber-400 bg-amber-400/10',
  campaign: 'text-rose-400 bg-rose-400/10',
}

export interface CorrelationDetailDrawerProps {
  correlationId: string | null
  fallback: CorrelationResult | null
  onClose: () => void
}

export function CorrelationDetailDrawer({ correlationId, fallback, onClose }: CorrelationDetailDrawerProps) {
  const { data: detail, isLoading } = useCorrelationDetail(correlationId)
  const corr: CorrelationDetail | null = detail ?? fallback ?? null

  if (!corr) return null

  const timeline = corr.timeline ?? []
  const breakdown = corr.confidenceBreakdown ?? []

  return (
    <div className="fixed inset-y-0 right-0 w-[460px] max-w-full bg-bg-primary border-l border-border shadow-xl z-50 overflow-y-auto"
      data-testid="correlation-detail-drawer">
      {/* Header */}
      <div className="sticky top-0 bg-bg-primary border-b border-border p-4 z-10">
        <div className="flex items-center justify-between">
          <SeverityBadge severity={corr.severity.toUpperCase() as any} />
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary" aria-label="Close drawer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-text-primary mt-2">{corr.title}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TYPE_COLORS[corr.correlationType])}>
            {TYPE_LABELS[corr.correlationType]}
          </span>
          <span className="text-[10px] text-text-muted tabular-nums">{corr.confidence}% confidence</span>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-4 bg-bg-elevated rounded animate-pulse" />)}
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-text-secondary">{corr.description}</p>

        {/* Confidence Breakdown */}
        {breakdown.length > 0 && (
          <div>
            <h4 className="text-[10px] text-text-muted uppercase mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />Confidence Breakdown
            </h4>
            <div className="space-y-1.5">
              {breakdown.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-text-secondary w-28 truncate">{b.factor}</span>
                  <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${b.score}%` }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-text-muted w-8 text-right">{b.score}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        {timeline.length > 0 && (
          <div>
            <h4 className="text-[10px] text-text-muted uppercase mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />Timeline
            </h4>
            <div className="space-y-2 relative before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-border">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-3 pl-4 relative">
                  <div className="absolute left-0.5 top-1 w-2 h-2 rounded-full bg-accent border border-bg-primary" />
                  <div>
                    <div className="text-[10px] tabular-nums text-text-muted">{new Date(t.timestamp).toLocaleString()}</div>
                    <div className="text-[11px] text-text-primary">{t.event}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Entities */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-1.5 flex items-center gap-1">
            <Zap className="w-3 h-3" />Linked Entities ({corr.entityIds.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {corr.entityLabels.map((label, i) => (
              <span key={i} className="text-[10px] px-2 py-1 rounded bg-bg-secondary border border-border text-text-primary flex items-center gap-1">
                {label}<ExternalLink className="w-2.5 h-2.5 opacity-50" />
              </span>
            ))}
          </div>
        </div>

        {/* Metadata */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-1.5 flex items-center gap-1">
            <Shield className="w-3 h-3" />Details
          </h4>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-text-muted">ID</span><span className="text-text-primary font-mono">{corr.id.slice(0, 16)}…</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Type</span><span className="text-text-primary">{TYPE_LABELS[corr.correlationType]}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Created</span><span className="text-text-primary tabular-nums">{new Date(corr.createdAt).toLocaleString()}</span></div>
            {corr.suppressed && (
              <div className="flex justify-between"><span className="text-text-muted">Status</span><span className="text-sev-medium">Suppressed (FP)</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
