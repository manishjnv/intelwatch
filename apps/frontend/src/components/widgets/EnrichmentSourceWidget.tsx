/**
 * @module components/widgets/EnrichmentSourceWidget
 * @description Enrichment quality + source breakdown widget for the Dashboard.
 * Shows avg quality score, enriched vs unenriched ring, and per-source success bars.
 */
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useEnrichmentSourceBreakdown } from '@/hooks/use-enrichment-data'
import { ArrowRight, Activity } from 'lucide-react'

export function EnrichmentSourceWidget() {
  const navigate = useNavigate()
  const { data, isDemo } = useEnrichmentSourceBreakdown()

  if (!data || data.avgQuality == null) return null

  const circumference = 2 * Math.PI * 28
  const filled = (data.enrichedPercent / 100) * circumference
  const sources = Object.entries(data.bySource)

  return (
    <div
      data-testid="enrichment-source-widget"
      onClick={() => navigate('/global-monitoring')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs font-medium text-text-primary">Enrichment Quality</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <div className="flex items-center gap-4 mb-3">
        {/* Progress ring */}
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
            <circle
              cx="32" cy="32" r="28" fill="none"
              stroke="var(--accent)" strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - filled}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span data-testid="avg-quality" className="text-sm font-bold text-text-primary tabular-nums">
              {data.avgQuality}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-text-muted mb-0.5">
            {data.enrichedCount.toLocaleString()} enriched / {(data.enrichedCount + data.unenrichedCount).toLocaleString()} total
          </div>
          {data.unenrichedCount > 100 && (
            <div data-testid="unenriched-warning" className="text-[10px] text-sev-medium font-medium">
              Unenriched backlog: {data.unenrichedCount.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Source breakdown */}
      <div className="space-y-1.5">
        {sources.map(([name, src]) => (
          <div key={name} className="flex items-center gap-2" data-testid={`source-bar-${name}`}>
            <span className="text-[10px] text-text-muted w-16 shrink-0 truncate">{name}</span>
            <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', src.rate >= 80 ? 'bg-sev-low' : src.rate >= 50 ? 'bg-sev-medium' : 'bg-sev-high')}
                style={{ width: `${src.rate}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-text-secondary w-10 text-right shrink-0">
              {src.rate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
