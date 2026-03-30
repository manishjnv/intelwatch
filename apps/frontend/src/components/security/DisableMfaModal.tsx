/**
 * @module components/security/DisableMfaModal
 * @description Modal requiring TOTP code to disable MFA.
 */
import { useState } from 'react'
import { X, AlertTriangle, Loader2, ShieldOff } from 'lucide-react'
import { useMfaDisable } from '@/hooks/use-mfa'
import { toast } from '@/components/ui/Toast'
import { useAuthStore } from '@/stores/auth-store'

interface DisableMfaModalProps {
  onClose: () => void
}

export function DisableMfaModal({ onClose }: DisableMfaModalProps) {
  const [code, setCode] = useState('')
  const disable = useMfaDisable()
  const setUser = useAuthStore((s) => s.setUser)
  const user = useAuthStore((s) => s.user)

  const handleDisable = () => {
    if (code.length !== 6) return
    disable.mutate({ code }, {
      onSuccess: () => {
        if (user) setUser({ ...user, mfaEnabled: false, mfaVerifiedAt: null })
        toast('Two-factor authentication disabled', 'success')
        onClose()
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" data-testid="disable-mfa-modal">
      <div className="bg-bg-primary border border-border rounded-xl p-5 max-w-sm w-full shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldOff className="w-4 h-4 text-sev-high" />
            <h3 className="text-sm font-bold text-text-primary">Disable MFA</h3>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="px-3 py-2 bg-sev-high/10 border border-sev-high/20 rounded-lg">
            <p className="text-xs text-sev-high">
              Are you sure you want to disable MFA? This reduces your account security.
            </p>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">
              Enter your current 6-digit code to confirm
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full h-10 text-center text-lg font-mono tracking-[0.3em] bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors"
              data-testid="disable-totp-input"
              autoComplete="one-time-code"
            />
          </div>

          {disable.error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-sev-critical/10 border border-sev-critical/20 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-sev-critical shrink-0" />
              <span className="text-xs text-sev-critical">Invalid code</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDisable}
              disabled={code.length !== 6 || disable.isPending}
              className="flex-1 py-2 text-xs font-medium bg-sev-high text-white rounded-lg hover:bg-sev-high/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              data-testid="confirm-disable-btn"
            >
              {disable.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Disable MFA
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
