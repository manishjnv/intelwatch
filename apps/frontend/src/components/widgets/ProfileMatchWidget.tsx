/**
 * @module components/widgets/ProfileMatchWidget
 * Shows top 5 IOCs matching the org profile. Only renders in org-aware mode.
 * Falls back to "Set profile to see matches" in global mode.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { getPriorityItems } from '@/lib/relevance-scoring'
import type { OrgProfile } from '@/types/org-profile'
import { ArrowRight, Crosshair } from 'lucide-react'

const SEV_COLOR: Record<string, string> = {
  critical: 'text-sev-critical',
  high: 'text-sev-high',
  medium: 'text-sev-medium',
  low: 'text-sev-low',
  info: 'text-text-muted',
}

interface ProfileMatchWidgetProps {
  profile: OrgProfile | null
}

export function ProfileMatchWidget({ profile }: ProfileMatchWidgetProps) {
  const navigate = useNavigate()
  const { topIocs, isDemo } = useAnalyticsDashboard()

  const matches = useMemo(() => {
    if (!profile) return []
    const items = topIocs.map(ioc => ({
      ...ioc,
      tags: [ioc.type, ioc.severity],
      iocType: ioc.type,
    }))
    return getPriorityItems(items, profile, 5)
  }, [topIocs, profile])

  // Don't render at all when no profile (global mode)
  if (!profile) return null

  return (
    <div
      data-testid="profile-match-widget"
      onClick={() => navigate('/iocs')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-text-primary">Matching Your Profile</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {matches.length === 0 ? (
        <p className="text-[10px] text-text-muted" data-testid="profile-match-empty">
          No IOCs currently match your profile
        </p>
      ) : (
        <div className="space-y-1.5">
          {matches.map((ioc, i) => (
            <div key={`${ioc.value}-${i}`} className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-text-muted w-10 shrink-0">{ioc.type}</span>
              <span className="text-xs text-text-secondary truncate flex-1 font-mono">{ioc.value}</span>
              <span className={`text-[10px] font-medium shrink-0 ${SEV_COLOR[ioc.severity] ?? SEV_COLOR.info}`}>
                {ioc.severity.slice(0, 4).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
