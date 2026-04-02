/**
 * @module components/widgets/TopActorsWidget
 * Top 5 threat actors by IOC count, sorted by org relevance when profile set.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { sortByRelevance } from '@/lib/relevance-scoring'
import type { OrgProfile } from '@/types/org-profile'
import { ArrowRight, Users } from 'lucide-react'

export function TopActorsWidget({ profile }: { profile: OrgProfile | null }) {
  const navigate = useNavigate()
  const { topActors, isDemo } = useAnalyticsDashboard()

  const actors = useMemo(() => {
    const mapped = topActors.map(a => ({
      ...a,
      tags: [a.name.toLowerCase()],
      threatActors: [a.name],
    }))
    const sorted = profile ? sortByRelevance(mapped, profile) : mapped
    return sorted.slice(0, 5)
  }, [topActors, profile])

  const maxCount = Math.max(...actors.map(a => a.iocCount), 1)

  return (
    <div
      data-testid="top-actors-widget"
      onClick={() => navigate('/threat-actors')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-3.5 h-3.5 text-orange-400" />
        <span className="text-xs font-medium text-text-primary">Top Threat Actors</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {actors.length === 0 ? (
        <p className="text-[10px] text-text-muted py-2">No threat actors tracked yet</p>
      ) : (
      <div className="space-y-1.5">
        {actors.map(actor => (
          <div key={actor.name} className="flex items-center gap-2">
            <span className="text-xs text-text-secondary truncate w-24 shrink-0">{actor.name}</span>
            <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-400/60"
                style={{ width: `${(actor.iocCount / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-text-muted w-8 text-right shrink-0">
              {actor.iocCount}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
