/**
 * @module components/PlanCards
 * @description Shared plan selection cards used in both self-service registration
 * and invite-based onboarding. Matches the billing screenshot layout.
 */
import { cn } from '@/lib/utils'
import { Check, Loader2, Crown } from 'lucide-react'

// ─── Plan Definitions ─────────────────────────────────────

export interface PlanDef {
  id: string
  name: string
  price: number
  priceLabel: string
  saveLabel?: string
  popular?: boolean
  stats: { seats: string; iocLimit: string; apiCalls: string; storage: string }
  features: string[]
  cta: 'select' | 'contact'
}

export const PLANS: PlanDef[] = [
  {
    id: 'free', name: 'Free', price: 0, priceLabel: 'Free',
    stats: { seats: '2', iocLimit: '10K', apiCalls: '10K/mo', storage: '1 GB' },
    features: [
      'Up to 2 users', '10K API calls / month', '10K IOC limit',
      '1 GB storage', 'RSS + STIX feeds', 'Basic IOC search', 'Community support',
    ],
    cta: 'select',
  },
  {
    id: 'starter', name: 'Starter', price: 7999, priceLabel: '₹7,999',
    saveLabel: 'Save 20% vs monthly',
    stats: { seats: '10', iocLimit: '50K', apiCalls: '100K/mo', storage: '10 GB' },
    features: [
      'Up to 10 users', '100K API calls / month', '50K IOC limit',
      '10 GB storage', 'All feed types', 'AI enrichment (Haiku)',
      'SIEM integration (1)', 'Email support',
    ],
    cta: 'select',
  },
  {
    id: 'pro', name: 'Teams', price: 14999, priceLabel: '₹14,999',
    saveLabel: 'Save 21% vs monthly', popular: true,
    stats: { seats: '25', iocLimit: '250K', apiCalls: '250K/mo', storage: '50 GB' },
    features: [
      'Up to 25 users', '250K API calls / month', '250K IOC limit',
      '50 GB storage', 'All feed types', 'AI enrichment (Haiku)',
      'Threat Graph (read-only)', 'SIEM integrations (3)', 'Priority email support',
    ],
    cta: 'select',
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 39999, priceLabel: '₹39,999',
    saveLabel: 'Save 20% vs monthly',
    stats: { seats: 'Unlimited', iocLimit: '∞', apiCalls: '∞/mo', storage: 'Custom' },
    features: [
      'Unlimited users', 'Unlimited API calls', 'Unlimited IOCs',
      'Custom storage', 'AI enrichment (Opus)', 'Full platform access',
      'Custom integrations', 'Dedicated SLA', 'On-prem option', '24/7 dedicated support',
    ],
    cta: 'contact',
  },
]

// ─── Plan Cards Grid ──────────────────────────────────────

interface PlanCardsProps {
  onSelectPlan: (planId: string) => void
  selectedPlan: string | null
  isSubmitting: boolean
  orgName: string
  error?: string
}

export function PlanCards({ onSelectPlan, selectedPlan, isSubmitting, orgName, error }: PlanCardsProps) {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-xl font-semibold text-text-primary">Choose your plan</h1>
        <p className="text-sm text-text-muted mt-1">
          Select the plan that fits <strong className="text-text-primary">{orgName}</strong>
        </p>
        <p className="text-xs text-accent mt-1">All paid plans include a 7-day free trial</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-sev-critical/10 border border-sev-critical/30 text-sm text-sev-critical text-center">
          {error}
        </div>
      )}

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {PLANS.map(plan => {
          const isSelected = selectedPlan === plan.id
          return (
            <div
              key={plan.id}
              className={cn(
                'relative rounded-xl border transition-all flex flex-col',
                plan.popular ? 'border-accent ring-1 ring-accent/30' : 'border-border',
                isSelected && 'ring-2 ring-accent',
                'bg-bg-primary hover:border-border-hover',
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-accent text-white text-[10px] font-semibold rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-semibold text-text-primary">{plan.name}</h3>
                </div>
                <div className="mb-1">
                  <span className="text-2xl font-bold text-text-primary">{plan.priceLabel}</span>
                  {plan.price > 0 && <span className="text-xs text-text-muted ml-1">/mo</span>}
                </div>
                {plan.saveLabel && <p className="text-[10px] text-sev-low mb-3">{plan.saveLabel}</p>}
                {!plan.saveLabel && <div className="mb-3" />}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {(['seats', 'iocLimit', 'apiCalls', 'storage'] as const).map(key => (
                    <div key={key} className="p-2 rounded-lg bg-bg-elevated border border-border/50">
                      <p className="text-[10px] text-text-muted">{
                        key === 'seats' ? 'Seats' :
                        key === 'iocLimit' ? 'IOC Limit' :
                        key === 'apiCalls' ? 'API Calls' : 'Storage'
                      }</p>
                      <p className="text-sm font-semibold text-text-primary">{plan.stats[key]}</p>
                    </div>
                  ))}
                </div>

                {/* Feature List */}
                <div className="space-y-1.5 mb-5 flex-1">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-start gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-sev-low shrink-0 mt-0.5" />
                      <span className="text-text-secondary">{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => onSelectPlan(plan.id)}
                  disabled={isSubmitting}
                  className={cn(
                    'w-full py-2.5 rounded-lg text-sm font-medium transition-colors',
                    plan.cta === 'contact'
                      ? 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30'
                      : plan.popular
                        ? 'bg-accent text-white hover:bg-accent/90'
                        : 'border border-border text-text-primary hover:bg-bg-elevated',
                    isSubmitting && isSelected && 'opacity-50',
                  )}
                >
                  {isSubmitting && isSelected ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up...
                    </span>
                  ) : plan.cta === 'contact' ? (
                    'Contact Sales'
                  ) : (
                    `Select ${plan.name}`
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Billing Info Footer */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-border bg-bg-primary">
          <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
            <Crown className="w-4 h-4 text-accent" /> Promo Code
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter code"
              className="flex-1 h-9 px-3 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted"
            />
            <button className="px-4 h-9 rounded-lg border border-border text-xs font-medium text-text-primary hover:bg-bg-elevated">
              Apply
            </button>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-bg-primary">
          <h4 className="text-sm font-medium text-text-primary mb-2">Billing Info</h4>
          <ul className="text-xs text-text-muted space-y-1">
            <li>• All prices include 18% GST</li>
            <li>• Annual plans are billed as one payment</li>
            <li>• Upgrades take effect immediately (prorated)</li>
            <li>• Enterprise: custom terms available</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
