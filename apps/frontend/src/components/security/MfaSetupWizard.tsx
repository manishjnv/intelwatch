/**
 * @module components/security/MfaSetupWizard
 * @description 3-step MFA setup wizard: QR code → verify TOTP → backup codes.
 */
import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Copy, Download, Check, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useMfaSetup, useMfaVerifySetup } from '@/hooks/use-mfa'
import { toast } from '@/components/ui/Toast'
import type { MfaSetupResponse } from '@/types/auth-security'

type Step = 'qr' | 'verify' | 'backup'

interface MfaSetupWizardProps {
  onClose: () => void
  /** When true, renders inline instead of as a modal (used in forced setup page) */
  inline?: boolean
  /** Called after setup is fully complete (step 3 done) */
  onComplete?: () => void
}

export function MfaSetupWizard({ onClose, inline, onComplete }: MfaSetupWizardProps) {
  const [step, setStep] = useState<Step>('qr')
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null)
  const [code, setCode] = useState('')
  const [savedCodes, setSavedCodes] = useState(false)
  const [copied, setCopied] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  const setup = useMfaSetup()
  const verify = useMfaVerifySetup()

  // Auto-trigger setup on mount
  useEffect(() => {
    setup.mutate(undefined, {
      onSuccess: (data) => setSetupData(data),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleVerify = () => {
    if (code.length !== 6) return
    verify.mutate({ code }, {
      onSuccess: () => setStep('backup'),
    })
  }

  const handleCopyAll = async () => {
    if (!setupData?.backupCodes) return
    await navigator.clipboard.writeText(setupData.backupCodes.join('\n'))
    setCopied(true)
    toast('Backup codes copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!setupData?.backupCodes) return
    const text = [
      'ETIP — MFA Backup Codes',
      `Generated: ${new Date().toISOString()}`,
      '',
      'Each code can only be used once.',
      '',
      ...setupData.backupCodes,
    ].join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'etip-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDone = () => {
    onComplete?.()
    onClose()
  }

  // Format secret for display (groups of 4)
  const formattedSecret = setupData?.secret
    ? setupData.secret.replace(/(.{4})/g, '$1 ').trim()
    : ''

  const content = (
    <div className="space-y-4" data-testid="mfa-setup-wizard">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-2">
        {(['qr', 'verify', 'backup'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === s ? 'bg-accent text-white' :
              (['qr', 'verify', 'backup'].indexOf(step) > i) ? 'bg-sev-low/20 text-sev-low' :
              'bg-bg-hover text-text-muted'
            }`}>
              {(['qr', 'verify', 'backup'].indexOf(step) > i) ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            {i < 2 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: QR Code */}
      {step === 'qr' && (
        <div className="space-y-4" data-testid="step-qr">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Scan QR Code</h3>
            <p className="text-xs text-text-muted mt-1">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
          </div>

          {setup.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : setupData ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-white rounded-xl">
                <QRCodeSVG
                  value={setupData.qrCodeUri}
                  size={180}
                  level="M"
                  data-testid="qr-code"
                />
              </div>
              <div className="w-full">
                <p className="text-[10px] text-text-muted mb-1">Can't scan? Enter this code manually:</p>
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border border-border rounded-lg">
                  <code className="text-xs font-mono text-text-primary flex-1 select-all" data-testid="manual-code">
                    {formattedSecret}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(setupData.secret); toast('Secret copied', 'success') }}
                    className="text-text-muted hover:text-text-primary shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-sev-high">Failed to generate MFA secret. Please try again.</div>
          )}

          <button
            onClick={() => { setStep('verify'); setTimeout(() => codeInputRef.current?.focus(), 100) }}
            disabled={!setupData}
            className="w-full py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 transition-colors"
            data-testid="next-to-verify"
          >
            Next
          </button>
        </div>
      )}

      {/* Step 2: Verify Code */}
      {step === 'verify' && (
        <div className="space-y-4" data-testid="step-verify">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Verify Code</h3>
            <p className="text-xs text-text-muted mt-1">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <input
            ref={codeInputRef}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full h-12 text-center text-2xl font-mono tracking-[0.5em] bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors"
            data-testid="totp-input"
            autoComplete="one-time-code"
          />

          {verify.error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-sev-critical/10 border border-sev-critical/20 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-sev-critical shrink-0" />
              <span className="text-xs text-sev-critical">
                Invalid code. Make sure your authenticator app time is synced.
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep('qr')}
              className="flex-1 py-2 text-sm font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleVerify}
              disabled={code.length !== 6 || verify.isPending}
              className="flex-1 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              data-testid="verify-btn"
            >
              {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Backup Codes */}
      {step === 'backup' && (
        <div className="space-y-4" data-testid="step-backup">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sev-low" />
            <h3 className="text-sm font-semibold text-text-primary">MFA Enabled!</h3>
          </div>

          <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs text-amber-400">
              Save these backup codes in a secure place. They will NOT be shown again.
            </p>
          </div>

          <BackupCodesGrid codes={setupData?.backupCodes ?? []} />

          <div className="flex gap-2">
            <button
              onClick={handleCopyAll}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
              data-testid="copy-codes-btn"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-sev-low" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy All'}
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
              data-testid="download-codes-btn"
            >
              <Download className="w-3.5 h-3.5" /> Download .txt
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer" data-testid="saved-checkbox-label">
            <input
              type="checkbox"
              checked={savedCodes}
              onChange={(e) => setSavedCodes(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-accent"
              data-testid="saved-checkbox"
            />
            <span className="text-xs text-text-secondary">I have saved my backup codes</span>
          </label>

          <button
            onClick={handleDone}
            disabled={!savedCodes}
            className="w-full py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 transition-colors"
            data-testid="done-btn"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )

  if (inline) return content

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" data-testid="mfa-setup-modal">
      <div className="bg-bg-primary border border-border rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-text-primary">Set Up MFA</h2>
          {step !== 'backup' && (
            <button onClick={onClose} className="text-text-muted hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {content}
      </div>
    </div>
  )
}

// ─── Shared Backup Codes Grid ──────────────────────────────────

export function BackupCodesGrid({ codes }: { codes: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" data-testid="backup-codes-grid">
      {codes.map((code, i) => (
        <div key={i} className="px-3 py-1.5 bg-bg-elevated border border-border rounded text-center">
          <code className="text-xs font-mono text-text-primary">{code}</code>
        </div>
      ))}
    </div>
  )
}
