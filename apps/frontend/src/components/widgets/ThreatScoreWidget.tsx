/**
 * @module widgets/ThreatScoreWidget
 * @description Composite threat score (0-100) for top 5 IOCs.
 * Score = severity(30%) + confidence(20%) + corroboration(20%) + epss/kev(15%) + recency(15%)
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, ArrowRight } from 'lucide-react'
import { useAnalyticsDashboard, type TopIoc, type TopCve } from '@/hooks/use-analytics-dashboard'
import { useInvestigationDrawer } from '@/hooks/use-investigation-drawer'
import { cn } from '@/lib/utils'

/* ── Score helpers ───────────────────────────────────────────────── */

const SEVERITY_MAP: Record<string, number> = {
  critical: 100, high: 75, medium: 50, low: 25, info: 10,
}

function computeScore(
  ioc: TopIoc,
  rank: number,
  cveMap: Map<string, number>,
): number {
  const severity = (SEVERITY_MAP[ioc.severity] ?? 30) * 0.30
  const confidence = (ioc.confidence ?? 50) * 0.20
  const corroboration = Math.min((ioc.corroboration ?? 0) * 20, 100) * 0.20
  const epss = ioc.type === 'cve' && cveMap.has(ioc.value)
    ? (cveMap.get(ioc.value)! * 100) * 0.15
    : 50 * 0.15
  const recency = Math.max(100 - rank * 20, 10) * 0.15

  return Math.min(Math.round(severity + confidence + corroboration + epss + recency), 100)
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-red-500'
  if (score >= 60) return 'bg-orange-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-green-500'
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-red-400'
  if (score >= 60) return 'text-orange-400'
  if (score >= 40) return 'text-yellow-400'
  return 'text-green-400'
}

const TYPE_BADGE: Record<string, string> = {
  ip: 'bg-blue-500/10 text-blue-300',
  domain: 'bg-purple-500/10 text-purple-300',
  hash: 'bg-slate-500/10 text-slate-300',
  cve: 'bg-orange-500/10 text-orange-300',
  url: 'bg-cyan-500/10 text-cyan-300',
  email: 'bg-green-500/10 text-green-300',
}

/* ── Component ──────────────────────────────────────────────────── */

interface Props { profile: { industry?: string; techStack?: string[] } | null }

export function ThreatScoreWidget({ profile }: Props) {
  const navigate = useNavigate()
  const { open } = useInvestigationDrawer()
  const { topIocs, topCves, isDemo } = useAnalyticsDashboard()

  const scored = useMemo(() => {
    const cveMap = new Map<string, number>(
      topCves.map((c: TopCve) => [c.id, c.epss]),
    )

    return topIocs.slice(0, 5).map((ioc, i) => {
      let score = computeScore(ioc, i, cveMap)
      // Org-aware boost: +10 if industry context matches (simplified heuristic)
      if (profile?.industry && ioc.severity === 'critical') {
        score = Math.min(score + 10, 100)
      }
      return { ...ioc, score }
    }).sort((a, b) => b.score - a.score)
  }, [topIocs, topCves, profile])

  return (
    <div
      data-testid="threat-score-widget"
      onClick={() => navigate('/iocs')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs font-medium text-text-primary">Threat Score</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {/* Content */}
      {scored.length === 0 ? (
        <p className="text-[10px] text-text-muted py-2">No scored IOCs yet</p>
      ) : (
        <div className="space-y-2">
          {scored.map((item) => (
            <div
              key={`${item.type}-${item.value}`}
              className="flex items-center gap-2 hover:bg-bg-elevated rounded px-1 -mx-1 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                open({
                  value: item.value, type: item.type,
                  severity: item.severity, confidence: item.confidence,
                  corroboration: item.corroboration,
                })
              }}
            >
              {/* Type badge */}
              <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${TYPE_BADGE[item.type] ?? 'bg-slate-500/10 text-slate-300'}`}>
                {item.type.toUpperCase()}
              </span>
              {/* Value */}
              <span className="text-[10px] text-text-secondary truncate flex-1 min-w-0">
                {item.value}
              </span>
              {/* Score bar */}
              <div className="w-12 h-1.5 bg-bg-elevated rounded-full overflow-hidden shrink-0">
                <div
                  className={cn('h-full rounded-full', scoreColor(item.score))}
                  style={{ width: `${item.score}%` }}
                />
              </div>
              {/* Score number */}
              <span className={cn('text-[10px] font-bold tabular-nums w-6 text-right shrink-0', scoreTextColor(item.score))}>
                {item.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
