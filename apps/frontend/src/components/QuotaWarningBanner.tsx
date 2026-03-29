/**
 * @module components/QuotaWarningBanner
 * @description Quota warning banners (80% amber, 90% red) + upgrade modal (100%).
 * Reads from useQuotaStatus() hook — no extra API calls.
 * The 429 interceptor is installed in lib/api.ts via installQuotaInterceptor().
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, X, ArrowUpCircle, BarChart3 } from 'lucide-react'
import { useQuotaStatus, FEATURE_LABELS, type FeatureKey } from '@/hooks/use-feature-limits'
import { PlanComparisonMatrix } from './command-center/PlanComparisonMatrix'
import { usePlanBuilder } from '@/hooks/use-plan-builder'

// ─── Quota Warning Banner (per-feature) ────────────────────

interface QuotaWarningBannerProps {
  feature: FeatureKey
}

export function QuotaWarningBanner({ feature }: QuotaWarningBannerProps) {
  const quota = useQuotaStatus(feature)
  const [dismissed, setDismissed] = useState(false)

  if (quota.status === 'ok' || (quota.status === 'warning' && dismissed)) {
    return null
  }

  const featureName = FEATURE_LABELS[feature]
  const isWarning = quota.status === 'warning'
  const isCritical = quota.status === 'critical'

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3',
        isWarning && 'bg-sev-medium/10 border border-sev-medium/20 text-sev-medium',
        isCritical && 'bg-sev-critical/10 border border-sev-critical/20 text-sev-critical',
        quota.status === 'exceeded' && 'bg-sev-critical/15 border border-sev-critical/30 text-sev-critical',
      )}
      data-testid={`quota-banner-${feature}`}
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">
        {isWarning && `You've used ${quota.percentage}% of your ${quota.period} ${featureName} limit (${quota.used.toLocaleString()}/${quota.limit.toLocaleString()}). Consider upgrading.`}
        {isCritical && `You've used ${quota.percentage}% of your ${quota.period} ${featureName} limit (${quota.used.toLocaleString()}/${quota.limit.toLocaleString()}). Upgrade now to avoid disruption.`}
        {quota.status === 'exceeded' && `${featureName} ${quota.period} limit reached (${quota.limit.toLocaleString()}/${quota.limit.toLocaleString()}). Upgrade to continue.`}
      </span>
      <a href="/command-center#billing-plans" className="shrink-0 text-[10px] font-medium underline hover:no-underline">
        Upgrade
      </a>
      {isWarning && (
        <button onClick={() => setDismissed(true)} className="shrink-0 p-0.5 rounded hover:bg-black/10" data-testid="dismiss-quota-banner">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Upgrade Modal (triggered on 429 QUOTA_EXCEEDED) ────────

interface QuotaExceededInfo {
  feature: string
  limit: number
  used: number
  period: string
  resetsAt: string
  currentPlan: string
}

interface UpgradeModalProps {
  info: QuotaExceededInfo
  onClose: () => void
}

export function QuotaUpgradeModal({ info, onClose }: UpgradeModalProps) {
  const { plans } = usePlanBuilder()
  const [showComparison, setShowComparison] = useState(false)
  const featureName = FEATURE_LABELS[info.feature as FeatureKey] ?? info.feature

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="quota-upgrade-modal">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-bg-primary rounded-xl border border-border shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full bg-sev-critical/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-sev-critical" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Quota Exceeded</h3>
              <p className="text-xs text-text-muted">{info.currentPlan} plan</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-bg-elevated border border-border mb-4">
            <p className="text-sm text-text-secondary">
              You've reached the <strong className="text-text-primary">{info.period} {featureName}</strong> limit.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <div>
                <span className="text-text-muted">Limit:</span>
                <span className="ml-1 text-text-primary font-medium">{info.limit.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-text-muted">Used:</span>
                <span className="ml-1 text-sev-critical font-medium">{info.used.toLocaleString()}</span>
              </div>
              <div className="col-span-2">
                <span className="text-text-muted">Resets:</span>
                <span className="ml-1 text-text-primary">{new Date(info.resetsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>

          {showComparison && plans.length > 0 && (
            <div className="mb-4">
              <PlanComparisonMatrix
                plans={plans}
                currentPlanId={info.currentPlan.toLowerCase()}
                compact
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <a
              href="/command-center#billing-plans"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-bg-primary text-sm font-medium hover:bg-accent/90"
            >
              <ArrowUpCircle className="w-4 h-4" /> Upgrade Plan
            </a>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-hover"
            >
              <BarChart3 className="w-4 h-4" /> {showComparison ? 'Hide' : 'View'} Plan Comparison
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary"
              data-testid="close-quota-modal"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Global 429 Interceptor Store ───────────────────────────

type QuotaModalListener = (info: QuotaExceededInfo) => void

let _listener: QuotaModalListener | null = null

/** Register the upgrade modal listener (call from App.tsx root). */
export function onQuotaExceeded(listener: QuotaModalListener) {
  _listener = listener
}

/** Called by the API client on 429 QUOTA_EXCEEDED response. */
export function triggerQuotaExceeded(info: QuotaExceededInfo) {
  _listener?.(info)
}
