/**
 * @module components/widgets/FeedHealthWidget
 * Per-feed health status with reliability bars and health dots.
 */
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { ArrowRight, Rss } from 'lucide-react'

function healthColor(reliability: number): string {
  if (reliability >= 80) return 'bg-sev-low'
  if (reliability >= 50) return 'bg-sev-medium'
  return 'bg-sev-critical'
}

function healthDot(reliability: number): string {
  if (reliability >= 80) return 'bg-sev-low'
  if (reliability >= 50) return 'bg-sev-medium'
  return 'bg-sev-critical'
}

export function FeedHealthWidget() {
  const navigate = useNavigate()
  const { feedHealth, isDemo } = useAnalyticsDashboard()

  const feeds = feedHealth.slice(0, 6)
  const healthyCount = feeds.filter(f => f.reliability >= 80).length
  const totalCount = feeds.length

  return (
    <div
      data-testid="feed-health-widget"
      onClick={() => navigate('/command-center')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Rss className="w-3.5 h-3.5 text-green-400" />
        <span className="text-xs font-medium text-text-primary">Feed Health</span>
        {totalCount > 0 && (
          <span className="text-[10px] text-text-muted ml-auto mr-1">
            {healthyCount}/{totalCount} healthy
            {healthyCount > 0 && (
              <span className="ml-1 px-1 rounded-full bg-green-500/10 text-green-400 text-[9px]">
                +{healthyCount}
              </span>
            )}
          </span>
        )}
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {totalCount === 0 ? (
        <p className="text-[10px] text-text-muted py-2">No feeds configured</p>
      ) : (
      <div className="space-y-1.5">
        {feeds.map(feed => (
          <div key={feed.name} className="flex items-center gap-2">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', healthDot(feed.reliability))} />
            <span className="text-[10px] text-text-muted w-20 shrink-0 truncate">{feed.name}</span>
            <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', healthColor(feed.reliability))}
                style={{ width: `${Math.min(feed.reliability, 100)}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-text-secondary w-8 text-right shrink-0">
              {feed.reliability}%
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
