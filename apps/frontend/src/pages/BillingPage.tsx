/**
 * @module pages/BillingPage
 * @description Billing & Subscription dashboard — plan cards, usage meters,
 * upgrade/downgrade flow with confirmation modal, payment history with invoice
 * download, and coupon/promo code input.
 * Connects to billing-service API (port 3019 via nginx /api/v1/billing/*).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useBillingPlans, useUsageMeters, useCurrentSubscription,
  usePaymentHistory, useBillingStats, useApplyCoupon,
  useUpgradePlan, useCancelSubscription,
  type BillingPlan, type PaymentRecord,
} from '@/hooks/use-phase6-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  TrendingUp, Zap, HardDrive, Users,
  CheckCircle2, X, Download, Tag, AlertTriangle, RotateCcw,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────

function fmtINR(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '—'
  if (amount < 0) return 'Contact Sales'
  if (amount === 0) return 'Free'
  return `₹${amount.toLocaleString('en-IN')}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function usagePercent(used: number, limit: number): number {
  if (limit < 0) return 0   // unlimited
  return Math.min(100, Math.round((used / limit) * 100))
}

function usageColor(pct: number): string {
  if (pct >= 90) return 'bg-sev-critical'
  if (pct >= 75) return 'bg-sev-high'
  if (pct >= 50) return 'bg-sev-medium'
  return 'bg-sev-low'
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  if (n < 0) return '∞'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// ─── Sub-components ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  paid:     'text-sev-low bg-sev-low/10',
  pending:  'text-sev-medium bg-sev-medium/10',
  failed:   'text-sev-critical bg-sev-critical/10',
  refunded: 'text-text-muted bg-bg-elevated',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[status] ?? '')}>
      {status}
    </span>
  )
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    Free: 'text-text-muted bg-bg-elevated',
    Starter: 'text-sev-low bg-sev-low/10',
    Pro: 'text-accent bg-accent/10',
    Enterprise: 'text-violet-400 bg-violet-400/10',
  }
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', colors[plan] ?? '')}>
      {plan}
    </span>
  )
}

// ─── Plan Card ───────────────────────────────────────────────────

interface PlanCardProps {
  plan: BillingPlan
  currentPlanId: string
  billingCycle: 'monthly' | 'annual'
  onUpgrade: (planId: string) => void
  onCancel: () => void
}

function PlanCard({ plan, currentPlanId, billingCycle, onUpgrade, onCancel }: PlanCardProps) {
  const isCurrent = plan.id === currentPlanId
  const price = billingCycle === 'annual' ? plan.priceAnnual : plan.price
  const annualSavings = plan.price > 0 ? Math.round(((plan.price - plan.priceAnnual) / plan.price) * 100) : 0

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-5 transition-all duration-200',
        plan.highlighted
          ? 'border-accent bg-accent/5 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
          : 'border-border-subtle bg-bg-elevated',
        isCurrent && 'ring-1 ring-accent',
      )}
    >
      {plan.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-accent text-white text-[10px] font-bold px-3 py-0.5 rounded-full tracking-wide">
            MOST POPULAR
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-text-primary">{plan.name}</h3>
          {isCurrent && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold">
              CURRENT
            </span>
          )}
        </div>
        <div className="flex items-end gap-1">
          <span className="text-2xl font-bold text-text-primary">{fmtINR(price)}</span>
          {price > 0 && <span className="text-xs text-text-muted mb-1">/mo</span>}
        </div>
        {billingCycle === 'annual' && annualSavings > 0 && (
          <p className="text-[11px] text-sev-low mt-0.5">Save {annualSavings}% vs monthly</p>
        )}
        {plan.price < 0 && (
          <p className="text-xs text-text-muted mt-0.5">Custom pricing for your team</p>
        )}
      </div>

      {/* Limits summary */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
        <div className="bg-bg-primary rounded p-2">
          <p className="text-text-muted">Seats</p>
          <p className="font-medium text-text-primary">{plan.seats < 0 ? 'Unlimited' : plan.seats}</p>
        </div>
        <div className="bg-bg-primary rounded p-2">
          <p className="text-text-muted">IOC Limit</p>
          <p className="font-medium text-text-primary">{fmtNumber(plan.iocLimit)}</p>
        </div>
        <div className="bg-bg-primary rounded p-2">
          <p className="text-text-muted">API Calls</p>
          <p className="font-medium text-text-primary">{fmtNumber(plan.apiCallsPerMonth)}/mo</p>
        </div>
        <div className="bg-bg-primary rounded p-2">
          <p className="text-text-muted">Storage</p>
          <p className="font-medium text-text-primary">{plan.storageGb < 0 ? 'Custom' : `${plan.storageGb} GB`}</p>
        </div>
      </div>

      {/* Features */}
      <ul className="flex-1 space-y-1.5 mb-5">
        {Array.isArray(plan.features) && plan.features.map(f => (
          <li key={f} className="flex items-start gap-2 text-[11px] text-text-secondary">
            <CheckCircle2 className="w-3 h-3 text-sev-low shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <button
          onClick={onCancel}
          className="w-full text-xs py-2 rounded-lg border border-border-subtle text-text-muted hover:border-sev-critical hover:text-sev-critical transition-colors"
        >
          Cancel Subscription
        </button>
      ) : plan.price < 0 ? (
        <a
          href="mailto:sales@intelwatch.in"
          className="w-full text-xs py-2 rounded-lg border border-violet-400/40 text-violet-400 hover:bg-violet-400/10 transition-colors text-center block"
        >
          Contact Sales
        </a>
      ) : (
        <button
          onClick={() => onUpgrade(plan.id)}
          className={cn(
            'w-full text-xs py-2 rounded-lg font-medium transition-colors',
            plan.highlighted
              ? 'bg-accent text-white hover:bg-accent/90'
              : 'border border-border-subtle text-text-secondary hover:border-accent hover:text-accent',
          )}
        >
          {plan.price > (billingCycle === 'annual' ? (DEMO_PLAN_PRICES[currentPlanId]?.annual ?? 0) : (DEMO_PLAN_PRICES[currentPlanId]?.monthly ?? 0))
            ? 'Upgrade'
            : 'Downgrade'
          }
        </button>
      )}
    </div>
  )
}

const DEMO_PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  free:       { monthly: 0,      annual: 0 },
  starter:    { monthly: 4_999,  annual: 3_999 },
  pro:        { monthly: 14_999, annual: 11_999 },
  enterprise: { monthly: -1,     annual: -1 },
}

// ─── Usage Meter ────────────────────────────────────────────────

interface UsageMeterProps {
  label: string
  used: number
  limit: number
  icon: React.FC<{ className?: string }>
  unit?: string
}

function UsageMeter({ label, used, limit, icon: Icon, unit = '' }: UsageMeterProps) {
  const pct = usagePercent(used, limit)
  const isUnlimited = limit < 0

  return (
    <div className="bg-bg-elevated rounded-lg p-4 border border-border-subtle">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-medium text-text-secondary">{label}</span>
        </div>
        <span className="text-xs text-text-muted">
          {isUnlimited ? 'Unlimited' : `${pct}%`}
        </span>
      </div>
      <div className="mb-2">
        <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
          {!isUnlimited && (
            <div
              className={cn('h-full rounded-full transition-all duration-500', usageColor(pct))}
              style={{ width: `${pct}%` }}
            />
          )}
          {isUnlimited && <div className="h-full rounded-full bg-sev-low/40 w-full" />}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-sm font-semibold text-text-primary">
          {fmtNumber(used)}{unit}
        </span>
        <span className="text-xs text-text-muted">
          / {isUnlimited ? '∞' : `${fmtNumber(limit)}${unit}`}
        </span>
      </div>
      {pct >= 90 && !isUnlimited && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-sev-critical">
          <AlertTriangle className="w-3 h-3" />
          <span>Approaching limit — consider upgrading</span>
        </div>
      )}
    </div>
  )
}

// ─── Upgrade Confirmation Modal ───────────────────────────────────

interface UpgradeModalProps {
  targetPlanId: string
  plans: BillingPlan[]
  billingCycle: 'monthly' | 'annual'
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
}

function UpgradeModal({ targetPlanId, plans, billingCycle, onConfirm, onClose, isLoading }: UpgradeModalProps) {
  const plan = plans.find(p => p.id === targetPlanId)
  if (!plan) return null
  const price = billingCycle === 'annual' ? plan.priceAnnual : plan.price
  const isUpgrade = price > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-elevated border border-border-subtle rounded-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            {isUpgrade ? 'Upgrade' : 'Downgrade'} to {plan.name}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-bg-primary rounded-lg p-4 mb-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">New plan</span>
            <span className="text-text-primary font-medium">{plan.name}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Billing cycle</span>
            <span className="text-text-primary capitalize">{billingCycle}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">New price</span>
            <span className="text-text-primary font-semibold">{fmtINR(price)}/mo</span>
          </div>
          <div className="border-t border-border-subtle pt-2 text-[11px] text-text-muted">
            Change takes effect immediately. Unused time is prorated.
          </div>
        </div>

        {!isUpgrade && (
          <div className="flex items-start gap-2 bg-sev-high/10 border border-sev-high/30 rounded-lg p-3 mb-4 text-[11px] text-sev-high">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Downgrading may restrict access to features currently in use.</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 text-xs py-2 rounded-lg border border-border-subtle text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'flex-1 text-xs py-2 rounded-lg font-medium transition-colors',
              isUpgrade
                ? 'bg-accent text-white hover:bg-accent/90 disabled:opacity-50'
                : 'bg-sev-high/20 text-sev-high border border-sev-high/40 hover:bg-sev-high/30 disabled:opacity-50',
            )}
          >
            {isLoading ? 'Processing…' : `Confirm ${isUpgrade ? 'Upgrade' : 'Downgrade'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Modal ────────────────────────────────────────────────

function CancelModal({ onConfirm, onClose, isLoading }: { onConfirm: () => void; onClose: () => void; isLoading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-elevated border border-border-subtle rounded-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-sev-critical/15 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-sev-critical" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">Cancel Subscription?</h3>
        </div>
        <p className="text-xs text-text-muted mb-4">
          Your subscription will remain active until the end of the current billing period.
          After that, your account will revert to the Free plan.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 text-xs py-2 rounded-lg border border-border-subtle text-text-muted hover:text-text-primary transition-colors"
          >
            Keep Subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 text-xs py-2 rounded-lg bg-sev-critical/15 text-sev-critical border border-sev-critical/30 hover:bg-sev-critical/25 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Cancelling…' : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Coupon Input ────────────────────────────────────────────────

function CouponInput() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const applyCoupon = useApplyCoupon()

  const handleApply = () => {
    if (!code.trim()) return
    applyCoupon.mutate(code.trim(), {
      onSuccess: (data) => setResult({ ok: true, message: data.message }),
      onError: () => setResult({ ok: false, message: 'Invalid or expired coupon code.' }),
    })
  }

  return (
    <div className="bg-bg-elevated rounded-lg border border-border-subtle p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-amber-400" />
        <h3 className="text-xs font-semibold text-text-primary">Promo Code</h3>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setResult(null) }}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
          placeholder="Enter code"
          className="flex-1 bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleApply}
          disabled={!code.trim() || applyCoupon.isPending}
          className="px-4 py-2 text-xs font-medium bg-amber-400/15 text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/25 disabled:opacity-50 transition-colors"
        >
          {applyCoupon.isPending ? '…' : 'Apply'}
        </button>
      </div>
      {result && (
        <p className={cn('text-[11px] mt-2', result.ok ? 'text-sev-low' : 'text-sev-critical')}>
          {result.message}
        </p>
      )}
    </div>
  )
}

// ─── Payment History Table ────────────────────────────────────────

function PaymentHistoryTable({ payments }: { payments: PaymentRecord[] }) {
  return (
    <div className="bg-bg-elevated rounded-lg border border-border-subtle overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left px-4 py-3 text-text-muted font-medium">Date</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium">Description</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium">Plan</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium">Amount</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium">Status</th>
              <th className="text-center px-4 py-3 text-text-muted font-medium">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(inv => (
              <tr key={inv.id} className="border-b border-border-subtle/50 hover:bg-bg-primary/50 transition-colors">
                <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{fmtDate(inv.date)}</td>
                <td className="px-4 py-3 text-text-primary">{inv.description}</td>
                <td className="px-4 py-3"><PlanBadge plan={inv.plan} /></td>
                <td className="px-4 py-3 text-right font-medium text-text-primary whitespace-nowrap">
                  {fmtINR(inv.amount)}
                </td>
                <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                <td className="px-4 py-3 text-center">
                  {inv.invoiceUrl ? (
                    <a
                      href={inv.invoiceUrl}
                      title="Download Invoice"
                      className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-accent/15 text-text-muted hover:text-accent transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-text-muted">No payment records found.</div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────

type BillingTab = 'plans' | 'usage' | 'history'

const TABS: { key: BillingTab; label: string }[] = [
  { key: 'plans',   label: 'Plans & Upgrade' },
  { key: 'usage',   label: 'Usage Meters' },
  { key: 'history', label: 'Payment History' },
]

export function BillingPage() {
  const [activeTab, setActiveTab] = useState<BillingTab>('plans')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual')
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)

  const { data: plans = [], isDemo: plansDemo } = useBillingPlans()
  const { data: usage } = useUsageMeters()
  const { data: subscription } = useCurrentSubscription()
  const { data: payments } = usePaymentHistory()
  const { data: stats } = useBillingStats()
  const upgradeMutation = useUpgradePlan()
  const cancelMutation = useCancelSubscription()

  const currentPlanId = subscription?.planId ?? 'free'
  const paymentList = payments?.data ?? []

  const handleUpgradeConfirm = () => {
    if (!upgradeTarget) return
    upgradeMutation.mutate(
      { planId: upgradeTarget, billingCycle },
      { onSuccess: () => setUpgradeTarget(null) },
    )
  }

  const handleCancelConfirm = () => {
    cancelMutation.mutate(undefined, { onSuccess: () => setShowCancelModal(false) })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Stats bar ─── */}
      <PageStatsBar title="Billing & Subscription" isDemo={plansDemo}>
        <CompactStat label="Current Plan" value={stats?.currentPlan ?? '—'} />
        <CompactStat label="Monthly Spend" value={stats ? fmtINR(stats.monthlySpend) : '—'} />
        <CompactStat label="Next Billing" value={stats ? fmtDate(stats.nextBillingDate) : '—'} />
        <CompactStat label="API Usage" value={stats ? `${stats.apiUsagePercent}%` : '—'} />
        {subscription?.couponApplied && (
          <CompactStat label="Coupon" value={`${subscription.couponApplied} (${subscription.discountPercent}% off)`} />
        )}
      </PageStatsBar>

      {/* ─── Subscription status banner ─── */}
      {subscription && (
        <div className="mx-4 mt-3 mb-0 flex flex-wrap items-center gap-3 bg-bg-elevated border border-border-subtle rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn(
              'w-2 h-2 rounded-full',
              subscription.status === 'active' ? 'bg-sev-low' :
              subscription.status === 'trialing' ? 'bg-accent' : 'bg-sev-critical',
            )} />
            <span className="text-text-muted">Status:</span>
            <span className="text-text-primary font-medium capitalize">{subscription.status}</span>
          </div>
          <div className="text-xs text-text-muted">·</div>
          <div className="text-xs">
            <span className="text-text-muted">Renews:</span>{' '}
            <span className="text-text-primary">{fmtDate(subscription.currentPeriodEnd)}</span>
          </div>
          <div className="text-xs text-text-muted">·</div>
          <div className="text-xs">
            <span className="text-text-muted">Cycle:</span>{' '}
            <span className="text-text-primary capitalize">{subscription.billingCycle}</span>
          </div>
          {subscription.cancelAtPeriodEnd && (
            <div className="flex items-center gap-1 text-[11px] text-sev-high bg-sev-high/10 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Cancels at period end
            </div>
          )}
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 px-4 pt-4 border-b border-border-subtle">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2',
              activeTab === t.key
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Plans tab ── */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            {/* Billing cycle toggle */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-1 bg-bg-elevated border border-border-subtle rounded-full p-1 text-xs">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={cn(
                    'px-4 py-1.5 rounded-full transition-colors',
                    billingCycle === 'monthly' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={cn(
                    'px-4 py-1.5 rounded-full transition-colors flex items-center gap-1.5',
                    billingCycle === 'annual' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  Annual
                  <span className={cn('text-[10px] rounded-full px-1.5 py-0.5',
                    billingCycle === 'annual' ? 'bg-white/20' : 'bg-sev-low/20 text-sev-low',
                  )}>
                    Save up to 20%
                  </span>
                </button>
              </div>
            </div>

            {/* Plan cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentPlanId={currentPlanId}
                  billingCycle={billingCycle}
                  onUpgrade={id => setUpgradeTarget(id)}
                  onCancel={() => setShowCancelModal(true)}
                />
              ))}
            </div>

            {/* Coupon + info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CouponInput />
              <div className="bg-bg-elevated rounded-lg border border-border-subtle p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RotateCcw className="w-4 h-4 text-text-muted" />
                  <h3 className="text-xs font-semibold text-text-primary">Billing Info</h3>
                </div>
                <ul className="space-y-1 text-[11px] text-text-muted">
                  <li>• All prices include 18% GST</li>
                  <li>• Annual plans are billed as one payment</li>
                  <li>• Upgrades take effect immediately (prorated)</li>
                  <li>• Downgrades take effect at period end</li>
                  <li>• Enterprise: custom terms available</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── Usage tab ── */}
        {activeTab === 'usage' && usage && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <UsageMeter
                label="API Calls"
                used={usage.apiCalls.used}
                limit={usage.apiCalls.limit}
                icon={Zap}
              />
              <UsageMeter
                label="IOC Count"
                used={usage.iocCount.used}
                limit={usage.iocCount.limit}
                icon={TrendingUp}
              />
              <UsageMeter
                label="Storage"
                used={usage.storageGb.used}
                limit={usage.storageGb.limit}
                icon={HardDrive}
                unit=" GB"
              />
              <UsageMeter
                label="Seats"
                used={usage.seats.used}
                limit={usage.seats.limit}
                icon={Users}
              />
            </div>

            {/* Period info */}
            <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4 text-xs">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-text-muted mb-0.5">Billing Period</p>
                  <p className="text-text-primary font-medium">
                    {fmtDate(usage.period.start)} — {fmtDate(usage.period.end)}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted mb-0.5">API Reset</p>
                  <p className="text-text-primary font-medium">{fmtDate(usage.apiCalls.resetAt)}</p>
                </div>
                <div>
                  <p className="text-text-muted mb-0.5">Alert Thresholds</p>
                  <p className="text-text-primary font-medium">80% / 90% / 100%</p>
                </div>
              </div>
            </div>

            {/* CISO tip */}
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-[11px] text-text-secondary">
              <strong className="text-accent">CISO Note:</strong> API call usage at{' '}
              {usagePercent(usage.apiCalls.used, usage.apiCalls.limit)}% — review enrichment
              batch sizes or consider upgrading before the reset date to avoid service throttling.
            </div>
          </div>
        )}

        {/* ── Payment history tab ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-secondary">
                {paymentList.length} invoice{paymentList.length !== 1 ? 's' : ''}
              </h3>
              <p className="text-[11px] text-text-muted">GST invoices in INR. Click <Download className="w-3 h-3 inline" /> to download PDF.</p>
            </div>
            <PaymentHistoryTable payments={paymentList} />
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      {upgradeTarget && (
        <UpgradeModal
          targetPlanId={upgradeTarget}
          plans={plans}
          billingCycle={billingCycle}
          onConfirm={handleUpgradeConfirm}
          onClose={() => setUpgradeTarget(null)}
          isLoading={upgradeMutation.isPending}
        />
      )}
      {showCancelModal && (
        <CancelModal
          onConfirm={handleCancelConfirm}
          onClose={() => setShowCancelModal(false)}
          isLoading={cancelMutation.isPending}
        />
      )}
    </div>
  )
}
