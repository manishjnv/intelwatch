/**
 * @module pages/ClientOnboardingPage
 * @description Public invite landing page for new clients.
 * Step 1: Update org details + set password (account setup).
 * Step 2: View plans and select one (screenshot-matching card layout).
 * URL: /onboard/invite?token=xxx&email=xxx
 */
import { useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Shield, Eye, EyeOff, Loader2, Check, ArrowRight, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Plan Definitions (matches billing screenshot) ─────────

interface PlanDef {
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

const PLANS: PlanDef[] = [
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

// ─── Component ──────────────────────────────────────────────

export function ClientOnboardingPage() {
  const [params] = useSearchParams()
  const inviteToken = params.get('token') ?? ''
  const inviteEmail = params.get('email') ?? ''

  const [step, setStep] = useState<'account' | 'plans'>('account')
  const [displayName, setDisplayName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const tenantSlug = useMemo(
    () => orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63),
    [orgName],
  )

  const accountValid = displayName && orgName && password.length >= 12

  if (!inviteToken || !inviteEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="text-center">
          <Shield className="w-12 h-12 text-sev-critical mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-text-primary mb-2">Invalid Invite Link</h1>
          <p className="text-sm text-text-muted mb-4">This invite link is missing or expired.</p>
          <Link to="/login" className="text-accent hover:underline text-sm">Go to login</Link>
        </div>
      </div>
    )
  }

  // ─── Done State ─────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-sev-low/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-sev-low" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary mb-2">You're all set!</h1>
          <p className="text-sm text-text-muted mb-6">
            Your account has been created and the <strong className="text-text-primary">{selectedPlan === 'enterprise' ? 'Enterprise' : PLANS.find(p => p.id === selectedPlan)?.name}</strong> plan is active.
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90"
          >
            Sign in to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  async function handleAccountNext(e: React.FormEvent) {
    e.preventDefault()
    if (!accountValid) return
    setStep('plans')
  }

  async function handleSelectPlan(planId: string) {
    if (planId === 'enterprise') {
      window.open('mailto:sales@intelwatch.in?subject=Enterprise Plan Inquiry', '_blank')
      return
    }
    setSelectedPlan(planId)
    setIsSubmitting(true)
    try {
      // Register account with selected plan
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          password,
          displayName,
          tenantName: orgName,
          tenantSlug,
          inviteToken,
          plan: planId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Registration failed' }))
        throw new Error(err.message ?? 'Registration failed')
      }
      setDone(true)
    } catch {
      setIsSubmitting(false)
      setSelectedPlan(null)
    }
  }

  // ─── Step 1: Account Setup ──────────────────────────────

  if (step === 'account') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-glow-blue">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-text-primary">Welcome to IntelWatch</h1>
            <p className="text-sm text-text-muted mt-1">Set up your admin account</p>
          </div>

          <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
            <form onSubmit={handleAccountNext} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Your name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Jane Analyst"
                  required
                  className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  readOnly
                  className="w-full h-10 px-3 bg-bg-secondary/50 border border-border rounded-lg text-sm text-text-muted cursor-not-allowed"
                />
                <p className="text-[10px] text-text-muted mt-1">Locked to your invite email</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Password <span className="text-text-muted">(min 12 characters)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={12}
                    className="w-full h-10 px-3 pr-10 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && password.length < 12 && (
                  <p className="text-[10px] text-sev-high mt-1">Password must be at least 12 characters</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Organization name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="Foxfiber"
                  required
                  className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                />
                {tenantSlug && (
                  <p className="text-[10px] text-text-muted mt-1">
                    Slug: <span className="font-mono text-text-secondary">{tenantSlug}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!accountValid}
                className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Choose Plan <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 2: Plan Selection (matches screenshot) ────────

  return (
    <div className="min-h-screen bg-bg-base px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mx-auto mb-3 shadow-glow-blue">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Choose your plan</h1>
          <p className="text-sm text-text-muted mt-1">Select the plan that fits <strong className="text-text-primary">{orgName}</strong></p>
        </div>

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
                {/* Most Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-accent text-white text-[10px] font-semibold rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <div className="p-5 flex-1 flex flex-col">
                  {/* Name + Price */}
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-text-primary">{plan.name}</h3>
                  </div>
                  <div className="mb-1">
                    <span className="text-2xl font-bold text-text-primary">{plan.priceLabel}</span>
                    {plan.price > 0 && <span className="text-xs text-text-muted ml-1">/mo</span>}
                  </div>
                  {plan.saveLabel && (
                    <p className="text-[10px] text-sev-low mb-3">{plan.saveLabel}</p>
                  )}
                  {!plan.saveLabel && <div className="mb-3" />}

                  {/* Stats Grid (Seats / IOC Limit / API Calls / Storage) */}
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
                    onClick={() => handleSelectPlan(plan.id)}
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
    </div>
  )
}
