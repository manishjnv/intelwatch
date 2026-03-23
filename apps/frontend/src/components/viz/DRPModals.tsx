/**
 * @module components/viz/DRPModals
 * @description Interactive modals for DRP Dashboard:
 * - CreateAssetModal: add new monitored domain/brand/executive
 * - AlertDetailPanel: slide-out with evidence, triage actions, feedback
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useCreateAsset, useChangeAlertStatus, useAssignAlert, useAlertFeedback,
  type DRPAlert,
} from '@/hooks/use-phase4-data'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import {
  X, Plus, Shield, Globe, User, Smartphone,
  CheckCircle, XCircle, Eye, AlertTriangle,
  ThumbsUp, ThumbsDown, UserPlus, ChevronRight,
} from 'lucide-react'

// ─── Asset Type Options ─────────────────────────────────────────

const ASSET_TYPES = [
  { value: 'domain', label: 'Domain', icon: Globe, placeholder: 'e.g., example.com' },
  { value: 'brand_name', label: 'Brand', icon: Shield, placeholder: 'e.g., MyCompany' },
  { value: 'email_domain', label: 'Email Domain', icon: User, placeholder: 'e.g., company.com' },
  { value: 'social_handle', label: 'Social Handle', icon: User, placeholder: 'e.g., @mycompany' },
  { value: 'mobile_app', label: 'Mobile App', icon: Smartphone, placeholder: 'e.g., com.mycompany.app' },
]

// ─── Create Asset Modal ─────────────────────────────────────────

export function CreateAssetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState('domain')
  const [value, setValue] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [criticality, setCriticality] = useState(0.5)
  const createMutation = useCreateAsset()

  if (!open) return null

  const selectedType = ASSET_TYPES.find(t => t.value === type)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim() || !displayName.trim()) return
    createMutation.mutate(
      { type, value: value.trim(), displayName: displayName.trim(), criticality },
      {
        onSuccess: () => {
          setValue('')
          setDisplayName('')
          setCriticality(0.5)
          onClose()
        },
      },
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-bg-primary border border-border rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">Add Monitored Asset</h2>
            </div>
            <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Asset Type */}
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">Asset Type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {ASSET_TYPES.slice(0, 3).map(t => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[11px] font-medium border transition-all',
                        type === t.value
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-bg-secondary text-text-muted hover:text-text-primary',
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Value */}
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">Value</label>
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={selectedType?.placeholder}
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Friendly name for this asset"
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Criticality */}
            <div>
              <label className="text-xs text-text-muted mb-1.5 flex items-center justify-between">
                <span>Criticality</span>
                <span className={cn('font-medium tabular-nums',
                  criticality >= 0.7 ? 'text-sev-critical' : criticality >= 0.4 ? 'text-sev-medium' : 'text-sev-low',
                )}>{(criticality * 100).toFixed(0)}%</span>
              </label>
              <input
                type="range"
                min="0" max="1" step="0.1"
                value={criticality}
                onChange={e => setCriticality(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-md">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!value.trim() || !displayName.trim() || createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Adding...' : 'Add Asset'}
              </button>
            </div>

            {createMutation.isError && (
              <p className="text-[10px] text-sev-critical">Failed to create asset. Check the DRP service is running.</p>
            )}
          </form>
        </div>
      </div>
    </>
  )
}

// ─── Alert Detail Panel ─────────────────────────────────────────

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating', 'resolved', 'false_positive'],
  investigating: ['resolved', 'false_positive'],
  resolved: ['open'],
  false_positive: ['open'],
}

const STATUS_ICONS: Record<string, React.FC<{ className?: string }>> = {
  open: AlertTriangle,
  investigating: Eye,
  resolved: CheckCircle,
  false_positive: XCircle,
}

export function AlertDetailPanel({ alert, onClose, isDemo }: {
  alert: DRPAlert; onClose: () => void; isDemo: boolean
}) {
  const [triageNotes, setTriageNotes] = useState('')
  const statusMutation = useChangeAlertStatus()
  const assignMutation = useAssignAlert()
  const feedbackMutation = useAlertFeedback()

  const nextStatuses = STATUS_TRANSITIONS[alert.status] ?? []
  const riskColor = alert.confidence >= 80 ? 'text-sev-critical' : alert.confidence >= 50 ? 'text-sev-medium' : 'text-sev-low'

  const handleStatusChange = (newStatus: string) => {
    statusMutation.mutate({ id: alert.id, status: newStatus, notes: triageNotes || undefined })
  }

  const handleAssignToMe = () => {
    assignMutation.mutate({ id: alert.id, userId: 'current-user' })
  }

  const handleFeedback = (verdict: 'true_positive' | 'false_positive') => {
    feedbackMutation.mutate({ id: alert.id, verdict })
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-bg-primary border-l border-border shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <SeverityBadge severity={alert.severity.toUpperCase() as any} />
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-text-primary">{alert.title}</h3>
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-muted">
          <span className="font-mono">{alert.detectedValue}</span>
          <span>|</span>
          <span className={cn('font-medium tabular-nums', riskColor)}>{alert.confidence}% confidence</span>
        </div>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Description */}
        <p className="text-xs text-text-secondary">{alert.description}</p>

        {/* Status + Actions */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-2">Status & Actions</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const Icon = STATUS_ICONS[alert.status] ?? AlertTriangle
              return (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-bg-secondary border border-border text-text-primary font-medium">
                  <Icon className="w-3 h-3" />
                  {alert.status.replace('_', ' ')}
                </span>
              )
            })()}
            <ChevronRight className="w-3 h-3 text-text-muted" />
            {nextStatuses.map(s => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={statusMutation.isPending || isDemo}
                className="text-[10px] px-2 py-1 rounded-md border border-border text-text-secondary hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-50"
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Assign */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-2">Assignment</h4>
          <div className="flex items-center gap-2">
            {alert.assignee
              ? <span className="text-xs text-accent font-medium">{alert.assignee}</span>
              : <span className="text-xs text-text-muted">Unassigned</span>
            }
            <button
              onClick={handleAssignToMe}
              disabled={assignMutation.isPending || isDemo}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-text-secondary hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-3 h-3" />
              Assign to me
            </button>
          </div>
        </div>

        {/* Triage Notes */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-2">Triage Notes</h4>
          <textarea
            value={triageNotes}
            onChange={e => setTriageNotes(e.target.value)}
            placeholder={isDemo ? 'Connect backend to add notes...' : 'Add investigation notes...'}
            disabled={isDemo}
            rows={3}
            className="w-full px-3 py-2 text-xs bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none disabled:opacity-50"
          />
        </div>

        {/* Feedback — TP/FP */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-2">Verdict Feedback</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFeedback('true_positive')}
              disabled={feedbackMutation.isPending || isDemo}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-md bg-sev-critical/10 border border-sev-critical/20 text-sev-critical hover:bg-sev-critical/20 transition-colors disabled:opacity-50"
            >
              <ThumbsDown className="w-3 h-3" />
              True Positive
            </button>
            <button
              onClick={() => handleFeedback('false_positive')}
              disabled={feedbackMutation.isPending || isDemo}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-md bg-sev-low/10 border border-sev-low/20 text-sev-low hover:bg-sev-low/20 transition-colors disabled:opacity-50"
            >
              <ThumbsUp className="w-3 h-3" />
              False Positive
            </button>
          </div>
          {feedbackMutation.isSuccess && (
            <p className="text-[10px] text-sev-low mt-1">Feedback recorded. Signal accuracy updated.</p>
          )}
        </div>

        {/* Alert metadata */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-2">Details</h4>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-text-muted">Alert ID</span><span className="text-text-primary font-mono">{alert.id.slice(0, 12)}...</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Type</span><span className="text-text-primary">{alert.type.replace('_', ' ')}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Created</span><span className="text-text-primary tabular-nums">{new Date(alert.createdAt).toLocaleString()}</span></div>
            {alert.resolvedAt && (
              <div className="flex justify-between"><span className="text-text-muted">Resolved</span><span className="text-text-primary tabular-nums">{new Date(alert.resolvedAt).toLocaleString()}</span></div>
            )}
          </div>
        </div>

        {isDemo && (
          <div className="p-2 bg-accent/5 border border-accent/20 rounded-md text-[10px] text-accent">
            Actions disabled in demo mode. Connect the DRP service backend to enable triage, assignment, and feedback.
          </div>
        )}
      </div>
    </div>
  )
}
