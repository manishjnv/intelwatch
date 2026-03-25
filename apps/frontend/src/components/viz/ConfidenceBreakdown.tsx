/**
 * @module components/viz/ConfidenceBreakdown
 * @description Expandable confidence score explainability panel.
 * Shows the weighted formula: feedReliability×35% + corroboration×35% + AI×30% − time decay.
 * Falls back to computed demo values when isDemo or fields are absent.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import type { IOCRecord } from '@/hooks/use-intel-data'

interface ConfidenceBreakdownProps {
  record: IOCRecord
  isDemo: boolean
}

/** Normalize corroboration count (0–∞) to a 0–100 score: 3 sources = 100 */
function normalizeCorroboration(count: number): number {
  return Math.min(Math.round(count * 33.33), 100)
}

/** Compute time-decay percentage based on days since last seen */
function computeDecay(lastSeen: string): { decayPct: number; daysSince: number } {
  const daysSince = Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86_400_000))
  // Exponential decay: 0% at 0 days, ~5% at 14 days, ~10% at 30 days, ~20% at 60 days
  const decayPct = daysSince === 0 ? 0 : Math.min(25, Math.round(5 * Math.log2(1 + daysSince / 7)))
  return { decayPct, daysSince }
}

export function ConfidenceBreakdown({ record, isDemo }: ConfidenceBreakdownProps) {
  const [expanded, setExpanded] = useState(false)

  const breakdown = useMemo(() => {
    // Use real values when available, otherwise compute demo estimates
    const feedRel = record.feedReliability ?? (isDemo ? Math.round(record.confidence * 0.88 + 5) : null)
    const corrCount = record.corroborationCount ?? (isDemo ? record.threatActors.length + record.malwareFamilies.length : null)
    const aiConf = record.aiConfidence ?? (isDemo ? Math.round(record.confidence * 0.78 + 8) : null)

    if (feedRel == null || corrCount == null || aiConf == null) return null

    const corrScore = normalizeCorroboration(corrCount)
    const feedContrib = Math.round(feedRel * 0.35)
    const corrContrib = Math.round(corrScore * 0.35)
    const aiContrib = Math.round(aiConf * 0.30)
    const { decayPct, daysSince } = computeDecay(record.lastSeen)
    const rawTotal = feedContrib + corrContrib + aiContrib
    const total = Math.max(0, Math.min(100, rawTotal - decayPct))

    return {
      feedRel, feedContrib,
      corrScore, corrCount, corrContrib,
      aiConf, aiContrib,
      decayPct, daysSince,
      rawTotal, total,
    }
  }, [record, isDemo])

  if (!breakdown || record.confidence <= 0) return null

  return (
    <div className="border border-border rounded-lg overflow-hidden" data-testid="confidence-breakdown">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 bg-bg-secondary/50 hover:bg-bg-secondary transition-colors"
        data-testid="confidence-breakdown-toggle"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-text-primary">Confidence Score</span>
          <span className={cn(
            'text-sm font-bold tabular-nums',
            record.confidence >= 80 ? 'text-sev-critical' :
            record.confidence >= 60 ? 'text-sev-high' :
            record.confidence >= 40 ? 'text-sev-medium' : 'text-sev-low',
          )}>
            {(record.confidence / 100).toFixed(2)}
          </span>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="px-3 py-2.5 space-y-1.5 text-[11px]" data-testid="confidence-breakdown-body">
          <Row
            label="Feed Reliability"
            raw={breakdown.feedRel}
            weight={35}
            contrib={breakdown.feedContrib}
          />
          <Row
            label={`Corroboration (${breakdown.corrCount} sources)`}
            raw={breakdown.corrScore}
            weight={35}
            contrib={breakdown.corrContrib}
          />
          <Row
            label="AI Enrichment"
            raw={breakdown.aiConf}
            weight={30}
            contrib={breakdown.aiContrib}
          />
          {breakdown.daysSince > 0 && (
            <div className="flex items-center justify-between text-text-muted">
              <span>Time Decay <span className="text-text-muted/60">({breakdown.daysSince}d old)</span></span>
              <span className="text-sev-medium tabular-nums">−{breakdown.decayPct}%</span>
            </div>
          )}
          <div className="border-t border-border pt-1.5 mt-1.5 flex items-center justify-between font-semibold text-text-primary">
            <span>Total</span>
            <span className="tabular-nums">{(breakdown.total / 100).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, raw, weight, contrib }: { label: string; raw: number; weight: number; contrib: number }) {
  return (
    <div className="flex items-center justify-between text-text-secondary">
      <span className="truncate mr-2">{label}</span>
      <span className="shrink-0 tabular-nums text-text-muted">
        {(raw / 100).toFixed(2)} × {weight}% = <span className="text-text-primary">{contrib}%</span>
      </span>
    </div>
  )
}
