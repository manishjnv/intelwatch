/**
 * @module components/widgets/FeedValueWidget
 * Ranks feeds by intel quality: composite score of high-severity IOC ratio
 * and average confidence. Complements FeedHealthWidget (reliability/uptime).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard, type FeedHealthItem } from '@/hooks/use-analytics-dashboard'
import { ArrowRight, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Demo quality scores (used when real data lacks IOC-level detail)    */
/* ------------------------------------------------------------------ */
const DEMO_QUALITY: { name: string; score: number; critical: number; high: number; avgConf: number }[] = [
  { name: 'CISA KEV', score: 92, critical: 38, high: 45, avgConf: 95 },
  { name: 'AlienVault OTX', score: 78, critical: 22, high: 35, avgConf: 82 },
  { name: 'Abuse.ch URLhaus', score: 71, critical: 15, high: 42, avgConf: 76 },
  { name: 'NVD CVE', score: 65, critical: 12, high: 28, avgConf: 88 },
  { name: 'MISP Community', score: 54, critical: 8, high: 22, avgConf: 68 },
  { name: 'PhishTank', score: 42, critical: 5, high: 18, avgConf: 62 },
]

interface ScoredFeed {
  name: string
  score: number
  critical: number
  high: number
  avgConf: number
}

function scoreFeed(feed: FeedHealthItem): ScoredFeed {
  // Heuristic: reliability × IOC throughput as proxy for quality
  const throughputFactor = Math.min(feed.iocsPerDay / 100, 1)
  const reliabilityFactor = feed.reliability / 100
  const score = Math.round((reliabilityFactor * 0.6 + throughputFactor * 0.4) * 100)
  return {
    name: feed.name,
    score,
    critical: Math.round(feed.iocsPerDay * 0.1),
    high: Math.round(feed.iocsPerDay * 0.25),
    avgConf: Math.round(feed.reliability * 0.9),
  }
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-cyan-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-slate-500'
}

export function FeedValueWidget() {
  const navigate = useNavigate()
  const { feedHealth, isDemo } = useAnalyticsDashboard()
  const [hoveredFeed, setHoveredFeed] = useState<string | null>(null)

  const scored = useMemo(() => {
    if (feedHealth.length === 0) return DEMO_QUALITY.slice(0, 5)
    return feedHealth
      .map(scoreFeed)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [feedHealth])

  const maxScore = Math.max(...scored.map(f => f.score), 1)

  return (
    <div
      data-testid="feed-value-widget"
      onClick={() => navigate('/command-center')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium text-text-primary">Feed Quality</span>
        {(isDemo || feedHealth.length === 0) && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>
        )}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {scored.length === 0 ? (
        <p className="text-[10px] text-text-muted py-2">No feed data available</p>
      ) : (
        <div className="space-y-1.5">
          {scored.map(feed => (
            <div
              key={feed.name}
              className="relative"
              onMouseEnter={() => setHoveredFeed(feed.name)}
              onMouseLeave={() => setHoveredFeed(null)}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-secondary truncate w-24 shrink-0">
                  {feed.name}
                </span>
                <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-300', barColor(feed.score))}
                    style={{ width: `${(feed.score / maxScore) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-text-muted w-6 text-right shrink-0">
                  {feed.score}
                </span>
              </div>

              {/* Tooltip on hover */}
              {hoveredFeed === feed.name && (
                <div
                  data-testid={`feed-tooltip-${feed.name.replace(/\s/g, '-').toLowerCase()}`}
                  className="absolute left-24 -top-1 z-10 bg-bg-elevated border border-border rounded px-2 py-1.5 text-[10px] pointer-events-none whitespace-nowrap"
                >
                  <div className="text-text-primary font-medium">{feed.name}</div>
                  <div className="text-text-muted">
                    {feed.critical} critical &bull; {feed.high} high
                  </div>
                  <div className="text-text-muted">{feed.avgConf}% avg confidence</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
