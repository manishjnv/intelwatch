/**
 * @module components/viz/UserManagementModals
 * @description User Management page detail panel.
 * Invite/Create Team/Create Role modals removed (S162 honest UI) — no DB-backed invite flow,
 * no Team model in Prisma, and custom roles are never enforced (see use-phase5-data useRoles).
 */
import { cn } from '@/lib/utils'
import { type UserRecord } from '@/hooks/use-phase5-data'
import {
  X, Shield, Lock, Unlock, Mail, Clock, Users,
} from 'lucide-react'

// ─── User Detail Panel ──────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const hrs = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hrs < 1) return '<1h ago'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-sev-low', locked: 'text-sev-critical', invited: 'text-accent',
}

// Real RBAC is the 3-value Prisma Role enum (schema.prisma:102).
const ROLE_COLORS: Record<string, string> = {
  super_admin: 'text-sev-critical bg-sev-critical/10',
  tenant_admin: 'text-sev-high bg-sev-high/10',
  analyst: 'text-accent bg-accent/10',
}

export function UserDetailPanel({ user, onClose }: {
  user: UserRecord; onClose: () => void
}) {
  return (
    <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-bg-primary border-l border-border z-50 overflow-y-auto shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">{user.name}</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated transition-colors">
          <X className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Status + Role header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
            <span className="text-accent font-bold text-sm">{user.name.split(' ').map(n => n[0]).join('')}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-medium capitalize', STATUS_COLORS[user.status] ?? '')}>{user.status}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ROLE_COLORS[user.role] ?? 'text-accent bg-accent/10')}>
                {user.role.replace('_', ' ')}
              </span>
            </div>
            <span className="text-[10px] text-text-muted">{user.email}</span>
          </div>
        </div>

        {/* Profile Info */}
        <div className="space-y-2">
          <h3 className="text-[10px] text-text-muted uppercase font-medium">Profile</h3>
          <div className="bg-bg-secondary rounded-lg border border-border p-3 space-y-2">
            <DetailRow icon={Mail} label="Email" value={user.email} />
            <DetailRow icon={Users} label="Team" value={user.team ?? 'Unassigned'} />
            <DetailRow icon={Shield} label="MFA" value={user.mfaEnabled ? 'Enabled' : 'Disabled'} color={user.mfaEnabled ? 'text-sev-low' : 'text-sev-critical'} />
            <DetailRow icon={Clock} label="Last Login" value={timeAgo(user.lastLogin)} />
            <DetailRow icon={Clock} label="Created" value={timeAgo(user.createdAt)} />
          </div>
        </div>

        {/* Security Status */}
        <div className="space-y-2">
          <h3 className="text-[10px] text-text-muted uppercase font-medium">Security</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-bg-secondary rounded border border-border text-center">
              <Shield className={cn('w-4 h-4 mx-auto mb-1', user.mfaEnabled ? 'text-sev-low' : 'text-sev-critical')} />
              <span className="text-[10px] text-text-muted">MFA</span>
              <p className={cn('text-xs font-medium', user.mfaEnabled ? 'text-sev-low' : 'text-sev-critical')}>
                {user.mfaEnabled ? 'Active' : 'Off'}
              </p>
            </div>
            <div className="p-2 bg-bg-secondary rounded border border-border text-center">
              {user.status === 'locked' ? <Lock className="w-4 h-4 mx-auto mb-1 text-sev-critical" /> : <Unlock className="w-4 h-4 mx-auto mb-1 text-sev-low" />}
              <span className="text-[10px] text-text-muted">Account</span>
              <p className={cn('text-xs font-medium capitalize', user.status === 'locked' ? 'text-sev-critical' : 'text-sev-low')}>{user.status}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <h3 className="text-[10px] text-text-muted uppercase font-medium">Actions</h3>
          <div className="flex flex-col gap-2">
            {user.status === 'active' && (
              <button
                className="w-full py-2 text-xs font-medium bg-sev-critical/10 text-sev-critical border border-sev-critical/20 rounded hover:bg-sev-critical/20 transition-colors disabled:opacity-50">
                Lock Account
              </button>
            )}
            {user.status === 'locked' && (
              <button
                className="w-full py-2 text-xs font-medium bg-sev-low/10 text-sev-low border border-sev-low/20 rounded hover:bg-sev-low/20 transition-colors disabled:opacity-50">
                Unlock Account
              </button>
            )}
            {!user.mfaEnabled && (
              <button
                className="w-full py-2 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors disabled:opacity-50">
                Require MFA
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function DetailRow({ icon: Icon, label, value, color }: {
  icon: React.FC<{ className?: string }>; label: string; value: string; color?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-text-muted" />
        <span className="text-[10px] text-text-muted">{label}</span>
      </div>
      <span className={cn('text-xs', color ?? 'text-text-primary')}>{value}</span>
    </div>
  )
}
