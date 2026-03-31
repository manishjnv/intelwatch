/**
 * @module pages/RegisterPage
 * @description Self-service registration: Step 1 = account details, Step 2 = plan selection.
 * After selecting a plan, creates account with 7-day trial (paid) or active (free).
 */
import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, ArrowRight, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { PlanCards } from '@/components/PlanCards'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  // Step state
  const [step, setStep] = useState<'account' | 'plans' | 'done'>('account')

  // Account fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Plan selection state
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const tenantSlug = useMemo(
    () => tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63),
    [tenantName],
  )

  const isValid = email && password.length >= 12 && displayName && tenantName && tenantSlug

  function handleAccountNext(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
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
          email, password, displayName,
          tenantName, tenantSlug,
          plan: planId,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error?.message ?? errBody?.message ?? 'Registration failed')
      }

      const json = await res.json()
      const data = json.data

      // If API returns tokens (auto-login), set auth and go to dashboard
      if (data?.accessToken) {
        setAuth(data)
        navigate('/dashboard')
        return
      }

      // Otherwise show success (email verification required)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed — please try again')
      setIsSubmitting(false)
      setSelectedPlan(null)
    }
  }

  // ─── Done State ─────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-sev-low/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-sev-low" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary mb-2">Check your email</h1>
          <p className="text-sm text-text-muted mb-6">
            We sent a verification link to <strong className="text-text-primary">{email}</strong>.
            Verify your email to activate your account.
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  // ─── Step 2: Plan Selection ─────────────────────────────

  if (step === 'plans') {
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
          orgName={tenantName}
          error={error}
        />
      </div>
    )
  }

  // ─── Step 1: Account Form ──────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-glow-blue">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Create your account</h1>
          <p className="text-sm text-text-muted mt-1">Start monitoring threats in minutes</p>
        </div>

        {/* Form card */}
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          <form onSubmit={handleAccountNext} className="space-y-4">
            {/* Display name */}
            <div>
              <label htmlFor="displayName" className="block text-xs font-medium text-text-secondary mb-1.5">
                Your name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Analyst"
                required
                autoComplete="name"
                className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-text-secondary mb-1.5">
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@company.com"
                required
                autoComplete="email"
                className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-text-secondary mb-1.5">
                Password <span className="text-text-muted">(min 12 characters)</span>
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  minLength={12}
                  autoComplete="new-password"
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

            {/* Organization name */}
            <div>
              <label htmlFor="tenantName" className="block text-xs font-medium text-text-secondary mb-1.5">
                Organization name
              </label>
              <input
                id="tenantName"
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="ACME Security"
                required
                className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              />
              {tenantSlug && (
                <p className="text-[10px] text-text-muted mt-1">
                  Slug: <span className="font-mono text-text-secondary">{tenantSlug}</span>
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!isValid}
              className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Choose Plan <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-text-muted mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-text-link hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
