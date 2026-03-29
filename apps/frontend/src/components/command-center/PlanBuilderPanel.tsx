/**
 * @module components/command-center/PlanBuilderPanel
 * @description Super-admin plan builder — card grid of plans + editor modal.
 * Sub-tab inside Billing & Plans. CRUD via usePlanBuilder hook.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, Users, Globe, Star,
  X, AlertTriangle,
} from 'lucide-react'
import { usePlanBuilder, type PlanDefinition, type PlanDefinitionCreate } from '@/hooks/use-plan-builder'
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from '@/hooks/use-feature-limits'
import type { PlanFeatureLimit } from '@/hooks/use-plan-builder'

// ─── Helpers ────────────────────────────────────────────────

function fmtINR(amount: number): string {
  if (amount === 0) return 'Free'
  if (amount < 0) return 'Contact Sales'
  return `₹${amount.toLocaleString('en-IN')}`
}

const PLAN_COLORS: Record<string, string> = {
  free: 'border-text-muted/30',
  starter: 'border-sev-low/40',
  teams: 'border-accent/40',
  enterprise: 'border-purple-400/40',
}

// ─── Plan Card ──────────────────────────────────────────────

function PlanCard({ plan, onEdit, onDelete }: {
  plan: PlanDefinition
  onEdit: () => void
  onDelete: () => void
}) {
  const enabledCount = plan.features.filter(f => f.enabled).length
  const tenantCount = plan._count?.tenants ?? 0

  return (
    <div
      className={cn(
        'p-4 rounded-lg border-2 bg-bg-elevated hover:bg-bg-hover transition-all cursor-pointer group',
        PLAN_COLORS[plan.planId] ?? 'border-border',
      )}
      onClick={onEdit}
      data-testid={`plan-card-${plan.planId}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-text-primary">{plan.name}</h4>
            {plan.isDefault && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sev-medium/10 text-sev-medium font-medium">Default</span>
            )}
            {plan.isPublic && (
              <Globe className="w-3 h-3 text-text-muted" title="Public" />
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{plan.description ?? '—'}</p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="p-1 rounded hover:bg-bg-active text-text-muted hover:text-accent"
            data-testid={`edit-plan-${plan.planId}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-bg-active text-text-muted hover:text-sev-critical"
            data-testid={`delete-plan-${plan.planId}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-2xl font-bold text-text-primary">{fmtINR(plan.priceMonthlyInr)}</span>
        {plan.priceMonthlyInr > 0 && <span className="text-xs text-text-muted">/mo</span>}
        {plan.priceAnnualInr > 0 && (
          <span className="text-[10px] text-text-muted ml-1">({fmtINR(plan.priceAnnualInr)}/yr)</span>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {tenantCount} tenant{tenantCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <Star className="w-3 h-3" />
          {enabledCount}/16 features
        </span>
      </div>
    </div>
  )
}

// ─── Feature Limit Grid (inside editor) ────────────────────

function FeatureLimitGrid({ features, onChange }: {
  features: PlanFeatureLimit[]
  onChange: (features: PlanFeatureLimit[]) => void
}) {
  function updateFeature(key: FeatureKey, field: keyof PlanFeatureLimit, value: boolean | number) {
    onChange(features.map(f =>
      f.featureKey === key ? { ...f, [field]: value } : f
    ))
  }

  return (
    <div className="overflow-x-auto" data-testid="feature-limit-grid">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-muted text-xs">
            <th className="pb-2 pr-3 w-[180px]">Feature</th>
            <th className="pb-2 pr-3 w-16 text-center">On</th>
            <th className="pb-2 pr-3 w-20">Daily</th>
            <th className="pb-2 pr-3 w-20">Weekly</th>
            <th className="pb-2 pr-3 w-20">Monthly</th>
            <th className="pb-2 w-20">Total</th>
          </tr>
        </thead>
        <tbody>
          {features.map(f => (
            <tr key={f.featureKey} className="border-b border-border/50 hover:bg-bg-hover">
              <td className="py-2 pr-3 text-xs text-text-primary">{FEATURE_LABELS[f.featureKey]}</td>
              <td className="py-2 pr-3 text-center">
                <button
                  type="button"
                  onClick={() => updateFeature(f.featureKey, 'enabled', !f.enabled)}
                  className={cn(
                    'w-8 h-4 rounded-full relative transition-colors',
                    f.enabled ? 'bg-sev-low' : 'bg-bg-active',
                  )}
                  data-testid={`toggle-${f.featureKey}`}
                >
                  <span className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
                    f.enabled ? 'left-4' : 'left-0.5',
                  )} />
                </button>
              </td>
              {(['limitDaily', 'limitWeekly', 'limitMonthly', 'limitTotal'] as const).map(field => (
                <td key={field} className="py-2 pr-3">
                  <input
                    type="number"
                    value={f[field]}
                    onChange={e => updateFeature(f.featureKey, field, Number(e.target.value))}
                    disabled={!f.enabled}
                    className={cn(
                      'w-full px-2 py-1 text-xs rounded bg-bg-primary border border-border text-text-primary',
                      'focus:border-accent focus:outline-none disabled:opacity-40',
                    )}
                    data-testid={`input-${f.featureKey}-${field}`}
                    title={f[field] === -1 ? 'Unlimited (-1)' : undefined}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-text-muted mt-2">Enter -1 for unlimited. Disabled features ignore limits.</p>
    </div>
  )
}

// ─── Plan Editor Modal ──────────────────────────────────────

function PlanEditorModal({ plan, onSave, onClose, isSaving }: {
  plan: PlanDefinition | null
  onSave: (data: PlanDefinitionCreate) => void
  onClose: () => void
  isSaving: boolean
}) {
  const isNew = !plan
  const defaultFeatures: PlanFeatureLimit[] = FEATURE_KEYS.map(key => ({
    featureKey: key, enabled: false, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: -1,
  }))

  const [name, setName] = useState(plan?.name ?? '')
  const [planId, setPlanId] = useState(plan?.planId ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [priceMonthlyInr, setPriceMonthlyInr] = useState(plan?.priceMonthlyInr ?? 0)
  const [priceAnnualInr, setPriceAnnualInr] = useState(plan?.priceAnnualInr ?? 0)
  const [isPublic, setIsPublic] = useState(plan?.isPublic ?? true)
  const [isDefault, setIsDefault] = useState(plan?.isDefault ?? false)
  const [sortOrder, setSortOrder] = useState(plan?.sortOrder ?? 0)
  const [features, setFeatures] = useState<PlanFeatureLimit[]>(plan?.features ?? defaultFeatures)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ planId, name, description: description || undefined, priceMonthlyInr, priceAnnualInr, isPublic, isDefault, sortOrder, features })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto" data-testid="plan-editor-modal">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-bg-primary rounded-xl border border-border shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-text-primary">
            {isNew ? 'Create Plan' : `Edit: ${plan.name}`}
          </h3>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Plan Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Plan Name *</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary focus:border-accent focus:outline-none"
                value={name} onChange={e => setName(e.target.value)} required
                data-testid="plan-name-input"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Plan ID *{!isNew && ' (readonly)'}</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary font-mono focus:border-accent focus:outline-none disabled:opacity-50"
                value={planId} onChange={e => setPlanId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                disabled={!isNew} required
                data-testid="plan-id-input"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-text-muted block mb-1">Description</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary focus:border-accent focus:outline-none"
                value={description} onChange={e => setDescription(e.target.value)}
                data-testid="plan-desc-input"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Price Monthly (INR)</label>
              <input type="number" min={0}
                className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary focus:border-accent focus:outline-none"
                value={priceMonthlyInr} onChange={e => setPriceMonthlyInr(Number(e.target.value))}
                data-testid="price-monthly-input"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Price Annual (INR)</label>
              <input type="number" min={0}
                className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary focus:border-accent focus:outline-none"
                value={priceAnnualInr} onChange={e => setPriceAnnualInr(Number(e.target.value))}
                data-testid="price-annual-input"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Sort Order</label>
              <input type="number"
                className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary focus:border-accent focus:outline-none"
                value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
                data-testid="sort-order-input"
              />
            </div>
            <div className="flex items-center gap-4 pt-5">
              <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)}
                  className="rounded border-border accent-accent" data-testid="is-public-toggle" />
                Public
              </label>
              <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
                <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
                  className="rounded border-border accent-accent" data-testid="is-default-toggle" />
                Default
              </label>
            </div>
          </div>

          {/* Feature Limit Grid */}
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-2">Feature Limits</h4>
            <FeatureLimitGrid features={features} onChange={setFeatures} />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary rounded-lg border border-border hover:border-border-strong transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as () => void}
            disabled={!name || !planId || isSaving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-bg-primary hover:bg-accent/90 transition-colors disabled:opacity-50"
            data-testid="save-plan-btn"
          >
            {isSaving ? 'Saving...' : isNew ? 'Create Plan' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ───────────────────────────────────

function DeleteConfirmModal({ planName, onConfirm, onCancel, isDeleting, error }: {
  planName: string
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
  error: Error | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="delete-confirm-modal">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-bg-primary rounded-xl border border-border shadow-2xl p-6 max-w-sm mx-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-sev-critical" />
          <h4 className="font-semibold text-text-primary">Delete Plan</h4>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Are you sure you want to delete <strong>{planName}</strong>? This cannot be undone.
        </p>
        {error && (
          <p className="text-xs text-sev-critical mb-3 p-2 rounded bg-sev-critical/10 border border-sev-critical/20" data-testid="delete-error">
            {error.message?.includes('tenant') ? 'Cannot delete: tenants are assigned to this plan.' : error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary rounded border border-border">
            Cancel
          </button>
          <button
            onClick={onConfirm} disabled={isDeleting}
            className="px-3 py-1.5 text-sm font-medium rounded bg-sev-critical text-white hover:bg-sev-critical/90 disabled:opacity-50"
            data-testid="confirm-delete-btn"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Export ────────────────────────────────────────────

export function PlanBuilderPanel() {
  const { plans, isLoading, isDemo, createPlan, updatePlan, deletePlan, isCreating, isUpdating, isDeleting, deleteError } = usePlanBuilder()
  const [editorPlan, setEditorPlan] = useState<PlanDefinition | null | 'new'>(null)
  const [deletingPlan, setDeletingPlan] = useState<PlanDefinition | null>(null)

  async function handleSave(data: PlanDefinitionCreate) {
    if (editorPlan === 'new') {
      await createPlan(data)
    } else if (editorPlan) {
      await updatePlan({ planId: editorPlan.planId, body: data })
    }
    setEditorPlan(null)
  }

  async function handleDelete() {
    if (!deletingPlan) return
    try {
      await deletePlan(deletingPlan.planId)
      setDeletingPlan(null)
    } catch {
      // error shown in modal via deleteError
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="plan-builder-skeleton">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-40 rounded-lg bg-bg-elevated border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="plan-builder-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Plan Builder {isDemo && <span className="text-[10px] text-sev-medium ml-1">(demo)</span>}
        </h3>
        <button
          onClick={() => setEditorPlan('new')}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-bg-primary hover:bg-accent/90 transition-colors"
          data-testid="create-plan-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Plan
        </button>
      </div>

      {/* Plan card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="plan-card-grid">
        {plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onEdit={() => setEditorPlan(plan)}
            onDelete={() => setDeletingPlan(plan)}
          />
        ))}
      </div>

      {/* Editor Modal */}
      {editorPlan !== null && (
        <PlanEditorModal
          plan={editorPlan === 'new' ? null : editorPlan}
          onSave={handleSave}
          onClose={() => setEditorPlan(null)}
          isSaving={isCreating || isUpdating}
        />
      )}

      {/* Delete Confirm */}
      {deletingPlan && (
        <DeleteConfirmModal
          planName={deletingPlan.name}
          onConfirm={handleDelete}
          onCancel={() => setDeletingPlan(null)}
          isDeleting={isDeleting}
          error={deleteError}
        />
      )}
    </div>
  )
}
