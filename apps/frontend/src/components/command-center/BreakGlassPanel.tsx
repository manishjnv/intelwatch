/**
 * @module components/command-center/BreakGlassPanel
 * @description Break-glass emergency access panel — super_admin only.
 * Status card, audit log with colored event badges, rotate password, force terminate.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useBreakGlassStatus, useBreakGlassAudit,
  useRotateBreakGlassPassword, useForceTerminateBreakGlass,
  type AuditEventType,
} from '@/hooks/use-break-glass'
import {
  Shield, ShieldAlert, X, Key, Trash2, Clock,
  AlertTriangle, Eye, Lock, LogOut, Activity,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

// ─── Event Badge Config ─────────────────────────────────────

function eventBadge(event: AuditEventType): { label: string; color: string; icon: React.FC<{ className?: string }> } {
  if (event === 'login.success') return { label: 'Emergency Login', color: 'bg-sev-critical/20 text-sev-critical', icon: ShieldAlert }
  if (event === 'login.failed') return { label: 'Failed Attempt', color: 'bg-amber-400/20 text-amber-400', icon: AlertTriangle }
  if (event === 'login.locked') return { label: 'Locked Out', color: 'bg-sev-critical/20 text-sev-critical', icon: Lock }
  if (event === 'session_expired') return { label: 'Session Expired', color: 'bg-bg-hover text-text-muted', icon: Clock }
  if (event === 'session_replaced') return { label: 'Session Replaced', color: 'bg-amber-400/20 text-amber-400', icon: LogOut }
  if (event.startsWith('action.')) return { label: `Action: ${event.replace('action.', '')}`, color: 'bg-accent/20 text-accent', icon: Activity }
  return { label: event, color: 'bg-bg-hover text-text-muted', icon: Eye }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Rotate Password Modal ──────────────────────────────────

function RotatePasswordModal({ onConfirm, onCancel, isPending }: {
  onConfirm: (pw: string) => void; onCancel: () => void; isPending: boolean
}) {
  const [password, setPassword] = useState('')
  const isValid = password.length >= 20

  // Simple strength indicator
  const strength = password.length >= 30 ? 'Strong' : password.length >= 20 ? 'Acceptable' : 'Too short'
  const strengthColor = password.length >= 30 ? 'text-sev-low' : password.length >= 20 ? 'text-amber-400' : 'text-sev-critical'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="rotate-password-modal">
      <div className="bg-bg-primary border border-border rounded-lg p-5 max-w-md w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" /> Rotate Break-Glass Password
          </h3>
          <button onClick={onCancel} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-xs text-text-muted block mb-1">New password (minimum 20 characters):</label>
          <input
            data-testid="rotate-password-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
            placeholder="Enter new break-glass password"
          />
          <div className="flex items-center justify-between mt-1">
            <span className={cn('text-[10px]', strengthColor)}>{strength} ({password.length}/20+)</span>
            {/* Strength bar */}
            <div className="flex gap-0.5">
              {[1, 2, 3].map(i => (
                <div key={i} className={cn('w-6 h-1 rounded-full', i <= (password.length >= 30 ? 3 : password.length >= 20 ? 2 : password.length >= 10 ? 1 : 0) ? (password.length >= 30 ? 'bg-sev-low' : password.length >= 20 ? 'bg-amber-400' : 'bg-sev-critical') : 'bg-bg-hover')} />
              ))}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-text-muted">This will terminate any active break-glass session.</p>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button
            data-testid="rotate-password-confirm-btn"
            onClick={() => onConfirm(password)}
            disabled={!isValid || isPending}
            className="px-4 py-1.5 text-xs bg-accent text-bg-primary rounded-lg hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Rotating...' : 'Rotate Password'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Force Terminate Modal ──────────────────────────────────

function TerminateModal({ onConfirm, onCancel, isPending }: {
  onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="terminate-modal">
      <div className="bg-bg-primary border border-border rounded-lg p-5 max-w-sm w-full mx-4 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Force Terminate Session</h3>
        <p className="text-xs text-text-secondary">Immediately terminate the active break-glass session?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button
            data-testid="terminate-confirm-btn"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-1.5 text-xs bg-sev-critical text-white rounded-lg hover:bg-sev-critical/80 disabled:opacity-50"
          >
            {isPending ? 'Terminating...' : 'Force Terminate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function BreakGlassPanel() {
  const { data: status, isDemo: statusIsDemo } = useBreakGlassStatus()
  const rotateMut = useRotateBreakGlassPassword()
  const terminateMut = useForceTerminateBreakGlass()

  const [showRotateModal, setShowRotateModal] = useState(false)
  const [showTerminateModal, setShowTerminateModal] = useState(false)
  const [auditPage, setAuditPage] = useState(1)
  const [dateFilter, setDateFilter] = useState('')

  const auditFilters = useMemo(() => ({
    page: auditPage,
    limit: 10,
    ...(dateFilter ? { startDate: dateFilter } : {}),
  }), [auditPage, dateFilter])

  const { data: auditData, isDemo: auditIsDemo } = useBreakGlassAudit(auditFilters)
  const auditEntries = auditData.data
  const totalPages = Math.max(1, Math.ceil(auditData.total / 10))

  const isDemo = statusIsDemo || auditIsDemo

  // Countdown for active session
  const sessionRemaining = status.session
    ? Math.max(0, Math.ceil((new Date(status.session.expiresAt).getTime() - Date.now()) / 60_000))
    : 0

  return (
    <div className="space-y-4" data-testid="break-glass-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-sev-critical" /> Emergency Access
        </h3>
        {isDemo && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Demo</span>
        )}
      </div>

      {/* Status Card */}
      <div
        data-testid="break-glass-status-card"
        className={cn(
          'p-4 rounded-lg border',
          status.activeSession
            ? 'bg-sev-critical/10 border-sev-critical/30'
            : 'bg-bg-elevated border-border',
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              'w-3 h-3 rounded-full',
              status.activeSession ? 'bg-sev-critical animate-pulse' : 'bg-sev-low',
            )} />
            <span className={cn(
              'text-sm font-medium',
              status.activeSession ? 'text-sev-critical' : 'text-sev-low',
            )}>
              {status.activeSession ? 'ACTIVE SESSION' : 'Ready'}
            </span>
          </div>
          <div className="text-[10px] text-text-muted">
            Total uses: {status.useCount}
          </div>
        </div>

        <div className="mt-2 text-xs text-text-secondary">
          Last used: {status.lastUsed ? fmtTime(status.lastUsed) : 'Never'}
        </div>

        {/* Active session details */}
        {status.activeSession && status.session && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-muted">IP:</span>{' '}
              <span className="text-text-primary">{status.session.ip}</span>
            </div>
            <div>
              <span className="text-text-muted">Location:</span>{' '}
              <span className="text-text-primary">{status.session.geo}</span>
            </div>
            <div>
              <span className="text-text-muted">Started:</span>{' '}
              <span className="text-text-primary">{fmtTime(status.session.startedAt)}</span>
            </div>
            <div>
              <span className="text-text-muted">Remaining:</span>{' '}
              <span className={cn('font-medium', sessionRemaining < 5 ? 'text-sev-critical' : 'text-amber-400')}>
                {sessionRemaining} min
              </span>
            </div>
          </div>
        )}

        {/* Management Actions */}
        <div className="mt-3 flex items-center gap-2">
          <button
            data-testid="rotate-password-btn"
            onClick={() => setShowRotateModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors"
          >
            <Key className="w-3 h-3" /> Rotate Password
          </button>
          {status.activeSession && (
            <button
              data-testid="force-terminate-btn"
              onClick={() => setShowTerminateModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-sev-critical border border-sev-critical/30 rounded-lg hover:bg-sev-critical/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Force Terminate
            </button>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-text-primary">Audit Log</h4>
          <input
            data-testid="audit-date-filter"
            type="date"
            value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); setAuditPage(1) }}
            className="px-2 py-1 text-[10px] bg-bg-elevated border border-border rounded text-text-primary"
          />
        </div>

        {auditEntries.length === 0 ? (
          <p className="text-xs text-text-muted p-3 bg-bg-elevated rounded-lg border border-border text-center">
            No audit events recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="audit-table">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 px-2 font-medium">Event</th>
                  <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">IP</th>
                  <th className="text-left py-2 px-2 font-medium hidden md:table-cell">Location</th>
                  <th className="text-left py-2 px-2 font-medium">Time</th>
                  <th className="text-left py-2 px-2 font-medium hidden lg:table-cell">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map(entry => {
                  const badge = eventBadge(entry.event)
                  const Icon = badge.icon
                  return (
                    <tr key={entry.id} className="border-b border-border/50">
                      <td className="py-1.5 px-2">
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', badge.color)}>
                          <Icon className="w-3 h-3" /> {badge.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-text-primary hidden sm:table-cell">{entry.ip}</td>
                      <td className="py-1.5 px-2 text-text-muted hidden md:table-cell">{entry.location}</td>
                      <td className="py-1.5 px-2 text-text-muted">{fmtTime(entry.timestamp)}</td>
                      <td className="py-1.5 px-2 text-text-muted hidden lg:table-cell">{entry.details ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>Page {auditPage} of {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                disabled={auditPage <= 1}
                className="p-1 hover:text-text-primary disabled:opacity-40"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setAuditPage(p => Math.min(totalPages, p + 1))}
                disabled={auditPage >= totalPages}
                className="p-1 hover:text-text-primary disabled:opacity-40"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showRotateModal && (
        <RotatePasswordModal
          isPending={rotateMut.isPending}
          onConfirm={(pw) => rotateMut.mutate(pw, { onSuccess: () => setShowRotateModal(false) })}
          onCancel={() => setShowRotateModal(false)}
        />
      )}
      {showTerminateModal && (
        <TerminateModal
          isPending={terminateMut.isPending}
          onConfirm={() => terminateMut.mutate(undefined, { onSuccess: () => setShowTerminateModal(false) })}
          onCancel={() => setShowTerminateModal(false)}
        />
      )}
    </div>
  )
}
