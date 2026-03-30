/**
 * @module components/security/ActiveSessionsList
 * @description Active sessions table with geo/UA info, terminate, suspicious badges.
 */
import { useState } from 'react'
import { Monitor, Smartphone, Globe, AlertTriangle, Trash2, X, Loader2, LogOut } from 'lucide-react'
import { useSessions, useTerminateSession, useTerminateAllOtherSessions } from '@/hooks/use-sessions'
import { toast } from '@/components/ui/Toast'
import type { SessionInfo } from '@/types/auth-security'

// ─── UA Parser ─────────────────────────────────────────────────

function parseUserAgent(ua: string): { browser: string; os: string; isMobile: boolean } {
  let browser = 'Unknown'
  let os = 'Unknown'

  // Browser
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari'

  // OS
  if (ua.includes('Windows NT 10')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

  const isMobile = ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')

  return { browser, os, isMobile }
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Country code → flag emoji
function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))
}

// ─── Confirm Modal ─────────────────────────────────────────────

function ConfirmModal({ title, message, onConfirm, onCancel, isPending }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" data-testid="confirm-modal">
      <div className="bg-bg-primary border border-border rounded-xl p-5 max-w-sm w-full shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <button onClick={onCancel} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 py-2 text-xs font-medium bg-sev-high text-white rounded-lg hover:bg-sev-high/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            data-testid="confirm-action-btn"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Session Card ──────────────────────────────────────────────

function SessionCard({ session, onTerminate }: { session: SessionInfo; onTerminate: () => void }) {
  const { browser, os, isMobile } = parseUserAgent(session.userAgent)
  const DeviceIcon = isMobile ? Smartphone : Monitor

  return (
    <div
      className={`border rounded-lg p-3 bg-bg-primary transition-colors ${
        session.isCurrent ? 'border-sev-low/30' : 'border-border hover:border-border-strong'
      }`}
      data-testid={`session-${session.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <DeviceIcon className={`w-4 h-4 mt-0.5 shrink-0 ${session.isCurrent ? 'text-sev-low' : 'text-text-muted'}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-text-primary">{browser} on {os}</span>
              {session.isCurrent && (
                <span className="px-1.5 py-0.5 text-[10px] rounded font-medium bg-sev-low/20 text-sev-low" data-testid="current-badge">
                  Current Session
                </span>
              )}
              {session.suspiciousLogin && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded font-medium bg-amber-500/20 text-amber-400" data-testid="suspicious-badge">
                  <AlertTriangle className="w-2.5 h-2.5" /> Unusual location
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {session.geoCity && (
                <span className="flex items-center gap-1 text-[10px] text-text-muted">
                  <Globe className="w-2.5 h-2.5" />
                  {countryFlag(session.geoCountry)} {session.geoCity}, {session.geoCountry}
                  {session.geoIsp && <span className="text-text-muted/60">({session.geoIsp})</span>}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
              <span>IP: {session.ipAddress}</span>
              <span>Started: {formatTimeAgo(session.createdAt)}</span>
              <span className="hidden sm:inline">Last active: {formatTimeAgo(session.lastUsedAt)}</span>
            </div>
          </div>
        </div>

        {!session.isCurrent && (
          <button
            onClick={onTerminate}
            className="shrink-0 p-1.5 text-text-muted hover:text-sev-high hover:bg-sev-high/10 rounded-lg transition-colors"
            title="Terminate session"
            data-testid={`terminate-${session.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────

export function ActiveSessionsList() {
  const sessions = useSessions()
  const terminate = useTerminateSession()
  const terminateAll = useTerminateAllOtherSessions()
  const [confirmTarget, setConfirmTarget] = useState<string | 'all' | null>(null)

  const sessionList = sessions.data ?? []
  const sorted = [...sessionList].sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
  })
  const otherCount = sorted.filter(s => !s.isCurrent).length

  const handleConfirm = () => {
    if (confirmTarget === 'all') {
      terminateAll.mutate(undefined, {
        onSuccess: () => { toast('All other sessions terminated', 'success'); setConfirmTarget(null) },
      })
    } else if (confirmTarget) {
      terminate.mutate(confirmTarget, {
        onSuccess: () => { toast('Session terminated', 'success'); setConfirmTarget(null) },
      })
    }
  }

  if (sessions.isLoading) {
    return (
      <div className="space-y-2" data-testid="sessions-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-bg-elevated rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="active-sessions-list">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Active Sessions</h3>
        {otherCount > 0 && (
          <button
            onClick={() => setConfirmTarget('all')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-sev-high/30 text-sev-high rounded-lg hover:bg-sev-high/10 transition-colors"
            data-testid="terminate-all-btn"
          >
            <LogOut className="w-3 h-3" /> End All Other Sessions
          </button>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            onTerminate={() => setConfirmTarget(session.id)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-8 text-xs text-text-muted">No active sessions found</div>
        )}
      </div>

      {confirmTarget && (
        <ConfirmModal
          title={confirmTarget === 'all' ? 'End All Other Sessions' : 'End Session'}
          message={confirmTarget === 'all'
            ? 'All other devices will be logged out immediately.'
            : 'End this session? The device will be logged out.'
          }
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
          isPending={terminate.isPending || terminateAll.isPending}
        />
      )}
    </div>
  )
}
