/**
 * @module components/command-center/BillingPlansTab
 * @description Unified billing & plans tab — absorbs BillingPage + PlanLimitsPage.
 * 6 sub-tabs: Subscription, Invoices, Plans & Upgrade, Limits, Offers, Billing Info.
 * Role-gated: Limits (super-admin only), Billing Info / Plans & Upgrade (tenant only).
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PillSwitcher, type PillItem } from './PillSwitcher'
import type { useCommandCenter } from '@/hooks/use-command-center'
import {
  useBillingPlans, useUsageMeters, useCurrentSubscription,
  usePaymentHistory, useBillingStats, useApplyCoupon,
  useUpgradePlan,
  type BillingPlan, type PaymentRecord,
} from '@/hooks/use-phase6-data'
import { usePlanLimits, type PlanTierConfig } from '@/hooks/use-plan-limits'
import {
  CreditCard, Receipt, Crown, Sliders, Tag, Building2,
  Download, Check, X, ArrowUpCircle, AlertTriangle,
  Edit3, RotateCcw, Gift, Percent, Calendar,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────

type SubTab = 'subscription' | 'invoices' | 'plans' | 'limits' | 'offers' | 'billing-info'

interface BillingPlansTabProps {
  data: ReturnType<typeof useCommandCenter>
}

// ─── Helpers ────────────────────────────────────────────────

function fmtINR(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '—'
  if (amount < 0) return 'Contact Sales'
  if (amount === 0) return 'Free'
  return `₹${amount.toLocaleString('en-IN')}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtNumber(n: number): string {
  if (n < 0) return '∞'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function usagePercent(used: number, limit: number): number {
  if (limit < 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

function usageColor(pct: number): string {
  if (pct >= 90) return 'bg-sev-critical'
  if (pct >= 75) return 'bg-sev-high'
  if (pct >= 50) return 'bg-sev-medium'
  return 'bg-sev-low'
}

const STATUS_COLORS: Record<string, string> = {
  active:    'text-sev-low bg-sev-low/10',
  trialing:  'text-accent bg-accent/10',
  past_due:  'text-sev-high bg-sev-high/10',
  canceled:  'text-text-muted bg-bg-elevated',
  grace:     'text-sev-medium bg-sev-medium/10',
  suspended: 'text-sev-critical bg-sev-critical/10',
  paid:      'text-sev-low bg-sev-low/10',
  pending:   'text-sev-medium bg-sev-medium/10',
  failed:    'text-sev-critical bg-sev-critical/10',
  refunded:  'text-text-muted bg-bg-elevated',
  overdue:   'text-sev-high bg-sev-high/10',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[status] ?? 'bg-bg-hover text-text-muted')}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function PlanBadge({ plan }: { plan: string }) {
  const c: Record<string, string> = {
    Free: 'text-text-muted bg-bg-elevated', Starter: 'text-sev-low bg-sev-low/10',
    Teams: 'text-accent bg-accent/10', Enterprise: 'text-violet-400 bg-violet-400/10',
  }
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', c[plan] ?? 'bg-bg-hover text-text-muted')}>{plan}</span>
}

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_TENANT_SUBSCRIPTIONS = [
  { tenantId: 't-1', name: 'Acme Corp', plan: 'Teams', status: 'active' as const, usagePercent: 72, renewalDate: '2026-04-15' },
  { tenantId: 't-2', name: 'SecOps Ltd', plan: 'Enterprise', status: 'active' as const, usagePercent: 45, renewalDate: '2026-06-01' },
  { tenantId: 't-3', name: 'ThreatLab', plan: 'Starter', status: 'past_due' as const, usagePercent: 91, renewalDate: '2026-03-20' },
  { tenantId: 't-4', name: 'CyberShield', plan: 'Free', status: 'active' as const, usagePercent: 30, renewalDate: '—' },
]

const DEMO_OFFERS = [
  { id: 'c-1', code: 'LAUNCH50', discountPercent: 50, validFrom: '2026-03-01', validTo: '2026-04-30', maxUses: 100, usedCount: 34, targetPlan: 'Starter' },
  { id: 'c-2', code: 'TEAMS20', discountPercent: 20, validFrom: '2026-03-15', validTo: '2026-05-31', maxUses: 50, usedCount: 12, targetPlan: 'Teams' },
  { id: 'c-3', code: 'ANNUAL15', discountPercent: 15, validFrom: '2026-01-01', validTo: '2026-12-31', maxUses: -1, usedCount: 78, targetPlan: null },
]

const PLAN_FEATURES: Record<string, Record<string, string>> = {
  Free:       { iocs: '500', feeds: '5', members: '1', ai: 'Off', exports: '5/mo', integrations: 'None', support: 'Community' },
  Starter:    { iocs: '10K', feeds: '20', members: '5', ai: 'Basic', exports: '50/mo', integrations: '2', support: 'Email' },
  Teams:      { iocs: '100K', feeds: '100', members: '25', ai: 'Full', exports: 'Unlimited', integrations: '10', support: 'Priority' },
  Enterprise: { iocs: 'Unlimited', feeds: 'Unlimited', members: 'Unlimited', ai: 'Full + Custom', exports: 'Unlimited', integrations: 'Unlimited', support: 'Dedicated' },
}

const PLAN_PRICES: Record<string, number> = { Free: 0, Starter: 9999, Teams: 18999, Enterprise: 49999 }

// ─── Subscription Sub-Tab ────────────────────────────────────

function SubscriptionPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const sub = useCurrentSubscription()
  const usage = useUsageMeters()
  const stats = useBillingStats()

  if (isSuperAdmin) {
    return (
      <div className="space-y-4" data-testid="subscription-admin">
        <h3 className="text-sm font-semibold text-text-primary">All Tenant Subscriptions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="tenant-subscriptions-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted text-xs">
                <th className="pb-2 pr-4">Tenant</th>
                <th className="pb-2 pr-4">Plan</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Usage</th>
                <th className="pb-2">Renewal</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_TENANT_SUBSCRIPTIONS.map(t => (
                <tr key={t.tenantId} className="border-b border-border/50 hover:bg-bg-hover">
                  <td className="py-2 pr-4 font-medium text-text-primary">{t.name}</td>
                  <td className="py-2 pr-4"><PlanBadge plan={t.plan} /></td>
                  <td className="py-2 pr-4"><StatusBadge status={t.status} /></td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                        <div className={cn('h-full rounded-full', usageColor(t.usagePercent))} style={{ width: `${t.usagePercent}%` }} />
                      </div>
                      <span className="text-xs text-text-muted">{t.usagePercent}%</span>
                    </div>
                  </td>
                  <td className="py-2 text-text-muted">{t.renewalDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const s = sub.data
  const u = usage.data

  return (
    <div className="space-y-4" data-testid="subscription-tenant">
      {/* Current plan card */}
      <div className="p-4 rounded-lg border border-border bg-bg-elevated">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">{s?.planName ?? 'Free'} Plan</span>
            <PlanBadge plan={s?.planName ?? 'Free'} />
          </div>
          <StatusBadge status={s?.status ?? 'active'} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-text-muted">Price</span>
            <p className="font-medium text-text-primary">{fmtINR(PLAN_PRICES[s?.planName ?? 'Free'] ?? 0)}/mo</p>
          </div>
          <div>
            <span className="text-text-muted">Cycle</span>
            <p className="font-medium text-text-primary capitalize">{s?.billingCycle ?? 'monthly'}</p>
          </div>
          <div>
            <span className="text-text-muted">Renewal</span>
            <p className="font-medium text-text-primary">{s?.currentPeriodEnd ? fmtDate(s.currentPeriodEnd) : '—'}</p>
          </div>
          <div>
            <span className="text-text-muted">Discount</span>
            <p className="font-medium text-text-primary">{s?.discountPercent ? `${s.discountPercent}%` : 'None'}</p>
          </div>
        </div>
      </div>

      {/* Usage meters */}
      {u && (
        <div className="space-y-3" data-testid="usage-meters">
          <h3 className="text-sm font-semibold text-text-primary">Usage</h3>
          {[
            { label: 'API Calls', used: u.apiCalls.used, limit: u.apiCalls.limit },
            { label: 'IOCs', used: u.iocCount.used, limit: u.iocCount.limit },
            { label: 'Storage', used: u.storageGb.used, limit: u.storageGb.limit, suffix: 'GB' },
            { label: 'Team Members', used: u.seats.used, limit: u.seats.limit },
          ].map(m => {
            const pct = usagePercent(m.used, m.limit)
            return (
              <div key={m.label} className="flex items-center gap-3">
                <span className="text-xs text-text-muted w-24 shrink-0">{m.label}</span>
                <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', usageColor(pct))} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-text-muted w-24 text-right shrink-0">
                  {fmtNumber(m.used)}{m.suffix ? m.suffix : ''} / {m.limit < 0 ? '∞' : fmtNumber(m.limit)}{m.suffix ?? ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Invoices Sub-Tab ───────────────────────────────────────

function InvoicesPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const history = usePaymentHistory()
  const invoices = history.data?.data ?? []

  return (
    <div className="space-y-3" data-testid="invoices-panel">
      <h3 className="text-sm font-semibold text-text-primary">Invoice History</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="invoices-table">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs">
              <th className="pb-2 pr-4">Date</th>
              {isSuperAdmin && <th className="pb-2 pr-4">Tenant</th>}
              <th className="pb-2 pr-4">Invoice #</th>
              <th className="pb-2 pr-4">Amount</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2">Download</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: PaymentRecord) => (
              <tr key={inv.id} className="border-b border-border/50 hover:bg-bg-hover">
                <td className="py-2 pr-4 text-text-muted">{fmtDate(inv.date)}</td>
                {isSuperAdmin && <td className="py-2 pr-4 text-text-primary">{inv.plan}</td>}
                <td className="py-2 pr-4 font-mono text-text-primary text-xs">INV-{inv.id.slice(0, 6).toUpperCase()}</td>
                <td className="py-2 pr-4 font-medium text-text-primary">{fmtINR(inv.amount)}</td>
                <td className="py-2 pr-4"><StatusBadge status={inv.status} /></td>
                <td className="py-2">
                  <button
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent"
                    title="Download PDF"
                    data-testid={`download-invoice-${inv.id}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={isSuperAdmin ? 6 : 5} className="py-8 text-center text-text-muted text-sm">No invoices yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Plans & Upgrade Sub-Tab ─────────────────────────────────

function PlansUpgradePanel() {
  const plans = useBillingPlans()
  const sub = useCurrentSubscription()
  const upgrade = useUpgradePlan()
  const currentPlan = sub.data?.planName ?? 'Free'

  const planList: { name: string; price: number; features: Record<string, string> }[] = [
    { name: 'Free', price: 0, features: PLAN_FEATURES.Free },
    { name: 'Starter', price: 9999, features: PLAN_FEATURES.Starter },
    { name: 'Teams', price: 18999, features: PLAN_FEATURES.Teams },
    { name: 'Enterprise', price: 49999, features: PLAN_FEATURES.Enterprise },
  ]

  const featureKeys = ['iocs', 'feeds', 'members', 'ai', 'exports', 'integrations', 'support']
  const featureLabels: Record<string, string> = {
    iocs: 'IOC Limit', feeds: 'Feeds', members: 'Team Members',
    ai: 'AI Enrichment', exports: 'Exports', integrations: 'Integrations', support: 'Support',
  }

  return (
    <div className="space-y-4" data-testid="plans-upgrade">
      {currentPlan === 'Free' && (
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 text-sm text-accent flex items-center gap-2">
          <ArrowUpCircle className="w-4 h-4 shrink-0" />
          Upgrade to unlock AI enrichment, more feeds, team collaboration, and integrations.
        </div>
      )}

      {/* Plan cards — responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="plan-cards">
        {planList.map(p => {
          const isCurrent = p.name === currentPlan
          const isHigher = planList.findIndex(x => x.name === currentPlan) < planList.findIndex(x => x.name === p.name)
          return (
            <div
              key={p.name}
              className={cn(
                'p-4 rounded-lg border transition-all',
                isCurrent ? 'border-accent bg-accent/5 ring-1 ring-accent/30' : 'border-border bg-bg-elevated hover:border-border-hover',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary">{p.name}</span>
                {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-medium">Current</span>}
              </div>
              <p className="text-lg font-bold text-text-primary mb-3">{fmtINR(p.price)}<span className="text-xs font-normal text-text-muted">/mo</span></p>

              <div className="space-y-1.5 mb-4">
                {featureKeys.map(k => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-text-muted">{featureLabels[k]}</span>
                    <span className="text-text-primary font-medium">{p.features[k]}</span>
                  </div>
                ))}
              </div>

              {isCurrent ? (
                <div className="text-center text-xs text-text-muted py-2">Your current plan</div>
              ) : p.name === 'Enterprise' ? (
                <button className="w-full py-2 rounded-lg bg-violet-500/20 text-violet-400 text-xs font-medium hover:bg-violet-500/30 transition-colors">
                  Contact Sales
                </button>
              ) : isHigher ? (
                <button
                  className="w-full py-2 rounded-lg bg-accent text-bg-primary text-xs font-semibold hover:bg-accent/90 transition-colors"
                  onClick={() => upgrade.mutate({ planId: p.name.toLowerCase(), billingCycle: 'monthly' })}
                  data-testid={`upgrade-${p.name.toLowerCase()}`}
                >
                  Upgrade to {p.name}
                </button>
              ) : (
                <div className="text-center text-xs text-text-muted py-2">—</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Limits Sub-Tab (super-admin) ────────────────────────────

function LimitsPanel() {
  const { plans, isDemo, updatePlan, isUpdating, resetPlan } = usePlanLimits()
  const [editing, setEditing] = useState<{ planId: string; field: string } | null>(null)
  const [editVal, setEditVal] = useState('')

  const fields: { key: keyof PlanTierConfig; label: string }[] = [
    { key: 'maxPrivateFeeds', label: 'Private Feeds' },
    { key: 'maxGlobalSubscriptions', label: 'Global Subs' },
    { key: 'minFetchIntervalMinutes', label: 'Min Interval' },
    { key: 'retentionDays', label: 'Retention (days)' },
    { key: 'dailyTokenBudget', label: 'Daily Tokens' },
  ]

  function startEdit(planId: string, field: string, currentVal: number) {
    setEditing({ planId, field })
    setEditVal(String(currentVal))
  }

  function saveEdit() {
    if (!editing) return
    updatePlan({ planId: editing.planId, changes: { [editing.field]: Number(editVal) } })
    setEditing(null)
  }

  return (
    <div className="space-y-3" data-testid="limits-panel">
      <h3 className="text-sm font-semibold text-text-primary">Per-Plan Quota Management</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="limits-table">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs">
              <th className="pb-2 pr-4">Plan</th>
              {fields.map(f => <th key={f.key} className="pb-2 pr-3">{f.label}</th>)}
              <th className="pb-2 pr-3">AI</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p: PlanTierConfig) => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-bg-hover">
                <td className="py-2 pr-4"><PlanBadge plan={p.planName} /></td>
                {fields.map(f => {
                  const val = p[f.key] as number
                  const isEditing = editing?.planId === p.id && editing.field === f.key
                  return (
                    <td key={f.key} className="py-2 pr-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            className="w-16 px-1 py-0.5 text-xs rounded bg-bg-primary border border-accent text-text-primary"
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveEdit()}
                            autoFocus
                            data-testid={`edit-input-${p.id}-${f.key}`}
                          />
                          <button onClick={saveEdit} className="text-sev-low hover:text-sev-low/80"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditing(null)} className="text-sev-high hover:text-sev-high/80"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-text-primary hover:text-accent cursor-pointer"
                          onClick={() => startEdit(p.id, f.key, val)}
                          data-testid={`limit-cell-${p.id}-${f.key}`}
                        >
                          {val < 0 ? '∞' : fmtNumber(val)}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="py-2 pr-3">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', p.aiEnabled ? 'bg-sev-low/10 text-sev-low' : 'bg-bg-hover text-text-muted')}>
                    {p.aiEnabled ? 'On' : 'Off'}
                  </span>
                </td>
                <td className="py-2">
                  <button
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent"
                    onClick={() => resetPlan(p.id)}
                    title="Reset to defaults"
                    data-testid={`reset-${p.id}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Offers Sub-Tab ──────────────────────────────────────────

function OffersPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const applyCoupon = useApplyCoupon()
  const [couponCode, setCouponCode] = useState('')

  if (isSuperAdmin) {
    return (
      <div className="space-y-3" data-testid="offers-admin">
        <h3 className="text-sm font-semibold text-text-primary">Coupon Management</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="coupons-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted text-xs">
                <th className="pb-2 pr-4">Code</th>
                <th className="pb-2 pr-4">Discount</th>
                <th className="pb-2 pr-4">Valid</th>
                <th className="pb-2 pr-4">Uses</th>
                <th className="pb-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_OFFERS.map(o => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-bg-hover">
                  <td className="py-2 pr-4 font-mono text-xs text-accent font-medium">{o.code}</td>
                  <td className="py-2 pr-4 text-text-primary">{o.discountPercent}%</td>
                  <td className="py-2 pr-4 text-text-muted text-xs">{fmtDate(o.validFrom)} – {fmtDate(o.validTo)}</td>
                  <td className="py-2 pr-4 text-text-muted">{o.usedCount}/{o.maxUses < 0 ? '∞' : o.maxUses}</td>
                  <td className="py-2">{o.targetPlan ? <PlanBadge plan={o.targetPlan} /> : <span className="text-xs text-text-muted">All plans</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="offers-tenant">
      <h3 className="text-sm font-semibold text-text-primary">Apply Coupon</h3>
      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          placeholder="Enter coupon code"
          value={couponCode}
          onChange={e => setCouponCode(e.target.value)}
          data-testid="coupon-input"
        />
        <button
          className="px-4 py-2 rounded-lg bg-accent text-bg-primary text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          disabled={!couponCode.trim() || applyCoupon.isPending}
          onClick={() => applyCoupon.mutate(couponCode.trim())}
          data-testid="apply-coupon-btn"
        >
          Apply
        </button>
      </div>
      {applyCoupon.isSuccess && (
        <p className="text-xs text-sev-low flex items-center gap-1"><Check className="w-3 h-3" /> Coupon applied successfully!</p>
      )}
      {applyCoupon.isError && (
        <p className="text-xs text-sev-high flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Invalid or expired coupon code.</p>
      )}

      {/* Active offers */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Active Promotions</h4>
        {DEMO_OFFERS.filter(o => new Date(o.validTo) > new Date()).map(o => (
          <div key={o.id} className="flex items-center gap-3 p-2 rounded-lg bg-bg-elevated border border-border">
            <Gift className="w-4 h-4 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary">{o.discountPercent}% off {o.targetPlan ?? 'any plan'}</p>
              <p className="text-[10px] text-text-muted">Code: {o.code} · Expires {fmtDate(o.validTo)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Billing Info Sub-Tab ────────────────────────────────────

function BillingInfoPanel() {
  return (
    <div className="space-y-4" data-testid="billing-info">
      <h3 className="text-sm font-semibold text-text-primary">Payment Method</h3>
      <div className="p-3 rounded-lg bg-bg-elevated border border-border flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-accent" />
        <div className="flex-1">
          <p className="text-sm text-text-primary font-medium">•••• •••• •••• 4242</p>
          <p className="text-xs text-text-muted">Expires 12/2028</p>
        </div>
        <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:border-accent text-text-muted hover:text-accent transition-colors">
          Update
        </button>
      </div>

      <h3 className="text-sm font-semibold text-text-primary">Billing Address</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-muted block mb-1">Company Name</label>
          <input className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary" placeholder="Your Company" />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">GST Number</label>
          <input className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary" placeholder="29ABCDE1234F1ZK" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-text-muted block mb-1">Address</label>
          <input className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary" placeholder="123 Business Park, Bangalore" />
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated border border-border">
        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <input type="checkbox" className="rounded border-border accent-accent" defaultChecked />
          Generate GST invoices
        </label>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────

export function BillingPlansTab({ data }: BillingPlansTabProps) {
  const { isSuperAdmin } = data
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('subscription')

  const pills: PillItem[] = useMemo(() => {
    const items: PillItem[] = [
      { id: 'subscription', label: 'Subscription' },
      { id: 'invoices', label: 'Invoices' },
    ]
    if (!isSuperAdmin) {
      items.push({ id: 'plans', label: 'Plans & Upgrade' })
    }
    if (isSuperAdmin) {
      items.push({ id: 'limits', label: 'Limits' })
    }
    items.push({ id: 'offers', label: 'Offers' })
    if (!isSuperAdmin) {
      items.push({ id: 'billing-info', label: 'Billing Info' })
    }
    return items
  }, [isSuperAdmin])

  const effectiveSubTab = pills.find(p => p.id === activeSubTab) ? activeSubTab : pills[0]?.id as SubTab

  return (
    <div className="space-y-4" data-testid="billing-plans-tab">
      <PillSwitcher items={pills} activeId={effectiveSubTab} onChange={id => setActiveSubTab(id as SubTab)} />

      {effectiveSubTab === 'subscription' && <SubscriptionPanel isSuperAdmin={isSuperAdmin} />}
      {effectiveSubTab === 'invoices' && <InvoicesPanel isSuperAdmin={isSuperAdmin} />}
      {effectiveSubTab === 'plans' && !isSuperAdmin && <PlansUpgradePanel />}
      {effectiveSubTab === 'limits' && isSuperAdmin && <LimitsPanel />}
      {effectiveSubTab === 'offers' && <OffersPanel isSuperAdmin={isSuperAdmin} />}
      {effectiveSubTab === 'billing-info' && !isSuperAdmin && <BillingInfoPanel />}
    </div>
  )
}
