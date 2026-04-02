/**
 * @module components/widgets/ThreatLandscapeBanner
 * Full-width banner showing org-specific threat landscape summary.
 * Displayed when org profile is set (mode=org-aware).
 */
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { getPriorityItems } from '@/lib/relevance-scoring'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import type { OrgProfile } from '@/types/org-profile'
import { BUSINESS_RISKS } from '@/types/org-profile'
import { Crosshair, ArrowRight, Settings } from 'lucide-react'

const SEV_TEXT: Record<string, string> = {
  critical: 'text-sev-critical', high: 'text-sev-high',
  medium: 'text-sev-medium', low: 'text-sev-low', info: 'text-text-muted',
}

export function ThreatLandscapeBanner({ profile }: { profile: OrgProfile }) {
  const navigate = useNavigate()
  const { topIocs, isDemo } = useAnalyticsDashboard()

  const riskLabels = profile.businessRisk
    .map(r => BUSINESS_RISKS.find(b => b.value === r)?.label ?? r)
    .slice(0, 3)

  const techSummary = [
    ...profile.techStack.cloud,
    ...profile.techStack.os,
  ].slice(0, 3).join(', ')

  // Get top threats relevant to this org
  const priorityThreats = getPriorityItems(
    topIocs.map(i => ({ ...i, tags: [i.type], severity: i.severity })),
    profile,
    3,
  )

  return (
    <div
      data-testid="threat-landscape-banner"
      className="p-4 bg-purple-400/5 border border-purple-400/20 rounded-lg mb-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Crosshair className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-sm font-semibold text-text-primary">Your Threat Landscape</span>
            {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
          </div>
          <p className="text-xs text-text-muted">
            <span className="text-text-secondary font-medium">{profile.industry}</span>
            {techSummary && <> &bull; {techSummary}</>}
            {riskLabels.length > 0 && <> &bull; {riskLabels.join(', ')}</>}
          </p>
        </div>

        <button
          onClick={() => navigate('/command-center')}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors shrink-0 mt-1"
          title="Update org profile"
        >
          <Settings className="w-3 h-3" />
          <span className="hidden sm:inline">Update Profile</span>
        </button>
      </div>

      {/* Priority threats */}
      {priorityThreats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {priorityThreats.map((ioc, i) => (
            <button
              key={i}
              onClick={() => navigate(`/search?q=${encodeURIComponent(ioc.value)}`)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-bg-elevated border border-border hover:border-border-strong text-xs transition-colors"
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', `bg-${ioc.severity === 'critical' ? 'sev-critical' : ioc.severity === 'high' ? 'sev-high' : 'sev-medium'}`)} />
              <span className="font-mono text-text-secondary truncate max-w-[120px]">{ioc.value}</span>
              <span className={cn('text-[10px]', SEV_TEXT[ioc.severity] ?? 'text-text-muted')}>{ioc.severity}</span>
            </button>
          ))}
          <button
            onClick={() => navigate('/iocs')}
            className="inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}
