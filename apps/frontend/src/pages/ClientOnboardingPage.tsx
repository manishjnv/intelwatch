/**
 * @module pages/ClientOnboardingPage
 * @description Public invite landing page for new clients.
 * Step 1: Update org details + set password (account setup).
 * Step 2: View plans and select one (shared PlanCards component).
 * URL: /onboard/invite?token=xxx&email=xxx
 */
import { useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Shield, Eye, EyeOff, Check, ArrowRight } from 'lucide-react'
import { PlanCards, PLANS } from '@/components/PlanCards'
import { TurnstileWidget } from '@/components/TurnstileWidget'

export function ClientOnboardingPage() {
  const [params] = useSearchParams()
  const inviteToken = params.get('token') ?? ''
  const inviteEmail = params.get('email') ?? ''

  const [step, setStep] = useState<'account' | 'plans' | 'done'>('account')
  const [displayName, setDisplayName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')

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

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-sev-low/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-sev-low" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary mb-2">You're all set!</h1>
          <p className="text-sm text-text-muted mb-6">
            Your account has been created and the <strong className="text-text-primary">{PLANS.find(p => p.id === selectedPlan)?.name ?? selectedPlan}</strong> plan is active.
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

  function handleAccountNext(e: React.FormEvent) {
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
    setError('')
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail, password, displayName,
          tenantName: orgName, tenantSlug, inviteToken,
          plan: planId,
          cfTurnstileToken: turnstileToken || undefined,
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error?.message ?? errBody?.message ?? 'Registration failed')
      }
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed — please try again')
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
                  type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="Jane Analyst" required
                  className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
                <input
                  type="email" value={inviteEmail} readOnly
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
                    type={showPassword ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"
                    required minLength={12}
                    className="w-full h-10 px-3 pr-10 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary" tabIndex={-1}>
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
                  type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                  placeholder="Foxfiber" required
                  className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                />
                {tenantSlug && (
                  <p className="text-[10px] text-text-muted mt-1">
                    Slug: <span className="font-mono text-text-secondary">{tenantSlug}</span>
                  </p>
                )}
              </div>

              <TurnstileWidget onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} />

              <button type="submit" disabled={!accountValid}
                className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                Choose Plan <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 2: Plan Selection ─────────────────────────────

  return (
    <div className="min-h-screen bg-bg-base px-4 py-8">
      <div className="max-w-6xl mx-auto mb-4">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-glow-blue">
            <Shield className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>
      <PlanCards
        onSelectPlan={handleSelectPlan}
        selectedPlan={selectedPlan}
        isSubmitting={isSubmitting}
        orgName={orgName}
        error={error}
      />
    </div>
  )
}
