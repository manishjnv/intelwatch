/**
 * @module components/command-center/AddClientModal
 * @description Modal form for onboarding a new client/tenant.
 * Super-admin only — shown from the Clients tab.
 * No plan selection — client starts on free and picks plan via invite link.
 * After creation, shows invite link + confirms email sent.
 */
import { useState } from 'react'
import { X, UserPlus, Copy, Check, ExternalLink, Mail } from 'lucide-react'
import { z } from 'zod'
import { toast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

// ─── Validation ────────────────────────────────────────────

const addClientSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  ownerName: z.string().min(2, 'Contact name must be at least 2 characters'),
  ownerEmail: z.string().email('Please enter a valid email address'),
})

type AddClientInput = z.infer<typeof addClientSchema>

interface CreatedTenant {
  id: string
  name: string
  ownerEmail: string
  ownerName: string
  inviteToken: string
  plan: string
}

// ─── Hook ──────────────────────────────────────────────────

export function useCreateTenant() {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: AddClientInput) => {
      const res = await api<{ data: CreatedTenant }>('/admin/tenants', {
        method: 'POST',
        body: { ...input, plan: 'free' },
      })
      return res
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['command-center'] })
    },
  })

  return {
    createTenant: mutation.mutateAsync,
    isCreating: mutation.isPending,
  }
}

// ─── Helpers ──────────────────────────────────────────────

function buildInviteUrl(token: string, email: string): string {
  const base = window.location.origin
  return `${base}/onboard/invite?token=${token}&email=${encodeURIComponent(email)}`
}

// ─── Modal ─────────────────────────────────────────────────

interface AddClientModalProps {
  onClose: () => void
}

export function AddClientModal({ onClose }: AddClientModalProps) {
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof AddClientInput, string>>>({})
  const [created, setCreated] = useState<CreatedTenant | null>(null)
  const [copied, setCopied] = useState(false)

  const { createTenant, isCreating } = useCreateTenant()

  function validate(): AddClientInput | null {
    const result = addClientSchema.safeParse({ name, ownerName, ownerEmail })
    if (!result.success) {
      const fieldErrors: typeof errors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof AddClientInput
        if (!fieldErrors[field]) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return null
    }
    setErrors({})
    return result.data
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = validate()
    if (!data) return

    try {
      const res = await createTenant(data)
      setCreated(res.data)
      toast('Client onboarded — invite email sent', 'success')
    } catch {
      toast('Failed to create client — check API connection', 'error')
    }
  }

  async function handleCopyLink() {
    if (!created) return
    const url = buildInviteUrl(created.inviteToken, created.ownerEmail)
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast('Invite link copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── Success State ──────────────────────────────────────

  if (created) {
    const inviteUrl = buildInviteUrl(created.inviteToken, created.ownerEmail)

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" data-testid="add-client-modal">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-bg-primary rounded-xl border border-border shadow-2xl p-5 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-sev-low" />
              <h4 className="font-semibold text-text-primary">Client Created</h4>
            </div>
            <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary" data-testid="close-add-client">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-sev-low/5 border border-sev-low/20">
              <p className="text-sm text-text-primary font-medium">{created.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{created.ownerEmail}</p>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/20 text-xs text-accent">
              <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Invite email sent to <strong>{created.ownerEmail}</strong>. They can set up their account and choose a plan.</span>
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1">Invite Link (backup)</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 px-3 py-2 rounded-lg bg-bg-elevated border border-border text-xs text-text-primary font-mono truncate"
                  data-testid="invite-link"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-2 rounded-lg bg-accent text-bg-primary hover:bg-accent/90 flex items-center gap-1.5 text-xs font-medium shrink-0"
                  data-testid="copy-invite-link"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-bg-elevated text-[10px] text-text-muted">
              <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>The invite is tied to <strong className="text-text-primary">{created.ownerEmail}</strong> — only that email can claim it.</span>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm font-medium rounded bg-accent text-bg-primary hover:bg-accent/90"
              data-testid="done-add-client"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Form State ─────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" data-testid="add-client-modal">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-primary rounded-xl border border-border shadow-2xl p-5 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-accent" />
            <h4 className="font-semibold text-text-primary">Add Client</h4>
          </div>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary" data-testid="close-add-client">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {/* Organization Name */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Organization Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Foxfiber"
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              data-testid="input-org-name"
            />
            {errors.name && <p className="text-[10px] text-sev-critical mt-0.5" data-testid="error-org-name">{errors.name}</p>}
          </div>

          {/* Primary Contact Name */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Primary Contact Name *</label>
            <input
              type="text"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="e.g., John Doe"
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              data-testid="input-contact-name"
            />
            {errors.ownerName && <p className="text-[10px] text-sev-critical mt-0.5" data-testid="error-contact-name">{errors.ownerName}</p>}
          </div>

          {/* Primary Contact Email */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Primary Contact Email *</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              placeholder="e.g., support@foxfiber.in"
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              data-testid="input-contact-email"
            />
            {errors.ownerEmail && <p className="text-[10px] text-sev-critical mt-0.5" data-testid="error-contact-email">{errors.ownerEmail}</p>}
          </div>

          <p className="text-[10px] text-text-muted">
            An invite email will be sent. The client will choose their own plan during setup.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-text-muted rounded border border-border hover:text-text-primary"
              data-testid="cancel-add-client"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-1.5 text-sm font-medium rounded bg-accent text-bg-primary hover:bg-accent/90 disabled:opacity-50"
              data-testid="submit-add-client"
            >
              {isCreating ? 'Sending Invite...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
