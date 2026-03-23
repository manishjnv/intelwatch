/**
 * @module components/viz/UserManagementModals
 * @description Modals and detail panels for User Management page:
 * Invite User, Create Team, Create Role, User Detail Panel.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useInviteUser, useCreateTeam, useCreateRole,
  type UserRecord, type RoleRecord, type TeamRecord,
} from '@/hooks/use-phase5-data'
import {
  X, Shield, Lock, Unlock, Mail, Clock, Users,
} from 'lucide-react'

// ─── Shared Modal Shell ─────────────────────────────────────────

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
            <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated transition-colors">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
          <div className="p-4 space-y-3">{children}</div>
        </div>
      </div>
    </>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-text-muted uppercase font-medium">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full px-3 py-2 text-xs bg-bg-secondary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent'

// ─── Invite User Modal ──────────────────────────────────────────

export function InviteUserModal({ open, onClose, roles, teams }: {
  open: boolean; onClose: () => void; roles: RoleRecord[]; teams: TeamRecord[]
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [teamId, setTeamId] = useState('')
  const mutation = useInviteUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !role) return
    mutation.mutate({ email: email.trim(), role, teamId: teamId || undefined }, {
      onSuccess: () => { setEmail(''); setRole(''); setTeamId(''); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Invite User">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Email Address">
          <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.com" />
        </FormField>
        <FormField label="Role">
          <select className={inputClass} value={role} onChange={e => setRole(e.target.value)}>
            <option value="">Select role…</option>
            {roles.map(r => <option key={r.id} value={r.name.toLowerCase().replace(/ /g, '_')}>{r.name}</option>)}
          </select>
        </FormField>
        <FormField label="Team (optional)">
          <select className={inputClass} value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">No team</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </FormField>
        <button type="submit" disabled={mutation.isPending || !email.trim() || !role}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Sending invite…' : 'Send Invite'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Create Team Modal ──────────────────────────────────────────

export function CreateTeamModal({ open, onClose, users }: {
  open: boolean; onClose: () => void; users: UserRecord[]
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [leadId, setLeadId] = useState('')
  const mutation = useCreateTeam()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim(), description: description.trim(), leadId }, {
      onSuccess: () => { setName(''); setDescription(''); setLeadId(''); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Create Team">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Team Name">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., SOC Tier 3" />
        </FormField>
        <FormField label="Description">
          <input className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Team purpose…" />
        </FormField>
        <FormField label="Team Lead">
          <select className={inputClass} value={leadId} onChange={e => setLeadId(e.target.value)}>
            <option value="">Select lead…</option>
            {users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </FormField>
        <button type="submit" disabled={mutation.isPending || !name.trim()}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Creating…' : 'Create Team'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Create Role Modal ──────────────────────────────────────────

const PERMISSION_GROUPS = [
  { group: 'IOCs', perms: ['ioc.read', 'ioc.write', 'ioc.delete', 'ioc.export'] },
  { group: 'Alerts', perms: ['alert.read', 'alert.triage', 'alert.assign', 'alert.close'] },
  { group: 'Hunting', perms: ['hunt.read', 'hunt.create', 'hunt.execute', 'hunt.manage'] },
  { group: 'Integration', perms: ['integration.read', 'integration.write', 'integration.delete'] },
  { group: 'Users', perms: ['user.read', 'user.invite', 'user.manage', 'user.admin'] },
]

export function CreateRoleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const mutation = useCreateRole()

  const togglePerm = (p: string) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || permissions.length === 0) return
    mutation.mutate({ name: name.trim(), description: description.trim(), permissions }, {
      onSuccess: () => { setName(''); setDescription(''); setPermissions([]); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Create Custom Role">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Role Name">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Integration Admin" />
        </FormField>
        <FormField label="Description">
          <input className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Role purpose…" />
        </FormField>
        <FormField label="Permissions">
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {PERMISSION_GROUPS.map(({ group, perms }) => (
              <div key={group}>
                <p className="text-[10px] text-text-muted font-medium mb-1">{group}</p>
                <div className="flex flex-wrap gap-1">
                  {perms.map(p => (
                    <button key={p} type="button" onClick={() => togglePerm(p)}
                      className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                        permissions.includes(p) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-bg-elevated text-text-muted border-border hover:border-accent/20')}>
                      {p.split('.')[1]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FormField>
        <div className="text-[10px] text-text-muted">{permissions.length} permissions selected</div>
        <button type="submit" disabled={mutation.isPending || !name.trim() || permissions.length === 0}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Creating…' : 'Create Role'}
        </button>
      </form>
    </ModalShell>
  )
}

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

const ROLE_COLORS: Record<string, string> = {
  admin: 'text-sev-critical bg-sev-critical/10',
  soc_manager: 'text-sev-high bg-sev-high/10',
  soc_analyst: 'text-accent bg-accent/10',
  threat_hunter: 'text-purple-400 bg-purple-400/10',
  viewer: 'text-text-muted bg-bg-elevated',
}

export function UserDetailPanel({ user, onClose, isDemo }: {
  user: UserRecord; onClose: () => void; isDemo: boolean
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
              <button disabled={isDemo}
                className="w-full py-2 text-xs font-medium bg-sev-critical/10 text-sev-critical border border-sev-critical/20 rounded hover:bg-sev-critical/20 transition-colors disabled:opacity-50">
                Lock Account
              </button>
            )}
            {user.status === 'locked' && (
              <button disabled={isDemo}
                className="w-full py-2 text-xs font-medium bg-sev-low/10 text-sev-low border border-sev-low/20 rounded hover:bg-sev-low/20 transition-colors disabled:opacity-50">
                Unlock Account
              </button>
            )}
            {!user.mfaEnabled && (
              <button disabled={isDemo}
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
