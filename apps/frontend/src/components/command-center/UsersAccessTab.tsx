/**
 * @module components/command-center/UsersAccessTab
 * @description Unified users & access management tab — absorbs RBAC/SSO + IntegrationPage.
 * 4 sub-tabs: Team, Roles & Permissions, SSO (super-admin), Integrations (tenant-admin+).
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PillSwitcher, type PillItem } from './PillSwitcher'
import type { useCommandCenter } from '@/hooks/use-command-center'
import { useUsers, useIntegrationStats } from '@/hooks/use-phase5-data'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { QueryStateView } from '@/components/ui/QueryStateView'
import {
  Search, Mail,
  Check, X, AlertTriangle,
  Settings, CheckCircle, ArrowUpCircle, Zap,
} from 'lucide-react'
import { SecurityPanel } from '@/components/security/SecurityPanel'
import { AccessReviewPanel } from './AccessReviewPanel'
import { SsoConfigPanel, SsoStatusBadge } from './SsoConfigPanel'
import { useSsoConfig } from '@/hooks/use-sso'
import { TaxiiFeedCard } from './integrations/TaxiiFeedCard'
import { ConnectionList } from './integrations/ConnectionList'
import { AddConnectionWizard } from './integrations/AddConnectionWizard'
import type { Integration } from '@/hooks/use-integrations'

// ─── Types ──────────────────────────────────────────────────

type SubTab = 'team' | 'roles' | 'sso' | 'integrations' | 'security' | 'access-reviews'

interface UsersAccessTabProps {
  data: ReturnType<typeof useCommandCenter>
}

// ─── Role badge helper ──────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-amber-500/20 text-amber-400',
  tenant_admin: 'bg-purple-500/20 text-purple-400',
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

function TeamPanel({ isSuperAdmin: _isSuperAdmin, tenantPlan }: { isSuperAdmin: boolean; tenantPlan: string }) {
  const users = useUsers()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const isFree = tenantPlan === 'free'

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
        ) : null /* ponytail: no DB-backed invite route yet (STEP_05) — add the button with it */}
      </div>

      <QueryStateView query={users} resource="users">
        {userData => {
          const userList = userData.data
          const filtered = debouncedSearch
            ? userList.filter(u =>
                u.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                u.email.toLowerCase().includes(debouncedSearch.toLowerCase()))
            : userList
          const pending = filtered.filter(u => u.status === 'invited')
          const active = filtered.filter(u => u.status !== 'invited')

          return (
            <>
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
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        }}
      </QueryStateView>
    </div>
  )
}

// ─── Roles & Permissions Sub-Tab ────────────────────────────

// ponytail: static copy of packages/shared-auth/src/permissions.ts ROLE_PERMISSIONS, grouped for display
// (frontend can't import shared-auth). Update both together; roles are a fixed Prisma enum.
type Access = 'full' | 'view' | 'none'
const CAPABILITIES = [
  { key: 'intel', label: 'Threat Intel (IOCs, actors, malware, vulns)' },
  { key: 'ops', label: 'Hunting, Graph & Alerts' },
  { key: 'reports', label: 'Dashboards & Reports' },
  { key: 'feeds', label: 'Feeds' },
  { key: 'admin', label: 'Users, Integrations & Settings' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'platform', label: 'All Tenants (Platform)' },
] as const
type Capability = (typeof CAPABILITIES)[number]['key']

const ROLE_MATRIX: { role: string; access: Record<Capability, Access> }[] = [
  { role: 'analyst', access: { intel: 'full', ops: 'full', reports: 'full', feeds: 'view', admin: 'none', audit: 'none', platform: 'none' } },
  { role: 'tenant_admin', access: { intel: 'full', ops: 'full', reports: 'full', feeds: 'full', admin: 'full', audit: 'view', platform: 'none' } },
  { role: 'super_admin', access: { intel: 'full', ops: 'full', reports: 'full', feeds: 'full', admin: 'full', audit: 'full', platform: 'full' } },
]

function AccessCell({ access }: { access: Access }) {
  if (access === 'full') return <Check className="w-4 h-4 text-sev-low mx-auto" aria-label="Full access" />
  if (access === 'view') return <span className="text-[10px] text-sev-medium">View only</span>
  return <X className="w-4 h-4 text-text-muted/30 mx-auto" aria-label="No access" />
}

function RolesPanel() {
  return (
    <div className="space-y-4" data-testid="roles-panel">
      {/* Role Matrix */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs" data-testid="role-matrix">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th className="text-left px-3 py-2 text-text-muted font-medium sticky left-0 bg-bg-elevated">Role</th>
              {CAPABILITIES.map(c => (
                <th key={c.key} className="text-center px-3 py-2 text-text-muted font-medium whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_MATRIX.map(({ role, access }) => (
              <tr key={role} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                <td className="px-3 py-2 sticky left-0 bg-bg-primary"><RoleBadge role={role} /></td>
                {CAPABILITIES.map(c => (
                  <td key={c.key} className="text-center px-3 py-2"><AccessCell access={access[c.key]} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-text-muted">These are the 3 built-in roles enforced by the platform. Custom roles are not supported.</p>
    </div>
  )
}

// ─── SSO Sub-Tab (replaced with SsoConfigPanel — S18) ──────

// ─── Integrations Sub-Tab ───────────────────────────────────
// Real connectors (S166 Step 15 P1) — see components/command-center/integrations/*.

function IntegrationsPanel({ tenantPlan }: { tenantPlan: string }) {
  const stats = useIntegrationStats()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Integration | null>(null)

  const statValues = stats.data ?? { total: 0, active: 0, failing: 0, eventsPerHour: 0, lastSync: null }

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

      <TaxiiFeedCard />

      <ConnectionList
        tenantPlan={tenantPlan}
        onAdd={() => { setEditTarget(null); setWizardOpen(true) }}
        onEdit={integration => { setEditTarget(integration); setWizardOpen(true) }}
      />

      {wizardOpen && (
        <AddConnectionWizard
          editTarget={editTarget ?? undefined}
          onClose={() => setWizardOpen(false)}
        />
      )}
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
  const { data: ssoConfig } = useSsoConfig()

  const pills: PillItem[] = useMemo(() => {
    const items: PillItem[] = [
      { id: 'team', label: 'Team' },
      { id: 'roles', label: 'Roles & Permissions' },
      { id: 'sso', label: 'SSO' },
      { id: 'integrations', label: 'Integrations' },
      { id: 'security', label: 'Security' },
      { id: 'access-reviews', label: 'Access Reviews' },
    ]
    return items
  }, [])

  const effectiveSubTab = pills.find(p => p.id === activeSubTab) ? activeSubTab : 'team'

  return (
    <div className="space-y-4" data-testid="users-access-tab">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <PillSwitcher items={pills} activeId={effectiveSubTab} onChange={id => setActiveSubTab(id as SubTab)} />
        <SsoStatusBadge config={ssoConfig} />
      </div>

      {effectiveSubTab === 'team' && <TeamPanel isSuperAdmin={isSuperAdmin} tenantPlan={tenantPlan} />}
      {effectiveSubTab === 'roles' && <RolesPanel />}
      {effectiveSubTab === 'sso' && <SsoConfigPanel />}
      {effectiveSubTab === 'integrations' && <IntegrationsPanel tenantPlan={tenantPlan} />}
      {effectiveSubTab === 'security' && <SecurityPanel data={data} />}
      {effectiveSubTab === 'access-reviews' && <AccessReviewPanel isSuperAdmin={isSuperAdmin} />}
    </div>
  )
}
