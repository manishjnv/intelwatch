/**
 * @module components/command-center/TenantOverridePanel
 * @description Super-admin tenant feature overrides — table + add/edit modal.
 * Shown inside the Clients tab tenant detail drawer.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, X, Clock } from 'lucide-react'
import { useTenantOverrides, type TenantFeatureOverride, type OverrideCreate } from '@/hooks/use-tenant-overrides'
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from '@/hooks/use-feature-limits'

// ─── Helpers ────────────────────────────────────────────────

function fmtLimit(val: number | null): string {
  if (val == null) return '—'
  if (val < 0) return '∞'
  return val.toLocaleString('en-IN')
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// ─── Override Modal ─────────────────────────────────────────

function OverrideModal({ override, onSave, onClose, isSaving }: {
  override: TenantFeatureOverride | null
  onSave: (data: OverrideCreate) => void
  onClose: () => void
  isSaving: boolean
}) {
  const isNew = !override
  const [featureKey, setFeatureKey] = useState<FeatureKey>(override?.featureKey ?? FEATURE_KEYS[0])
  const [limitDaily, setLimitDaily] = useState(override?.limitDaily != null ? String(override.limitDaily) : '')
  const [limitWeekly, setLimitWeekly] = useState(override?.limitWeekly != null ? String(override.limitWeekly) : '')
  const [limitMonthly, setLimitMonthly] = useState(override?.limitMonthly != null ? String(override.limitMonthly) : '')
  const [limitTotal, setLimitTotal] = useState(override?.limitTotal != null ? String(override.limitTotal) : '')
  const [reason, setReason] = useState(override?.reason ?? '')
  const [expiresAt, setExpiresAt] = useState(override?.expiresAt?.split('T')[0] ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      featureKey,
      limitDaily: limitDaily ? Number(limitDaily) : null,
      limitWeekly: limitWeekly ? Number(limitWeekly) : null,
      limitMonthly: limitMonthly ? Number(limitMonthly) : null,
      limitTotal: limitTotal ? Number(limitTotal) : null,
      reason: reason || undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" data-testid="override-modal">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-primary rounded-xl border border-border shadow-2xl p-5 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-text-primary">{isNew ? 'Add Override' : 'Edit Override'}</h4>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">Feature</label>
            <select
              value={featureKey} onChange={e => setFeatureKey(e.target.value as FeatureKey)}
              disabled={!isNew}
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary disabled:opacity-50"
              data-testid="override-feature-select"
            >
              {FEATURE_KEYS.map(k => (
                <option key={k} value={k}>{FEATURE_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Daily Limit', val: limitDaily, set: setLimitDaily, testId: 'override-daily' },
              { label: 'Weekly Limit', val: limitWeekly, set: setLimitWeekly, testId: 'override-weekly' },
              { label: 'Monthly Limit', val: limitMonthly, set: setLimitMonthly, testId: 'override-monthly' },
              { label: 'Total Limit', val: limitTotal, set: setLimitTotal, testId: 'override-total' },
            ].map(field => (
              <div key={field.testId}>
                <label className="text-xs text-text-muted block mb-1">{field.label}</label>
                <input
                  type="number" placeholder="Plan default"
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
                  value={field.val} onChange={e => field.set(e.target.value)}
                  data-testid={field.testId}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">Reason</label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary focus:border-accent focus:outline-none"
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g., Sales deal, beta access"
              data-testid="override-reason"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">Expires At (optional)</label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary focus:border-accent focus:outline-none"
              value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              data-testid="override-expires"
            />
          </div>

          <p className="text-[10px] text-text-muted">Leave limit fields blank to use the plan default. Enter -1 for unlimited.</p>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-text-muted rounded border border-border">Cancel</button>
            <button
              type="submit" disabled={isSaving}
              className="px-4 py-1.5 text-sm font-medium rounded bg-accent text-bg-primary hover:bg-accent/90 disabled:opacity-50"
              data-testid="save-override-btn"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Export ────────────────────────────────────────────

interface TenantOverridePanelProps {
  tenantId: string
  planDefaults?: Record<FeatureKey, { daily: number; monthly: number }>
}

export function TenantOverridePanel({ tenantId, planDefaults: _planDefaults }: TenantOverridePanelProps) {
  const { overrides, isLoading, isDemo, createOverride, updateOverride, deleteOverride, isCreating, isUpdating, isDeleting } = useTenantOverrides(tenantId)
  const [editingOverride, setEditingOverride] = useState<TenantFeatureOverride | null | 'new'>(null)

  async function handleSave(data: OverrideCreate) {
    if (editingOverride === 'new') {
      await createOverride(data)
    } else if (editingOverride) {
      const { featureKey, ...body } = data
      await updateOverride({ featureKey, body })
    }
    setEditingOverride(null)
  }

  if (isLoading) {
    return <div className="h-20 rounded-lg bg-bg-elevated animate-pulse" />
  }

  return (
    <div className="space-y-3" data-testid="tenant-override-panel">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary">
          Feature Overrides {isDemo && <span className="text-[10px] text-sev-medium">(demo)</span>}
        </h4>
        <button
          onClick={() => setEditingOverride('new')}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-accent text-bg-primary hover:bg-accent/90"
          data-testid="add-override-btn"
        >
          <Plus className="w-3 h-3" /> Add Override
        </button>
      </div>

      {overrides.length === 0 ? (
        <p className="text-xs text-text-muted py-4 text-center">No overrides — tenant uses plan defaults for all features.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="overrides-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="pb-1.5 pr-2">Feature</th>
                <th className="pb-1.5 pr-2">Daily</th>
                <th className="pb-1.5 pr-2">Monthly</th>
                <th className="pb-1.5 pr-2">Reason</th>
                <th className="pb-1.5 pr-2">Expires</th>
                <th className="pb-1.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {overrides.map(ov => {
                const expired = isExpired(ov.expiresAt)
                return (
                  <tr key={ov.id} className={cn('border-b border-border/50 hover:bg-bg-hover', expired && 'opacity-50')}>
                    <td className="py-1.5 pr-2 text-text-primary font-medium">{FEATURE_LABELS[ov.featureKey]}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtLimit(ov.limitDaily)}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtLimit(ov.limitMonthly)}</td>
                    <td className="py-1.5 pr-2 text-text-muted max-w-[120px] truncate">{ov.reason ?? '—'}</td>
                    <td className="py-1.5 pr-2">
                      {ov.expiresAt ? (
                        <span className={cn('flex items-center gap-1', expired ? 'text-sev-critical' : 'text-text-muted')}>
                          <Clock className="w-3 h-3" />
                          {fmtDate(ov.expiresAt)}
                          {expired && <span className="text-[9px] px-1 rounded bg-sev-critical/10 text-sev-critical">Expired</span>}
                        </span>
                      ) : (
                        <span className="text-text-muted">Permanent</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <div className="flex gap-1">
                        <button onClick={() => setEditingOverride(ov)} className="p-0.5 rounded hover:bg-bg-active text-text-muted hover:text-accent">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteOverride(ov.featureKey)}
                          disabled={isDeleting}
                          className="p-0.5 rounded hover:bg-bg-active text-text-muted hover:text-sev-critical"
                          data-testid={`delete-override-${ov.featureKey}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingOverride !== null && (
        <OverrideModal
          override={editingOverride === 'new' ? null : editingOverride}
          onSave={handleSave}
          onClose={() => setEditingOverride(null)}
          isSaving={isCreating || isUpdating}
        />
      )}
    </div>
  )
}
