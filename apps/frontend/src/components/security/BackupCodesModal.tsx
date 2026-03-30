/**
 * @module components/security/BackupCodesModal
 * @description Modal to regenerate and display new MFA backup codes.
 */
import { useState } from 'react'
import { X, AlertTriangle, Loader2, KeyRound, Copy, Download, Check } from 'lucide-react'
import { useRegenerateBackupCodes } from '@/hooks/use-mfa'
import { toast } from '@/components/ui/Toast'
import { BackupCodesGrid } from './MfaSetupWizard'

interface BackupCodesModalProps {
  onClose: () => void
}

export function BackupCodesModal({ onClose }: BackupCodesModalProps) {
  const [code, setCode] = useState('')
  const [newCodes, setNewCodes] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)
  const regenerate = useRegenerateBackupCodes()

  const handleRegenerate = () => {
    if (code.length !== 6) return
    regenerate.mutate({ code }, {
      onSuccess: (data) => {
        setNewCodes(data.codes)
        toast('New backup codes generated', 'success')
      },
    })
  }

  const handleCopyAll = async () => {
    if (!newCodes) return
    await navigator.clipboard.writeText(newCodes.join('\n'))
    setCopied(true)
    toast('Backup codes copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!newCodes) return
    const text = [
      'ETIP — MFA Backup Codes',
      `Generated: ${new Date().toISOString()}`,
      '',
      'Each code can only be used once.',
      '',
      ...newCodes,
    ].join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'etip-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" data-testid="backup-codes-modal">
      <div className="bg-bg-primary border border-border rounded-xl p-5 max-w-sm w-full shadow-card max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-bold text-text-primary">Regenerate Backup Codes</h3>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!newCodes ? (
          <div className="space-y-3">
            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-400">
                This will invalidate all existing backup codes and generate new ones.
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
                data-testid="regen-totp-input"
                autoComplete="one-time-code"
              />
            </div>

            {regenerate.error && (
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
                onClick={handleRegenerate}
                disabled={code.length !== 6 || regenerate.isPending}
                className="flex-1 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                data-testid="confirm-regen-btn"
              >
                {regenerate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-400">
                Save these backup codes in a secure place. They will NOT be shown again.
              </p>
            </div>

            <BackupCodesGrid codes={newCodes} />

            <div className="flex gap-2">
              <button
                onClick={handleCopyAll}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
                data-testid="copy-new-codes-btn"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-sev-low" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy All'}
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
                data-testid="download-new-codes-btn"
              >
                <Download className="w-3.5 h-3.5" /> Download .txt
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors"
              data-testid="close-regen-btn"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
