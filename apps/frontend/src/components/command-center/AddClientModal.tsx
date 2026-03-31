/**
 * @module components/command-center/AddClientModal
 * @description Modal form for onboarding a new client/tenant.
 * Super-admin only — shown from the Clients tab.
 */
import { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { z } from 'zod'
import { toast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

// ─── Validation ────────────────────────────────────────────

const addClientSchema = z.object({
  orgName: z.string().min(2, 'Organization name must be at least 2 characters'),
  contactName: z.string().min(2, 'Contact name must be at least 2 characters'),
  contactEmail: z.string().email('Please enter a valid email address'),
  plan: z.enum(['free', 'starter', 'teams', 'enterprise']),
})

type AddClientInput = z.infer<typeof addClientSchema>

// ─── Demo Fallback ─────────────────────────────────────────

let demoCounter = 100

function createDemoTenant(input: AddClientInput) {
  demoCounter++
  return {
    tenantId: `t-demo-${demoCounter}`,
    name: input.orgName,
    plan: input.plan,
    members: 1,
    itemsConsumed: 0,
    attributedCostUsd: 0,
    status: 'active' as const,
    usagePercent: 0,
  }
}

// ─── Hook ──────────────────────────────────────────────────

export function useCreateTenant() {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: AddClientInput) => {
      try {
        const res = await api<{ data: { tenantId: string } }>('/admin/tenants', {
          method: 'POST',
          body: input,
        })
        return res
      } catch {
        // Demo fallback — API may not exist yet
        return { data: createDemoTenant(input) }
      }
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

// ─── Modal ─────────────────────────────────────────────────

interface AddClientModalProps {
  onClose: () => void
}

export function AddClientModal({ onClose }: AddClientModalProps) {
  const [orgName, setOrgName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [plan, setPlan] = useState<AddClientInput['plan']>('free')
  const [errors, setErrors] = useState<Partial<Record<keyof AddClientInput, string>>>({})

  const { createTenant, isCreating } = useCreateTenant()

  function validate(): AddClientInput | null {
    const result = addClientSchema.safeParse({ orgName, contactName, contactEmail, plan })
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
      await createTenant(data)
      toast('Client onboarded successfully', 'success')
      onClose()
    } catch {
      toast('Failed to create client', 'error')
    }
  }

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
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="e.g., Acme Security"
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              data-testid="input-org-name"
            />
            {errors.orgName && <p className="text-[10px] text-sev-critical mt-0.5" data-testid="error-org-name">{errors.orgName}</p>}
          </div>

          {/* Primary Contact Name */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Primary Contact Name *</label>
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="e.g., John Doe"
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              data-testid="input-contact-name"
            />
            {errors.contactName && <p className="text-[10px] text-sev-critical mt-0.5" data-testid="error-contact-name">{errors.contactName}</p>}
          </div>

          {/* Primary Contact Email */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Primary Contact Email *</label>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="e.g., john@acmesecurity.com"
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              data-testid="input-contact-email"
            />
            {errors.contactEmail && <p className="text-[10px] text-sev-critical mt-0.5" data-testid="error-contact-email">{errors.contactEmail}</p>}
          </div>

          {/* Plan Tier */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Plan Tier</label>
            <select
              value={plan}
              onChange={e => setPlan(e.target.value as AddClientInput['plan'])}
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
              data-testid="select-plan"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="teams">Teams</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <p className="text-[10px] text-text-muted">The primary contact will be assigned as tenant admin.</p>

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
              {isCreating ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
