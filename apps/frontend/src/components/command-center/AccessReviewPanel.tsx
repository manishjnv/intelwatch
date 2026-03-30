/**
 * @module components/command-center/AccessReviewPanel
 * @description Access review management for Users & Access tab.
 * Super admin: sees all review types + quarterly platform stats.
 * Tenant admin: sees own org stale_user reviews + org quarterly summary.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useAccessReviewStats, useAccessReviews, useAccessReviewAction, useQuarterlyReview,
  type ReviewType, type ReviewStatus, type ReviewFilters, type AccessReview,
} from '@/hooks/use-access-reviews'
import { toast } from '@/components/ui/Toast'
import {
  Clock, UserCheck, UserX, AlertTriangle, CheckCircle, XCircle,
  ShieldAlert, Users, Key, Shield, X,
} from 'lucide-react'

// ─── Badge Helpers ──────────────────────────────────────────

const REVIEW_TYPE_STYLES: Record<ReviewType, { label: string; className: string }> = {
  stale_super_admin: { label: 'Stale Super Admin (60+ days)', className: 'bg-sev-critical/15 text-sev-critical' },
  stale_user: { label: 'Stale User (90+ days)', className: 'bg-sev-high/15 text-sev-high' },
  quarterly_review: { label: 'Quarterly Review', className: 'bg-accent/15 text-accent' },
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-sev-medium/15 text-sev-medium' },
  confirmed: { label: 'Confirmed', className: 'bg-sev-low/15 text-sev-low' },
  disabled: { label: 'Disabled', className: 'bg-sev-critical/15 text-sev-critical' },
  autoDisabled: { label: 'Auto-Disabled (14d)', className: 'bg-sev-critical/15 text-sev-critical' },
}

function ReviewTypeBadge({ type }: { type: ReviewType }) {
  const s = REVIEW_TYPE_STYLES[type]
  return <span className={cn('px-1.5 py-0.5 text-[10px] rounded font-medium', s.className)}>{s.label}</span>
}

function ReviewStatusBadge({ status, autoDisabled }: { status: ReviewStatus; autoDisabled: boolean }) {
  const key = autoDisabled ? 'autoDisabled' : status
  const s = STATUS_STYLES[key] ?? STATUS_STYLES.pending
  return <span className={cn('px-1.5 py-0.5 text-[10px] rounded font-medium', s.className)}>{s.label}</span>
}

// ─── Modal Shell (matches existing pattern) ─────────────────

function ModalShell({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-bg-primary border border-border rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated"><X className="w-4 h-4 text-text-muted" /></button>
          </div>
          <div className="p-4 space-y-3">{children}</div>
        </div>
      </div>
    </>
  )
}

// ─── Summary Cards ──────────────────────────────────────────

function StatsCards({ stats }: { stats: { pending: number; autoDisabled: number; confirmed: number } }) {
  const cards = [
    { label: 'Pending Reviews', value: stats.pending, icon: Clock, color: 'text-sev-medium', bg: 'bg-sev-medium/10' },
    { label: 'Auto-Disabled', value: stats.autoDisabled, icon: UserX, color: 'text-sev-critical', bg: 'bg-sev-critical/10' },
    { label: 'Confirmed', value: stats.confirmed, icon: UserCheck, color: 'text-sev-low', bg: 'bg-sev-low/10' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="review-stats-cards">
      {cards.map(c => (
        <div key={c.label} className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', c.bg)}><c.icon className={cn('w-4 h-4', c.color)} /></div>
          <div>
            <p className="text-2xl font-bold text-text-primary tabular-nums">{c.value}</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Quarterly Summary ──────────────────────────────────────

function QuarterlySection() {
  const { data: q, isLoading } = useQuarterlyReview()

  if (isLoading) return <div className="animate-pulse h-32 bg-bg-secondary rounded-lg" />

  const roleEntries = Object.entries(q.roleBreakdown).sort((a, b) => b[1] - a[1])
  const maxRole = Math.max(...roleEntries.map(([, v]) => v), 1)

  return (
    <div className="space-y-3" data-testid="quarterly-section">
      <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Quarterly Summary</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: q.totalUsers, icon: Users },
          { label: 'Active', value: q.activeUsers, icon: CheckCircle },
          { label: 'Inactive', value: q.inactiveUsers, icon: XCircle },
          { label: 'MFA Adoption', value: `${q.mfaAdoptionPercent}%`, icon: Key },
          { label: 'SSO Users', value: q.ssoUsers, icon: Shield },
          { label: 'Added (quarter)', value: q.usersAddedThisQuarter, icon: UserCheck },
          { label: 'Removed (quarter)', value: q.usersRemovedThisQuarter, icon: UserX },
          { label: 'Stale Accounts', value: q.staleAccounts, icon: AlertTriangle },
        ].map(c => (
          <div key={c.label} className="bg-bg-secondary border border-border rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <c.icon className="w-3 h-3 text-text-muted" />
              <span className="text-[10px] text-text-muted uppercase">{c.label}</span>
            </div>
            <p className="text-lg font-bold text-text-primary tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Role breakdown bar chart */}
      <div className="bg-bg-secondary border border-border rounded-lg p-3">
        <p className="text-[10px] text-text-muted uppercase mb-2">Role Distribution</p>
        <div className="space-y-1.5">
          {roleEntries.map(([role, count]) => (
            <div key={role} className="flex items-center gap-2">
              <span className="text-[10px] text-text-secondary w-24 capitalize truncate">{role.replace(/_/g, ' ')}</span>
              <div className="flex-1 bg-bg-elevated rounded-full h-2 overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(count / maxRole) * 100}%` }} />
              </div>
              <span className="text-[10px] text-text-primary tabular-nums w-6 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MFA adoption progress bar */}
      <div className="bg-bg-secondary border border-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-text-muted uppercase">MFA Adoption</span>
          <span className="text-xs font-bold text-text-primary">{q.mfaAdoptionPercent}%</span>
        </div>
        <div className="bg-bg-elevated rounded-full h-2.5 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', q.mfaAdoptionPercent >= 80 ? 'bg-sev-low' : q.mfaAdoptionPercent >= 50 ? 'bg-sev-medium' : 'bg-sev-high')}
            style={{ width: `${q.mfaAdoptionPercent}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Review Table ───────────────────────────────────────────

function ReviewTable({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [filters, setFilters] = useState<ReviewFilters>({ page: 1, limit: 50 })
  const { data, isLoading } = useAccessReviews(filters)
  const actionMut = useAccessReviewAction()

  const [confirmModal, setConfirmModal] = useState<AccessReview | null>(null)
  const [disableModal, setDisableModal] = useState<AccessReview | null>(null)
  const [confirmNotes, setConfirmNotes] = useState('')

  const handleConfirm = () => {
    if (!confirmModal) return
    actionMut.mutate({ reviewId: confirmModal.id, action: 'confirmed', notes: confirmNotes || undefined }, {
      onSuccess: () => { toast('Access confirmed', 'success'); setConfirmModal(null); setConfirmNotes('') },
      onError: () => toast('Failed to confirm access', 'error'),
    })
  }

  const handleDisable = () => {
    if (!disableModal) return
    actionMut.mutate({ reviewId: disableModal.id, action: 'disabled' }, {
      onSuccess: () => { toast('User disabled', 'success'); setDisableModal(null) },
      onError: () => toast('Failed to disable user', 'error'),
    })
  }

  const inputClass = 'px-2 py-1.5 text-xs bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent'

  return (
    <div className="space-y-3" data-testid="review-table">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filters.reviewType ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, reviewType: e.target.value as ReviewType | 'all', page: 1 }))}
          className={inputClass}
          data-testid="filter-review-type"
        >
          <option value="all">All Types</option>
          {isSuperAdmin && <option value="stale_super_admin">Stale Super Admin</option>}
          <option value="stale_user">Stale User</option>
          <option value="quarterly_review">Quarterly Review</option>
        </select>
        <select
          value={filters.action ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, action: e.target.value as ReviewStatus | 'all', page: 1 }))}
          className={inputClass}
          data-testid="filter-action"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-bg-secondary rounded animate-pulse" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="reviews-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted uppercase text-[10px]">
                <th className="py-2 px-2">User</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2 hidden sm:table-cell">Org</th>
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2 hidden md:table-cell">Created</th>
                <th className="py-2 px-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(review => (
                <tr key={review.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors" data-testid={`review-row-${review.id}`}>
                  <td className="py-2 px-2 text-text-primary font-medium">{review.userName}</td>
                  <td className="py-2 px-2 text-text-secondary">{review.userEmail}</td>
                  <td className="py-2 px-2 text-text-secondary hidden sm:table-cell">{review.orgName}</td>
                  <td className="py-2 px-2"><ReviewTypeBadge type={review.reviewType} /></td>
                  <td className="py-2 px-2"><ReviewStatusBadge status={review.status} autoDisabled={review.autoDisabled} /></td>
                  <td className="py-2 px-2 text-text-muted hidden md:table-cell">{fmtDate(review.createdAt)}</td>
                  <td className="py-2 px-2">
                    {review.status === 'pending' && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setConfirmModal(review)}
                          className="px-2 py-1 text-[10px] rounded bg-sev-low/15 text-sev-low hover:bg-sev-low/25 transition-colors"
                          data-testid={`confirm-btn-${review.id}`}
                        >Confirm</button>
                        <button
                          onClick={() => setDisableModal(review)}
                          className="px-2 py-1 text-[10px] rounded bg-sev-critical/15 text-sev-critical hover:bg-sev-critical/25 transition-colors"
                          data-testid={`disable-btn-${review.id}`}
                        >Disable</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-text-muted">No reviews found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data.total > data.limit && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[10px] text-text-muted">
            Page {data.page} of {Math.ceil(data.total / data.limit)} ({data.total} total)
          </span>
          <div className="flex gap-1">
            <button
              disabled={data.page <= 1}
              onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="px-2 py-1 text-[10px] rounded bg-bg-secondary border border-border text-text-secondary disabled:opacity-40 hover:bg-bg-hover"
            >Prev</button>
            <button
              disabled={data.page >= Math.ceil(data.total / data.limit)}
              onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="px-2 py-1 text-[10px] rounded bg-bg-secondary border border-border text-text-secondary disabled:opacity-40 hover:bg-bg-hover"
            >Next</button>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ModalShell open={!!confirmModal} onClose={() => { setConfirmModal(null); setConfirmNotes('') }} title="Confirm Access">
        <p className="text-xs text-text-secondary">Confirm this user's access is still needed?</p>
        <p className="text-xs text-text-primary font-medium">{confirmModal?.userName} ({confirmModal?.userEmail})</p>
        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">Notes (optional)</label>
          <textarea
            value={confirmNotes}
            onChange={e => setConfirmNotes(e.target.value)}
            placeholder="Reason for confirming..."
            className="w-full px-3 py-2 text-xs bg-bg-secondary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none h-20"
            data-testid="confirm-notes"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => { setConfirmModal(null); setConfirmNotes('') }} className="px-3 py-1.5 text-xs rounded bg-bg-secondary border border-border text-text-secondary hover:bg-bg-hover">Cancel</button>
          <button onClick={handleConfirm} disabled={actionMut.isPending} className="px-3 py-1.5 text-xs rounded bg-sev-low text-bg-primary font-medium hover:bg-sev-low/90 disabled:opacity-50" data-testid="confirm-submit">
            {actionMut.isPending ? 'Confirming…' : 'Confirm Access'}
          </button>
        </div>
      </ModalShell>

      {/* Disable Modal */}
      <ModalShell open={!!disableModal} onClose={() => setDisableModal(null)} title="Disable User">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-sev-critical/10 border border-sev-critical/20">
          <ShieldAlert className="w-4 h-4 text-sev-critical shrink-0 mt-0.5" />
          <p className="text-xs text-sev-critical">This will immediately disable the user and terminate all their sessions.</p>
        </div>
        <p className="text-xs text-text-primary font-medium">{disableModal?.userName} ({disableModal?.userEmail})</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setDisableModal(null)} className="px-3 py-1.5 text-xs rounded bg-bg-secondary border border-border text-text-secondary hover:bg-bg-hover">Cancel</button>
          <button onClick={handleDisable} disabled={actionMut.isPending} className="px-3 py-1.5 text-xs rounded bg-sev-critical text-white font-medium hover:bg-sev-critical/90 disabled:opacity-50" data-testid="disable-submit">
            {actionMut.isPending ? 'Disabling…' : 'Disable User'}
          </button>
        </div>
      </ModalShell>
    </div>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Main Export ────────────────────────────────────────────

interface AccessReviewPanelProps {
  isSuperAdmin: boolean
}

export function AccessReviewPanel({ isSuperAdmin }: AccessReviewPanelProps) {
  const { data: stats, isLoading: statsLoading } = useAccessReviewStats()

  return (
    <div className="space-y-4" data-testid="access-review-panel">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4 text-accent" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Access Reviews</h3>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-bg-secondary rounded-lg animate-pulse" />)}</div>
      ) : (
        <StatsCards stats={stats} />
      )}

      <ReviewTable isSuperAdmin={isSuperAdmin} />
      <QuarterlySection />
    </div>
  )
}
