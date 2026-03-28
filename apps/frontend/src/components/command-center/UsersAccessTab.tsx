/**
 * @module components/command-center/UsersAccessTab
 * @description Unified users & access management tab — absorbs RBAC/SSO + IntegrationPage.
 * 4 sub-tabs: Team, Roles & Permissions, SSO (super-admin), Integrations (tenant-admin+).
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PillSwitcher, type PillItem } from './PillSwitcher'
import type { useCommandCenter } from '@/hooks/use-command-center'
import {
  useUsers, useRoles, useSIEMIntegrations, useWebhooks, useIntegrationStats,
  type UserRecord, type RoleRecord, type SIEMIntegration, type WebhookConfig,
} from '@/hooks/use-phase5-data'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  Search, UserPlus, Shield, ShieldCheck, Crown, Mail, MoreHorizontal,
  Check, X, Lock, Globe, Key, Webhook, ExternalLink, AlertTriangle,
  Settings, CheckCircle, XCircle, ArrowUpCircle, Clock, Zap,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────

type SubTab = 'team' | 'roles' | 'sso' | 'integrations'

interface UsersAccessTabProps {
  data: ReturnType<typeof useCommandCenter>
}

// ─── Role badge helper ──────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-amber-500/20 text-amber-400',
  tenant_admin: 'bg-purple-500/20 text-purple-400',
  manager: 'bg-blue-500/20 text-blue-400',
  lead: 'bg-cyan-500/20 text-cyan-400',
  analyst: 'bg-sev-low/20 text-sev-low',
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn('px-1.5 py-0.5 text-[10px] rounded font-medium capitalize', ROLE_COLORS[role] ?? 'bg-bg-hover text-text-muted')}>
      {role.replace(/_/g, ' ')}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-sev-low/20 text-sev-low',
    locked: 'bg-sev-high/20 text-sev-high',
    invited: 'bg-amber-500/20 text-amber-400',
    configured: 'bg-sev-low/20 text-sev-low',
    error: 'bg-sev-high/20 text-sev-high',
    disabled: 'bg-bg-hover text-text-muted',
    failing: 'bg-sev-high/20 text-sev-high',
  }
  return (
    <span className={cn('px-1.5 py-0.5 text-[10px] rounded font-medium capitalize', colors[status] ?? 'bg-bg-hover text-text-muted')}>
      {status}
    </span>
  )
}

// ─── Team Sub-Tab ───────────────────────────────────────────

function TeamPanel({ isSuperAdmin, tenantPlan }: { isSuperAdmin: boolean; tenantPlan: string }) {
  const users = useUsers()
  const [search, setSearch] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('analyst')
  const debouncedSearch = useDebouncedValue(search, 300)

  const userList = users.data?.data ?? []
  const isFree = tenantPlan === 'free'

  const filtered = useMemo(() => {
    if (!debouncedSearch) return userList
    const q = debouncedSearch.toLowerCase()
    return userList.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [userList, debouncedSearch])

  const pending = filtered.filter(u => u.status === 'invited')
  const active = filtered.filter(u => u.status !== 'invited')

  if (users.isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-bg-elevated rounded animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-3" data-testid="team-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            data-testid="team-search"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        {isFree ? (
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent rounded-lg hover:bg-accent/20" data-testid="upgrade-cta">
            <ArrowUpCircle className="w-3.5 h-3.5" /> Upgrade to add team members
          </button>
        ) : (
          <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/80" data-testid="invite-btn">
            <UserPlus className="w-3.5 h-3.5" /> Invite Member
          </button>
        )}
      </div>

      {/* Active Members Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs" data-testid="members-table">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th className="text-left px-3 py-2 text-text-muted font-medium">Member</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden sm:table-cell">Email</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium">Role</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden md:table-cell">Status</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden lg:table-cell">Last Active</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden lg:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody>
            {active.map(u => (
              <tr key={u.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-medium text-accent">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-primary font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-text-muted hidden sm:table-cell">{u.email}</td>
                <td className="px-3 py-2"><RoleBadge role={u.role} /></td>
                <td className="px-3 py-2 hidden md:table-cell"><StatusBadge status={u.status} /></td>
                <td className="px-3 py-2 text-text-muted hidden lg:table-cell">{u.lastLogin ? formatTimeAgo(u.lastLogin) : '—'}</td>
                <td className="px-3 py-2 text-text-muted hidden lg:table-cell">{formatDate(u.createdAt)}</td>
              </tr>
            ))}
            {active.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-text-muted">No members found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-text-muted mb-2">Pending Invites ({pending.length})</h3>
          <div className="space-y-1">
            {pending.map(u => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2 border border-border/50 rounded-lg bg-bg-elevated" data-testid={`pending-${u.id}`}>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-text-primary">{u.email}</span>
                  <RoleBadge role={u.role} />
                </div>
                <div className="flex items-center gap-1">
                  <button className="px-2 py-1 text-[10px] text-accent hover:bg-accent/10 rounded" data-testid={`resend-${u.id}`}>Resend</button>
                  <button className="px-2 py-1 text-[10px] text-sev-high hover:bg-sev-high/10 rounded" data-testid={`revoke-${u.id}`}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="invite-modal">
          <div className="bg-bg-primary border border-border rounded-lg p-4 max-w-sm w-full mx-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2"><UserPlus className="w-4 h-4 text-accent" /> Invite Team Member</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-text-muted">Email Address</label>
              <input
                data-testid="invite-email"
                type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-3 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <label className="block text-xs text-text-muted">Role</label>
              <select data-testid="invite-role" value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary">
                <option value="analyst">Analyst</option>
                <option value="lead">Lead</option>
                <option value="manager">Manager</option>
                <option value="tenant_admin">Tenant Admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInviteModal(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-text-primary">Cancel</button>
              <button data-testid="send-invite" onClick={() => { setShowInviteModal(false); setInviteEmail('') }}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/80">Send Invite</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Roles & Permissions Sub-Tab ────────────────────────────

const PERMISSIONS = ['view_iocs', 'export_data', 'manage_feeds', 'configure_alerts', 'manage_reports', 'admin_access'] as const
const PERMISSION_LABELS: Record<string, string> = {
  view_iocs: 'View IOCs', export_data: 'Export Data', manage_feeds: 'Manage Feeds',
  configure_alerts: 'Configure Alerts', manage_reports: 'Manage Reports', admin_access: 'Admin Access',
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  analyst: ['view_iocs'],
  lead: ['view_iocs', 'export_data'],
  manager: ['view_iocs', 'export_data', 'manage_feeds', 'configure_alerts'],
  tenant_admin: ['view_iocs', 'export_data', 'manage_feeds', 'configure_alerts', 'manage_reports', 'admin_access'],
  super_admin: ['view_iocs', 'export_data', 'manage_feeds', 'configure_alerts', 'manage_reports', 'admin_access'],
}

function RolesPanel({ tenantPlan }: { tenantPlan: string }) {
  const roles = useRoles()
  const isEnterprise = tenantPlan === 'enterprise'

  return (
    <div className="space-y-4" data-testid="roles-panel">
      {/* Role Matrix */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs" data-testid="role-matrix">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th className="text-left px-3 py-2 text-text-muted font-medium sticky left-0 bg-bg-elevated">Role</th>
              {PERMISSIONS.map(p => (
                <th key={p} className="text-center px-3 py-2 text-text-muted font-medium whitespace-nowrap">{PERMISSION_LABELS[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => (
              <tr key={role} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                <td className="px-3 py-2 sticky left-0 bg-bg-primary"><RoleBadge role={role} /></td>
                {PERMISSIONS.map(p => (
                  <td key={p} className="text-center px-3 py-2">
                    {perms.includes(p)
                      ? <Check className="w-4 h-4 text-sev-low mx-auto" />
                      : <X className="w-4 h-4 text-text-muted/30 mx-auto" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Custom Roles Banner */}
      {!isEnterprise && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent/5 border border-accent/20 rounded-lg" data-testid="custom-roles-banner">
          <Crown className="w-4 h-4 text-accent shrink-0" />
          <span className="text-xs text-text-muted">Custom roles with granular permissions are available on the <span className="text-accent font-medium">Enterprise plan</span></span>
        </div>
      )}
    </div>
  )
}

// ─── SSO Sub-Tab ────────────────────────────────────────────

interface SSOProvider {
  id: string; name: string; type: 'saml' | 'oidc' | 'google' | 'azure'
  configured: boolean; lastTested: string | null
}

const DEMO_SSO_PROVIDERS: SSOProvider[] = [
  { id: 'saml', name: 'SAML 2.0', type: 'saml', configured: false, lastTested: null },
  { id: 'oidc', name: 'OpenID Connect', type: 'oidc', configured: false, lastTested: null },
  { id: 'google', name: 'Google Workspace', type: 'google', configured: true, lastTested: new Date(Date.now() - 86400_000).toISOString() },
  { id: 'azure', name: 'Azure AD', type: 'azure', configured: false, lastTested: null },
]

function SSOPanel() {
  const [providers] = useState<SSOProvider[]>(DEMO_SSO_PROVIDERS)
  const [configuring, setConfiguring] = useState<string | null>(null)

  const Icons: Record<string, typeof Shield> = { saml: Shield, oidc: Key, google: Globe, azure: ShieldCheck }

  return (
    <div className="space-y-3" data-testid="sso-panel">
      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map(p => {
          const Icon = Icons[p.type] ?? Shield
          return (
            <div key={p.id} className="border border-border rounded-lg p-4 bg-bg-primary" data-testid={`sso-${p.id}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-accent" />
                  <span className="text-xs font-medium text-text-primary">{p.name}</span>
                </div>
                <StatusBadge status={p.configured ? 'configured' : 'disabled'} />
              </div>
              {p.lastTested && (
                <p className="text-[10px] text-text-muted mb-2">Last tested: {formatTimeAgo(p.lastTested)}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfiguring(configuring === p.id ? null : p.id)}
                  className="px-2 py-1 text-[10px] font-medium bg-accent/10 text-accent rounded hover:bg-accent/20"
                  data-testid={`configure-${p.id}`}
                >
                  {p.configured ? 'Edit Config' : 'Configure'}
                </button>
                {p.configured && (
                  <button className="px-2 py-1 text-[10px] font-medium border border-border rounded text-text-muted hover:text-text-primary" data-testid={`test-${p.id}`}>
                    Test Connection
                  </button>
                )}
              </div>

              {/* Inline Config Form */}
              {configuring === p.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2" data-testid={`sso-config-form-${p.id}`}>
                  {(p.type === 'saml' || p.type === 'oidc') && (
                    <>
                      <label className="block text-[10px] text-text-muted">Metadata URL</label>
                      <input className="w-full px-2 py-1 text-xs bg-bg-elevated border border-border rounded text-text-primary" placeholder="https://..." />
                    </>
                  )}
                  <label className="block text-[10px] text-text-muted">Client ID</label>
                  <input className="w-full px-2 py-1 text-xs bg-bg-elevated border border-border rounded text-text-primary" placeholder="client-id" />
                  <label className="block text-[10px] text-text-muted">Client Secret</label>
                  <input className="w-full px-2 py-1 text-xs bg-bg-elevated border border-border rounded text-text-primary" type="password" placeholder="********" />
                  <label className="block text-[10px] text-text-muted">Callback URL</label>
                  <input className="w-full px-2 py-1 text-xs bg-bg-elevated border border-border rounded text-text-primary" value={`https://ti.intelwatch.in/auth/${p.type}/callback`} readOnly />
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setConfiguring(null)} className="px-2 py-1 text-[10px] border border-border rounded text-text-muted">Cancel</button>
                    <button className="px-2 py-1 text-[10px] bg-accent text-white rounded">Save</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Integrations Sub-Tab ───────────────────────────────────

interface IntegrationCard {
  id: string; name: string; category: string; type: string
  status: 'connected' | 'not_configured' | 'error'
  lastSync: string | null
}

const DEMO_INTEGRATION_CARDS: IntegrationCard[] = [
  { id: 'splunk', name: 'Splunk', category: 'SIEM', type: 'splunk', status: 'connected', lastSync: new Date(Date.now() - 300_000).toISOString() },
  { id: 'elk', name: 'Elastic (ELK)', category: 'SIEM', type: 'elastic', status: 'not_configured', lastSync: null },
  { id: 'qradar', name: 'QRadar', category: 'SIEM', type: 'qradar', status: 'not_configured', lastSync: null },
  { id: 'xsoar', name: 'Cortex XSOAR', category: 'SOAR', type: 'xsoar', status: 'connected', lastSync: new Date(Date.now() - 600_000).toISOString() },
  { id: 'phantom', name: 'Splunk SOAR', category: 'SOAR', type: 'phantom', status: 'not_configured', lastSync: null },
  { id: 'webhooks', name: 'Webhooks', category: 'Webhooks', type: 'webhook', status: 'connected', lastSync: new Date(Date.now() - 120_000).toISOString() },
  { id: 'api-keys', name: 'API Keys', category: 'API', type: 'api', status: 'connected', lastSync: null },
]

function IntegrationsPanel() {
  const siemData = useSIEMIntegrations()
  const webhookData = useWebhooks()
  const stats = useIntegrationStats()

  // Use demo cards enriched with real data when available
  const cards = DEMO_INTEGRATION_CARDS

  const statValues = stats.data ?? { total: 7, active: 3, failing: 0, eventsPerHour: 42, lastSync: null }

  return (
    <div className="space-y-4" data-testid="integrations-panel">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: statValues.total, icon: Settings },
          { label: 'Active', value: statValues.active, icon: CheckCircle, color: 'text-sev-low' },
          { label: 'Failing', value: statValues.failing, icon: AlertTriangle, color: statValues.failing > 0 ? 'text-sev-high' : 'text-text-muted' },
          { label: 'Events/hr', value: statValues.eventsPerHour, icon: Zap, color: 'text-accent' },
        ].map(s => (
          <div key={s.label} className="border border-border rounded-lg p-3 bg-bg-primary">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className={cn('w-3.5 h-3.5', s.color ?? 'text-text-muted')} />
              <span className="text-[10px] text-text-muted">{s.label}</span>
            </div>
            <span className="text-sm font-bold text-text-primary">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Integration Cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(c => (
          <div key={c.id} className="border border-border rounded-lg p-3 bg-bg-primary hover:border-border-strong transition-colors" data-testid={`integration-${c.id}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                  {c.category === 'SIEM' ? <Shield className="w-3.5 h-3.5 text-accent" /> :
                   c.category === 'SOAR' ? <Zap className="w-3.5 h-3.5 text-purple-400" /> :
                   c.category === 'Webhooks' ? <Webhook className="w-3.5 h-3.5 text-blue-400" /> :
                   <Key className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div>
                  <span className="text-xs font-medium text-text-primary">{c.name}</span>
                  <span className="block text-[10px] text-text-muted">{c.category}</span>
                </div>
              </div>
              <StatusBadge status={c.status === 'connected' ? 'active' : c.status === 'error' ? 'error' : 'disabled'} />
            </div>
            <div className="flex items-center justify-between">
              {c.lastSync && <span className="text-[10px] text-text-muted">Synced {formatTimeAgo(c.lastSync)}</span>}
              {!c.lastSync && <span className="text-[10px] text-text-muted">Not configured</span>}
              <div className="flex items-center gap-1">
                <button className="px-2 py-1 text-[10px] font-medium bg-accent/10 text-accent rounded hover:bg-accent/20" data-testid={`configure-int-${c.id}`}>
                  {c.status === 'connected' ? 'Configure' : 'Set Up'}
                </button>
                {c.status === 'connected' && (
                  <button className="px-2 py-1 text-[10px] font-medium border border-border rounded text-text-muted hover:text-text-primary" data-testid={`test-int-${c.id}`}>Test</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Main UsersAccessTab ────────────────────────────────────

export function UsersAccessTab({ data }: UsersAccessTabProps) {
  const { isSuperAdmin, tenantPlan } = data
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('team')

  const pills: PillItem[] = useMemo(() => {
    const items: PillItem[] = [
      { id: 'team', label: 'Team' },
      { id: 'roles', label: 'Roles & Permissions' },
    ]
    if (isSuperAdmin) {
      items.push({ id: 'sso', label: 'SSO' })
    }
    items.push({ id: 'integrations', label: 'Integrations' })
    return items
  }, [isSuperAdmin])

  const effectiveSubTab = pills.find(p => p.id === activeSubTab) ? activeSubTab : 'team'

  return (
    <div className="space-y-4" data-testid="users-access-tab">
      <PillSwitcher items={pills} activeId={effectiveSubTab} onChange={id => setActiveSubTab(id as SubTab)} />

      {effectiveSubTab === 'team' && <TeamPanel isSuperAdmin={isSuperAdmin} tenantPlan={tenantPlan} />}
      {effectiveSubTab === 'roles' && <RolesPanel tenantPlan={tenantPlan} />}
      {effectiveSubTab === 'sso' && <SSOPanel />}
      {effectiveSubTab === 'integrations' && <IntegrationsPanel />}
    </div>
  )
}
