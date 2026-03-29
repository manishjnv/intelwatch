/**
 * @module components/FeatureGate
 * @description Conditionally renders children based on tenant's plan feature enablement.
 * If the feature is disabled for the current tenant, renders fallback (default: UpgradeCTA).
 * Uses useFeatureLimits() hook — no extra API calls.
 *
 * Usage:
 *   <FeatureGate feature="digital_risk_protection">
 *     <DRPPage />
 *   </FeatureGate>
 *
 * Do NOT wrap existing pages yet — just export the component for later use.
 */
import type { ReactNode } from 'react'
import { ArrowUpCircle, Lock } from 'lucide-react'
import { useFeatureEnabled, FEATURE_LABELS, type FeatureKey } from '@/hooks/use-feature-limits'

// ─── Upgrade CTA (default fallback) ────────────────────────

interface UpgradeCTAProps {
  feature: FeatureKey
}

export function UpgradeCTA({ feature }: UpgradeCTAProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      data-testid={`upgrade-cta-${feature}`}
    >
      <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        {FEATURE_LABELS[feature]} is not available
      </h3>
      <p className="text-sm text-text-secondary mb-6 max-w-md">
        Your current plan does not include access to {FEATURE_LABELS[feature]}.
        Upgrade your plan to unlock this feature and get the full ETIP experience.
      </p>
      <a
        href="/command-center#billing-plans"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-bg-primary text-sm font-medium hover:bg-accent/90 transition-colors"
        data-testid={`upgrade-btn-${feature}`}
      >
        <ArrowUpCircle className="w-4 h-4" />
        Upgrade Plan
      </a>
    </div>
  )
}

// ─── FeatureGate ────────────────────────────────────────────

interface FeatureGateProps {
  feature: FeatureKey
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const enabled = useFeatureEnabled(feature)

  if (!enabled) {
    return <>{fallback ?? <UpgradeCTA feature={feature} />}</>
  }

  return <>{children}</>
}
