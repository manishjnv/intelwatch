/**
 * @module components/command-center/OffboardingPanel
 * @description Offboarding pipeline view — super_admin only.
 * Shows deactivated tenants (data retained, never purged), trigger/cancel actions,
 * and status detail timeline. DECISION-048: honest empty/error states, no demo data.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useOffboardingPipeline, useOffboardTenant, useCancelOffboard, useOffboardStatus,
  type OffboardingEntry,
} from '@/hooks/use-offboarding'
import { QueryStateView } from '@/components/ui/QueryStateView'
import {
  AlertTriangle, X, CheckCircle2, Clock,
  Trash2, RotateCcw, ChevronRight, ShieldCheck,
} from 'lucide-react'

// ─── Status Helpers ─────────────────────────────────────────

function StatusBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-accent/20 text-accent">
      <ShieldCheck className="w-3 h-3" />
      Deactivated · data retained
    </span>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Offboard Confirm Modal ─────────────────────────────────

function OffboardConfirmModal({ orgName, onConfirm, onCancel, isPending }: {
  orgName: string; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  const [typedName, setTypedName] = useState('')
  const matches = typedName === orgName

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="offboard-confirm-modal">
      <div className="bg-bg-primary border border-border rounded-lg p-5 max-w-md w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-sev-critical" /> Offboard Organization
          </h3>
          <button onClick={onCancel} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-2 text-xs text-text-secondary">
          <p className="font-medium text-sev-high">This will immediately:</p>
          <ul className="space-y-1 ml-4">
            <li>Block <strong className="text-text-primary">{orgName}</strong> and all its users</li>
            <li>Terminate all active sessions</li>
            <li>Revoke all API keys and SCIM tokens</li>
            <li>Disable SSO configuration</li>
          </ul>
          <p>All data is kept — nothing is deleted. Reactivate at any time to restore access.</p>
        </div>

        <div>
          <label className="text-xs text-text-muted block mb-1">
            Type <strong className="text-text-primary">{orgName}</strong> to confirm:
          </label>
          <input
            data-testid="offboard-confirm-input"
            type="text"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary placeholder:text-text-muted"
            placeholder={orgName}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button
            data-testid="offboard-confirm-btn"
            onClick={onConfirm}
            disabled={!matches || isPending}
            className="px-4 py-1.5 text-xs bg-sev-critical text-white rounded-lg hover:bg-sev-critical/80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Offboarding...' : 'Offboard Organization'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Confirm Modal ───────────────────────────────────

function ReactivateConfirmModal({ onConfirm, onCancel, isPending }: {
  onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="cancel-offboard-modal">
      <div className="bg-bg-primary border border-border rounded-lg p-5 max-w-sm w-full mx-4 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Reactivate Organization</h3>
        <div className="text-xs text-text-secondary space-y-1">
          <p>This will re-enable the organization. Users will need to log in again.</p>
          <p>Sessions and API keys were revoked and must be regenerated. All data was retained.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button
            data-testid="cancel-offboard-confirm-btn"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-1.5 text-xs bg-accent text-bg-primary rounded-lg hover:bg-accent/80 disabled:opacity-50"
          >
            {isPending ? 'Reactivating...' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status Detail Panel ────────────────────────────────────

function StatusDetailPanel({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const statusQuery = useOffboardStatus(tenantId)

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-bg-primary border-l border-border shadow-xl z-50 overflow-y-auto" data-testid="offboard-status-panel">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Offboard Status</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
      </div>

      <div className="p-4">
        <QueryStateView
          query={statusQuery}
          resource="offboard status"
          skeleton={(
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-bg-elevated rounded animate-pulse" />)}
            </div>
          )}
        >
          {detail => (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-text-primary">{detail.orgName}</p>
                <StatusBadge />
              </div>

              {/* Timeline */}
              <div className="space-y-2" data-testid="offboard-timeline">
                {detail.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {step.completed
                      ? <CheckCircle2 className="w-4 h-4 text-sev-low mt-0.5 shrink-0" />
                      : <Clock className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />}
                    <div>
                      <p className={cn('text-xs', step.completed ? 'text-text-primary' : 'text-text-muted')}>
                        {step.completed ? '✅' : '⏳'} {step.label}
                        {step.count != null && <span className="text-text-muted"> ({step.count})</span>}
                      </p>
                      {step.detail && <p className="text-[10px] text-text-muted">{step.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </QueryStateView>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

interface OffboardingPanelProps {
  /** Pass a tenantId + orgName to show the offboard trigger button inline */
  triggerForTenant?: { tenantId: string; orgName: string }
}

export function OffboardingPanel({ triggerForTenant }: OffboardingPanelProps) {
  const pipelineQuery = useOffboardingPipeline()
  const offboardMut = useOffboardTenant()
  const cancelMut = useCancelOffboard()

  const [offboardTarget, setOffboardTarget] = useState<{ tenantId: string; orgName: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...(pipelineQuery.data ?? [])].sort(
      (a, b) => new Date(a.offboardedAt).getTime() - new Date(b.offboardedAt).getTime(),
    ),
    [pipelineQuery.data],
  )

  return (
    <div className="space-y-4" data-testid="offboarding-panel">
      {/* Inline offboard trigger for a specific tenant */}
      {triggerForTenant && (
        <button
          data-testid="offboard-trigger-btn"
          onClick={() => setOffboardTarget(triggerForTenant)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sev-critical border border-sev-critical/30 rounded-lg hover:bg-sev-critical/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Offboard
        </button>
      )}

      {/* Pipeline heading */}
      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
        <Trash2 className="w-4 h-4 text-sev-critical" />
        Deactivated Organizations
      </h3>

      {/* Pipeline list */}
      <QueryStateView
        query={{ ...pipelineQuery, data: sorted }}
        resource="deactivated organizations"
        isEmpty={d => d.length === 0}
        empty={(
          <div className="p-6 text-center text-xs text-text-muted bg-bg-elevated rounded-lg border border-border" data-testid="offboard-empty">
            No organizations are deactivated.
          </div>
        )}
      >
        {entries => (
          <div className="space-y-2" data-testid="offboard-pipeline-list">
            {entries.map(entry => (
              <PipelineRow
                key={entry.tenantId}
                entry={entry}
                onViewDetail={() => setDetailTarget(entry.tenantId)}
                onCancel={() => setCancelTarget(entry.tenantId)}
              />
            ))}
          </div>
        )}
      </QueryStateView>

      {/* Modals */}
      {offboardTarget && (
        <OffboardConfirmModal
          orgName={offboardTarget.orgName}
          isPending={offboardMut.isPending}
          onConfirm={() => {
            offboardMut.mutate(offboardTarget.tenantId, { onSuccess: () => setOffboardTarget(null) })
          }}
          onCancel={() => setOffboardTarget(null)}
        />
      )}
      {cancelTarget && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setCancelTarget(null)} />
          <ReactivateConfirmModal
            isPending={cancelMut.isPending}
            onConfirm={() => {
              cancelMut.mutate(cancelTarget, { onSuccess: () => setCancelTarget(null) })
            }}
            onCancel={() => setCancelTarget(null)}
          />
        </>
      )}
      {detailTarget && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setDetailTarget(null)} />
          <StatusDetailPanel tenantId={detailTarget} onClose={() => setDetailTarget(null)} />
        </>
      )}
    </div>
  )
}

// ─── Pipeline Row ───────────────────────────────────────────

function PipelineRow({ entry, onViewDetail, onCancel }: {
  entry: OffboardingEntry; onViewDetail: () => void; onCancel: () => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-bg-elevated rounded-lg border border-border">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-primary truncate">{entry.orgName}</span>
          <StatusBadge />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
          <span>By: {entry.offboardedBy}</span>
          <span>{fmtDate(entry.offboardedAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          data-testid={`cancel-offboard-${entry.tenantId}`}
          onClick={onCancel}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-accent border border-border rounded hover:bg-bg-hover transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reactivate
        </button>
        <button
          data-testid={`view-detail-${entry.tenantId}`}
          onClick={onViewDetail}
          className="p-1 text-text-muted hover:text-text-primary"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
