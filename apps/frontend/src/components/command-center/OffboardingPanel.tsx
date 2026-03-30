/**
 * @module components/command-center/OffboardingPanel
 * @description Offboarding pipeline view — super_admin only.
 * Shows tenants in offboarding pipeline with status badges, purge countdowns,
 * trigger/cancel actions, and status detail timeline.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useOffboardingPipeline, useOffboardTenant, useCancelOffboard, useOffboardStatus,
  type OffboardingEntry, type OffboardStatus,
} from '@/hooks/use-offboarding'
import {
  AlertTriangle, X, CheckCircle2, Clock, Loader2,
  Trash2, RotateCcw, ChevronRight, Archive, CloudOff,
} from 'lucide-react'

// ─── Status Helpers ─────────────────────────────────────────

const STATUS_CONFIG: Record<OffboardStatus, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  offboarding: { label: 'Offboarding In Progress', color: 'bg-amber-400/20 text-amber-400', icon: Loader2 },
  archived: { label: 'Archived — Awaiting Purge', color: 'bg-accent/20 text-accent', icon: Archive },
  purged: { label: 'Purged', color: 'bg-bg-hover text-text-muted', icon: CloudOff },
}

function StatusBadge({ status }: { status: OffboardStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium', cfg.color)}>
      <Icon className={cn('w-3 h-3', status === 'offboarding' && 'animate-spin')} />
      {cfg.label}
    </span>
  )
}

function PurgeCountdown({ purgeDate }: { purgeDate: string | null }) {
  if (!purgeDate) return <span className="text-text-muted">—</span>
  const days = Math.ceil((new Date(purgeDate).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return <span className="text-text-muted">Purge overdue</span>
  return (
    <span className={cn('text-xs tabular-nums', days < 7 ? 'text-sev-critical font-medium' : 'text-text-secondary')}>
      Purges in {days} day{days !== 1 ? 's' : ''}
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
            <li>Disable all users in <strong className="text-text-primary">{orgName}</strong></li>
            <li>Terminate all active sessions</li>
            <li>Revoke all API keys and SCIM tokens</li>
            <li>Disable SSO configuration</li>
            <li>Schedule data purge in 60 days</li>
          </ul>
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

function CancelConfirmModal({ onConfirm, onCancel, isPending }: {
  onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="cancel-offboard-modal">
      <div className="bg-bg-primary border border-border rounded-lg p-5 max-w-sm w-full mx-4 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Cancel Offboarding</h3>
        <div className="text-xs text-text-secondary space-y-1">
          <p>This will re-enable the organization. Users will need to log in again.</p>
          <p>Sessions and API keys were revoked and must be regenerated.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button
            data-testid="cancel-offboard-confirm-btn"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-1.5 text-xs bg-accent text-bg-primary rounded-lg hover:bg-accent/80 disabled:opacity-50"
          >
            {isPending ? 'Cancelling...' : 'Confirm Re-enable'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status Detail Panel ────────────────────────────────────

function StatusDetailPanel({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useOffboardStatus(tenantId)

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-bg-primary border-l border-border shadow-xl z-50 overflow-y-auto" data-testid="offboard-status-panel">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Offboard Status</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-bg-elevated rounded animate-pulse" />)}
        </div>
      ) : detail ? (
        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-text-primary">{detail.orgName}</p>
            <StatusBadge status={detail.status} />
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

          {/* Archive path */}
          {detail.archivePath && (
            <div className="p-2.5 bg-bg-elevated rounded-lg border border-border">
              <p className="text-[10px] text-text-muted mb-0.5">S3 Archive Reference</p>
              <p className="text-xs text-accent break-all">{detail.archivePath}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="p-4 text-xs text-text-muted">No status data available.</p>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

interface OffboardingPanelProps {
  /** Pass a tenantId + orgName to show the offboard trigger button inline */
  triggerForTenant?: { tenantId: string; orgName: string }
}

export function OffboardingPanel({ triggerForTenant }: OffboardingPanelProps) {
  const { data: pipeline, isDemo } = useOffboardingPipeline()
  const offboardMut = useOffboardTenant()
  const cancelMut = useCancelOffboard()

  const [offboardTarget, setOffboardTarget] = useState<{ tenantId: string; orgName: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<string | null>(null)

  // Sort: offboarding first, then archived, then purged
  const sorted = useMemo(() => {
    const order: Record<string, number> = { offboarding: 0, archived: 1, purged: 2 }
    return [...pipeline].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
  }, [pipeline])

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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <Trash2 className="w-4 h-4 text-sev-critical" />
          Offboarding Pipeline
        </h3>
        {isDemo && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Demo</span>
        )}
      </div>

      {/* Pipeline list */}
      {sorted.length === 0 ? (
        <div className="p-6 text-center text-xs text-text-muted bg-bg-elevated rounded-lg border border-border" data-testid="offboard-empty">
          No organizations in the offboarding pipeline.
        </div>
      ) : (
        <div className="space-y-2" data-testid="offboard-pipeline-list">
          {sorted.map(entry => (
            <PipelineRow
              key={entry.tenantId}
              entry={entry}
              onViewDetail={() => setDetailTarget(entry.tenantId)}
              onCancel={() => setCancelTarget(entry.tenantId)}
            />
          ))}
        </div>
      )}

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
          <CancelConfirmModal
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
  const canCancel = entry.status === 'offboarding' || entry.status === 'archived'

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-bg-elevated rounded-lg border border-border">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-primary truncate">{entry.orgName}</span>
          <StatusBadge status={entry.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
          <span>By: {entry.offboardedBy}</span>
          <span>{fmtDate(entry.offboardedAt)}</span>
          {entry.status !== 'purged' && <PurgeCountdown purgeDate={entry.purgeScheduledAt} />}
          {entry.status === 'purged' && <span>Purged {fmtDate(entry.purgedAt)}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {canCancel && (
          <button
            data-testid={`cancel-offboard-${entry.tenantId}`}
            onClick={onCancel}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-accent border border-border rounded hover:bg-bg-hover transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Cancel
          </button>
        )}
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
