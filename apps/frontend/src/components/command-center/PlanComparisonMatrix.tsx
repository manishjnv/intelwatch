/**
 * @module components/command-center/PlanComparisonMatrix
 * @description Side-by-side plan comparison matrix. Reusable in:
 * - Billing & Plans tab (super_admin + tenant)
 * - Upgrade modals (on 429 QUOTA_EXCEEDED)
 * Rows = 16 features, columns = plans sorted by sortOrder.
 */
import { cn } from '@/lib/utils'
import { Check, X, Crown } from 'lucide-react'
import { FEATURE_LABELS, type FeatureKey } from '@/hooks/use-feature-limits'
import type { PlanDefinition } from '@/hooks/use-plan-builder'

// ─── Helpers ────────────────────────────────────────────────

function fmtINR(amount: number): string {
  if (amount === 0) return 'Free'
  if (amount < 0) return 'Custom'
  return `₹${amount.toLocaleString('en-IN')}`
}

function fmtLimit(val: number): string {
  if (val < 0) return '∞'
  if (val === 0) return '—'
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`
  return String(val)
}

const TIER_COLORS: Record<string, { header: string; cell: string }> = {
  free:       { header: 'bg-bg-elevated text-text-muted', cell: 'bg-bg-primary' },
  starter:    { header: 'bg-sev-low/10 text-sev-low', cell: 'bg-sev-low/5' },
  teams:      { header: 'bg-accent/10 text-accent', cell: 'bg-accent/5' },
  enterprise: { header: 'bg-purple-400/10 text-purple-400', cell: 'bg-purple-400/5' },
}

// ─── Feature Keys order ─────────────────────────────────────

const FEATURE_ORDER: FeatureKey[] = [
  'ioc_management', 'threat_actors', 'malware_intel', 'vulnerability_intel',
  'threat_hunting', 'graph_exploration', 'digital_risk_protection', 'correlation_engine',
  'reports', 'ai_enrichment', 'feed_subscriptions', 'users',
  'data_retention', 'api_access', 'ioc_storage', 'alerts',
]

// ─── Props ──────────────────────────────────────────────────

interface PlanComparisonMatrixProps {
  plans: PlanDefinition[]
  currentPlanId?: string
  onUpgrade?: (planId: string) => void
  compact?: boolean
}

// ─── Component ──────────────────────────────────────────────

export function PlanComparisonMatrix({ plans, currentPlanId, onUpgrade, compact }: PlanComparisonMatrixProps) {
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="overflow-x-auto" data-testid="plan-comparison-matrix">
      <table className="w-full text-sm border-collapse">
        {/* Plan headers */}
        <thead>
          <tr>
            <th className="text-left text-xs text-text-muted pb-2 pr-3 w-[180px] sticky left-0 bg-bg-primary z-10">
              Feature
            </th>
            {sorted.map(plan => {
              const colors = TIER_COLORS[plan.planId] ?? TIER_COLORS.free
              const isCurrent = plan.planId === currentPlanId
              return (
                <th
                  key={plan.id}
                  className={cn(
                    'text-center px-3 py-3 rounded-t-lg text-xs font-semibold min-w-[120px]',
                    colors.header,
                    isCurrent && 'ring-2 ring-accent/40',
                  )}
                  data-testid={`plan-col-${plan.planId}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    {isCurrent && <Crown className="w-3 h-3" />}
                    {plan.name}
                  </div>
                  <div className="text-[10px] font-normal mt-0.5 opacity-80">
                    {fmtINR(plan.priceMonthlyInr)}/mo
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>

        {/* Feature rows */}
        <tbody>
          {FEATURE_ORDER.map((featureKey, rowIdx) => (
            <tr
              key={featureKey}
              className={cn('border-b border-border/30', rowIdx % 2 === 0 && 'bg-bg-secondary/30')}
            >
              <td className="py-2 pr-3 text-xs text-text-secondary sticky left-0 bg-inherit z-10">
                {FEATURE_LABELS[featureKey]}
              </td>
              {sorted.map(plan => {
                const feature = plan.features.find(f => f.featureKey === featureKey)
                const colors = TIER_COLORS[plan.planId] ?? TIER_COLORS.free
                const enabled = feature?.enabled ?? false
                const dailyLimit = feature?.limitDaily ?? 0
                const monthlyLimit = feature?.limitMonthly ?? 0

                return (
                  <td
                    key={plan.id}
                    className={cn('text-center py-2 px-3 text-xs', colors.cell)}
                  >
                    {enabled ? (
                      <div>
                        <Check className="w-3.5 h-3.5 text-sev-low inline-block" />
                        {!compact && (dailyLimit !== 0 || monthlyLimit !== 0) && (
                          <div className="text-[10px] text-text-muted mt-0.5">
                            {fmtLimit(dailyLimit)}/d · {fmtLimit(monthlyLimit)}/mo
                          </div>
                        )}
                      </div>
                    ) : (
                      <X className="w-3.5 h-3.5 text-text-muted/40 inline-block" />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>

        {/* Upgrade buttons */}
        {onUpgrade && (
          <tfoot>
            <tr>
              <td className="sticky left-0 bg-bg-primary z-10" />
              {sorted.map(plan => {
                const isCurrent = plan.planId === currentPlanId
                return (
                  <td key={plan.id} className="text-center py-3 px-2">
                    {isCurrent ? (
                      <span className="text-[10px] text-text-muted">Current plan</span>
                    ) : plan.planId === 'enterprise' ? (
                      <button className="px-3 py-1.5 text-[10px] rounded-lg bg-purple-400/20 text-purple-400 hover:bg-purple-400/30 font-medium">
                        Contact Sales
                      </button>
                    ) : (
                      <button
                        onClick={() => onUpgrade(plan.planId)}
                        className="px-3 py-1.5 text-[10px] rounded-lg bg-accent text-bg-primary hover:bg-accent/90 font-medium"
                        data-testid={`upgrade-to-${plan.planId}`}
                      >
                        Upgrade
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
