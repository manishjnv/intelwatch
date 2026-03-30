/**
 * @module pages/MfaSetupRequiredPage
 * @description Forced MFA setup page — shown when org requires MFA but user hasn't set it up.
 * Public route: /auth/mfa-setup-required
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { MfaSetupWizard } from '@/components/security/MfaSetupWizard'

export function MfaSetupRequiredPage() {
  const mfaToken = useAuthStore((s) => s.mfaToken)
  const navigate = useNavigate()

  // If no mfaToken, redirect to login
  useEffect(() => {
    if (!mfaToken) navigate('/login', { replace: true })
  }, [mfaToken, navigate])

  const handleSetupComplete = () => {
    // After setup wizard completes, the user is now MFA-verified
    // The MFA challenge was already done in verify-setup step
    // Redirect to login to complete the auth flow with MFA challenge
    navigate('/auth/mfa-challenge')
  }

  if (!mfaToken) return null

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">MFA Required</h1>
          <p className="text-sm text-text-muted mt-1 text-center">
            Your organization requires two-factor authentication.
            Set up MFA to continue.
          </p>
        </div>

        {/* Warning */}
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">
            You cannot access the platform until MFA is configured.
          </p>
        </div>

        {/* Inline Setup Wizard */}
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          <MfaSetupWizard
            inline
            onClose={handleSetupComplete}
            onComplete={handleSetupComplete}
          />
        </div>
      </div>
    </div>
  )
}
