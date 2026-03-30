/**
 * @module components/security/MfaStatusCard
 * @description MFA status display with enable/disable/regenerate actions.
 */
import { useState } from 'react'
import { ShieldCheck, ShieldOff, KeyRound, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { MfaSetupWizard } from './MfaSetupWizard'
import { DisableMfaModal } from './DisableMfaModal'
import { BackupCodesModal } from './BackupCodesModal'

export function MfaStatusCard({ enforcementWarning }: { enforcementWarning?: boolean }) {
  const user = useAuthStore((s) => s.user)
  const mfaEnabled = user?.mfaEnabled ?? false
  const mfaVerifiedAt = user?.mfaVerifiedAt

  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [showDisableModal, setShowDisableModal] = useState(false)
  const [showBackupModal, setShowBackupModal] = useState(false)

  return (
    <>
      <div className="border border-border rounded-xl p-5 bg-bg-primary" data-testid="mfa-status-card">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            mfaEnabled ? 'bg-sev-low/20' : 'bg-bg-hover'
          }`}>
            {mfaEnabled
              ? <ShieldCheck className="w-5 h-5 text-sev-low" />
              : <ShieldOff className="w-5 h-5 text-text-muted" />}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">Two-Factor Authentication</h3>

            {mfaEnabled ? (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 text-xs text-sev-low">
                  <ShieldCheck className="w-3 h-3" /> Active
                </span>
                {mfaVerifiedAt && (
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Enabled since {new Date(mfaVerifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-text-muted mt-1">
                Two-factor authentication is not enabled
              </p>
            )}

            {enforcementWarning && !mfaEnabled && (
              <div className="mt-2 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-[10px] text-amber-400">
                  Your organization requires MFA. Set it up to continue using the platform.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {mfaEnabled ? (
                <>
                  <button
                    onClick={() => setShowDisableModal(true)}
                    className="px-3 py-1.5 text-xs font-medium border border-sev-high/30 text-sev-high rounded-lg hover:bg-sev-high/10 transition-colors"
                    data-testid="disable-mfa-btn"
                  >
                    Disable MFA
                  </button>
                  <button
                    onClick={() => setShowBackupModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary hover:border-border-strong transition-colors"
                    data-testid="regenerate-codes-btn"
                  >
                    <KeyRound className="w-3 h-3" /> Regenerate Backup Codes
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowSetupWizard(true)}
                  className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors"
                  data-testid="enable-mfa-btn"
                >
                  Enable MFA
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSetupWizard && <MfaSetupWizard onClose={() => setShowSetupWizard(false)} />}
      {showDisableModal && <DisableMfaModal onClose={() => setShowDisableModal(false)} />}
      {showBackupModal && <BackupCodesModal onClose={() => setShowBackupModal(false)} />}
    </>
  )
}
