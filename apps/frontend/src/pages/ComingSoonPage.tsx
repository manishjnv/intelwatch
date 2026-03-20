/**
 * @module pages/ComingSoonPage
 * @description Reusable placeholder for Phase 2-5 module routes.
 * Resolves module config from the current URL path and shows a
 * branded "coming soon" layout with skeleton preview.
 */
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getModuleByRoute, getPhaseColor, getPhaseBgColor } from '@/config/modules'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { SkeletonBlock } from '@etip/shared-ui/components/SkeletonBlock'

export function ComingSoonPage() {
  const { pathname } = useLocation()
  const mod = getModuleByRoute(pathname)

  if (!mod) {
    return (
      <div className="p-6 text-center">
        <p className="text-text-muted">Module not found.</p>
        <Link to="/dashboard" className="text-accent text-sm mt-2 inline-block hover:underline">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  const Icon = mod.icon
  const phaseColor = getPhaseColor(mod.phase)
  const phaseBg = getPhaseBgColor(mod.phase)

  return (
    <div>
      {/* Page stats bar with placeholder values */}
      <PageStatsBar>
        <CompactStat label="Status" value="Coming Soon" color={phaseColor} />
        <CompactStat label="Phase" value={String(mod.phase)} />
        <CompactStat label="Module" value={mod.id} />
      </PageStatsBar>

      <div className="p-4 sm:p-6">
        {/* Back link */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Dashboard
        </Link>

        {/* Module header */}
        <div className="flex items-center gap-4 mb-6">
          <div className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center shrink-0',
            phaseBg,
          )}>
            <Icon size={28} className={mod.color} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-text-primary">{mod.title}</h1>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-medium',
                phaseBg, phaseColor,
              )}>
                Phase {mod.phase}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-0.5">{mod.description}</p>
          </div>
        </div>

        {/* Coming Soon banner */}
        <div className={cn(
          'rounded-lg p-5 mb-8 border',
          `bg-[var(--bg-elevated)] border-[var(--border)]`,
        )}>
          <div className="flex items-start gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
              phaseBg,
            )}>
              <Rocket className={cn('w-5 h-5', phaseColor)} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                Coming in Phase {mod.phase}
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                {mod.helpText}
              </p>
              <p className="text-xs text-text-muted mt-2">
                This module is part of the ETIP roadmap and will be available in a future update.
                Check the dashboard for the latest status.
              </p>
            </div>
          </div>
        </div>

        {/* Skeleton preview — ghost of what the page will look like */}
        <div className="space-y-4">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Preview</div>

          {/* Ghost stats row */}
          <div className="flex gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-3">
                <SkeletonBlock rows={1} widths={['60%']} height="h-2" />
                <div className="mt-2">
                  <SkeletonBlock rows={1} widths={['40%']} height="h-4" />
                </div>
              </div>
            ))}
          </div>

          {/* Ghost table */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4">
            <SkeletonBlock rows={1} widths={['30%']} height="h-3" />
            <div className="mt-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex gap-4 items-center">
                  <SkeletonBlock rows={1} widths={['100%']} height="h-2.5" className="flex-[2]" />
                  <SkeletonBlock rows={1} widths={['100%']} height="h-2.5" className="flex-1" />
                  <SkeletonBlock rows={1} widths={['100%']} height="h-2.5" className="flex-1" />
                  <SkeletonBlock rows={1} widths={['100%']} height="h-2.5" className="w-20" />
                </div>
              ))}
            </div>
          </div>

          {/* Ghost chart area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 h-40">
              <SkeletonBlock rows={1} widths={['40%']} height="h-3" />
              <div className="mt-4">
                <SkeletonBlock rows={3} widths={['100%', '75%', '50%']} height="h-6" />
              </div>
            </div>
            <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 h-40">
              <SkeletonBlock rows={1} widths={['45%']} height="h-3" />
              <div className="mt-4">
                <SkeletonBlock rows={3} widths={['90%', '60%', '80%']} height="h-6" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
