/**
 * @module pages/MfaChallengePage
 * @description MFA challenge page — TOTP or backup code entry during login.
 * Public route: /auth/mfa-challenge
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Loader2, AlertTriangle, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useMfaChallenge } from '@/hooks/use-mfa'

export function MfaChallengePage() {
  const mfaToken = useAuthStore((s) => s.mfaToken)
  const setMfaToken = useAuthStore((s) => s.setMfaToken)
  const navigate = useNavigate()
  const challenge = useMfaChallenge()

  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // If no mfaToken, redirect to login
  useEffect(() => {
    if (!mfaToken) navigate('/login', { replace: true })
  }, [mfaToken, navigate])

  useEffect(() => {
    inputRef.current?.focus()
  }, [useBackup])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaToken || !code) return

    challenge.mutate({ mfaToken, code }, {
      onError: (err) => {
        const next = attempts + 1
        setAttempts(next)
        setCode('')
        // 5 failures → back to login
        if (next >= 5 || err.code === 'MFA_TOKEN_EXPIRED') {
          setMfaToken(null)
          navigate('/login', { replace: true })
        }
      },
    })
  }

  const handleBackToLogin = () => {
    setMfaToken(null)
    navigate('/login')
  }

  const maxLength = useBackup ? 9 : 6 // XXXX-XXXX = 9 chars

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-glow-blue">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Two-Factor Authentication</h1>
          <p className="text-sm text-text-muted mt-1">
            {useBackup ? 'Enter a backup code' : 'Enter the code from your authenticator app'}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                {useBackup ? 'Backup code' : '6-digit code'}
              </label>
              <input
                ref={inputRef}
                type="text"
                inputMode={useBackup ? 'text' : 'numeric'}
                maxLength={maxLength}
                value={code}
                onChange={(e) => {
                  const val = useBackup
                    ? e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 9)
                    : e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(val)
                }}
                placeholder={useBackup ? 'xxxx-xxxx' : '000000'}
                autoComplete="one-time-code"
                className={`w-full h-12 text-center font-mono bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors ${
                  useBackup ? 'text-lg tracking-wider' : 'text-2xl tracking-[0.5em]'
                }`}
                data-testid="mfa-code-input"
              />
            </div>

            {/* Error */}
            {challenge.error && attempts < 5 && (
              <div className="flex items-center gap-2 p-3 bg-sev-critical/10 border border-sev-critical/20 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-sev-critical shrink-0" />
                <span className="text-xs text-sev-critical">
                  {challenge.error.code === 'MFA_TOKEN_EXPIRED'
                    ? 'Session expired. Please log in again.'
                    : `Invalid code. ${5 - attempts} attempts remaining.`}
                </span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={challenge.isPending || !code || (useBackup ? code.length < 9 : code.length < 6)}
              className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              data-testid="mfa-submit"
            >
              {challenge.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </button>
          </form>

          {/* Toggle backup code */}
          <div className="mt-4 text-center">
            <button
              onClick={() => { setUseBackup(!useBackup); setCode('') }}
              className="inline-flex items-center gap-1.5 text-xs text-text-link hover:underline"
              data-testid="toggle-backup"
            >
              <KeyRound className="w-3 h-3" />
              {useBackup ? 'Use authenticator code instead' : 'Use a backup code instead'}
            </button>
          </div>
        </div>

        {/* Back to login */}
        <p className="text-center text-sm text-text-muted mt-4">
          <button onClick={handleBackToLogin} className="text-text-link hover:underline">
            Back to login
          </button>
        </p>
      </div>
    </div>
  )
}
