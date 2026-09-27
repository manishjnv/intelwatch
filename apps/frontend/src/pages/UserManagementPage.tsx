/**
 * @module pages/UserManagementPage
 * @description User Management dashboard — RBAC users, teams, roles,
 * active sessions, and audit log. 5 tabs with tables and detail panels.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useUsers, useTeams, useRoles, useSessions, useAuditLog,
  useUserManagementStats, useRevokeSession, useRevokeAllSessions,
  type UserRecord, type TeamRecord, type RoleRecord,
  type SessionRecord, type AuditLogEntry,
} from '@/hooks/use-phase5-data'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { QueryStateView } from '@/components/ui/QueryStateView'
import {
  Users, UsersRound, ShieldCheck, Monitor, ScrollText,
  Plus, XCircle, Shield,
} from 'lucide-react'
import {
  InviteUserModal, CreateTeamModal, CreateRoleModal,
  UserDetailPanel,
} from '@/components/viz/UserManagementModals'

// ─── Tab type ───────────────────────────────────────────────────

type UserTab = 'users' | 'teams' | 'roles' | 'sessions' | 'audit'

const TABS: { key: UserTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'teams', label: 'Teams', icon: UsersRound },
  { key: 'roles', label: 'Roles', icon: ShieldCheck },
  { key: 'sessions', label: 'Sessions', icon: Monitor },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
]

const STATUS_COLORS: Record<string, string> = {
  active: 'text-sev-low bg-sev-low/10',
  locked: 'text-sev-critical bg-sev-critical/10',
  invited: 'text-accent bg-accent/10',
  expired: 'text-text-muted bg-bg-elevated',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'text-sev-critical bg-sev-critical/10',
  soc_manager: 'text-sev-high bg-sev-high/10',
  soc_analyst: 'text-accent bg-accent/10',
  threat_hunter: 'text-purple-400 bg-purple-400/10',
  viewer: 'text-text-muted bg-bg-elevated',
}

const AUDIT_FILTERS: FilterOption[] = [
  { key: 'action', label: 'Action', options: [
    { value: 'user.login', label: 'Login' }, { value: 'alert.triage', label: 'Alert Triage' },
    { value: 'integration.update', label: 'Integration Update' }, { value: 'hunt.create', label: 'Hunt Create' },
    { value: 'role.assign', label: 'Role Assign' }, { value: 'export.run', label: 'Export Run' },
    { value: 'webhook.test', label: 'Webhook Test' }, { value: 'user.lock', label: 'User Lock' },
  ]},
]

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const hrs = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hrs < 1) return '<1h ago'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// ─── Main Component ─────────────────────────────────────────────

export function UserManagementPage() {
  const [activeTab, setActiveTab] = useState<UserTab>('users')
  const [showModal, setShowModal] = useState<'invite' | 'team' | 'role' | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [auditPage, setAuditPage] = useState(1)
  const [auditFilters, setAuditFilters] = useState<Record<string, string>>({})
  const [auditSearch, setAuditSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('asc') }
  }

  const statsQuery = useUserManagementStats()
  const stats = statsQuery.data
  const usersQuery = useUsers()
  const teamsQuery = useTeams()
  const rolesQuery = useRoles()
  const sessionsQuery = useSessions()
  const auditQuery = useAuditLog({ page: auditPage, ...auditFilters })
  const revokeSession = useRevokeSession()
  const revokeAll = useRevokeAllSessions()

  // ponytail: `action` is already filtered server-side via useAuditLog params.
  // `auditSearch` has no server param, so it stays a client-side filter over whatever page came back.
  const filterBySearch = (items: AuditLogEntry[]) => {
    if (!auditSearch) return items
    const q = auditSearch.toLowerCase()
    return items.filter(a => a.userName.toLowerCase().includes(q) || a.action.toLowerCase().includes(q) || a.resource.toLowerCase().includes(q))
  }

  const userColumns: Column<UserRecord>[] = useMemo(() => [
    { key: 'name', label: 'Name', sortable: true, width: '18%',
      render: (r) => (
        <div className="min-w-0">
          <div className="text-text-primary font-medium text-xs truncate">{r.name}</div>
          <div className="text-[10px] text-text-muted truncate">{r.email}</div>
        </div>
      ) },
    { key: 'role', label: 'Role', width: '12%',
      render: (r) => <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ROLE_COLORS[r.role] ?? 'text-accent bg-accent/10')}>{r.role.replace('_', ' ')}</span> },
    { key: 'team', label: 'Team', width: '12%',
      render: (r) => r.team ? <span className="text-xs text-text-secondary">{r.team}</span> : <span className="text-xs text-text-muted">—</span> },
    { key: 'status', label: 'Status', width: '10%',
      render: (r) => <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[r.status] ?? '')}>{r.status}</span> },
    { key: 'lastLogin', label: 'Last Login', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.lastLogin)}</span> },
    { key: 'mfaEnabled', label: 'MFA', width: '8%',
      render: (r) => r.mfaEnabled
        ? <Shield className="w-3.5 h-3.5 text-sev-low" />
        : <span className="text-[10px] text-text-muted">Off</span> },
  ], [])

  const teamColumns: Column<TeamRecord>[] = useMemo(() => [
    { key: 'name', label: 'Team', sortable: true, width: '22%',
      render: (r) => (
        <div className="min-w-0">
          <div className="text-text-primary font-medium text-xs">{r.name}</div>
          <div className="text-[10px] text-text-muted truncate">{r.description}</div>
        </div>
      ) },
    { key: 'memberCount', label: 'Members', sortable: true, width: '12%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.memberCount}</span> },
    { key: 'lead', label: 'Lead', width: '16%',
      render: (r) => <span className="text-xs text-accent">{r.lead}</span> },
    { key: 'createdAt', label: 'Created', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.createdAt)}</span> },
  ], [])

  const roleColumns: Column<RoleRecord>[] = useMemo(() => [
    { key: 'name', label: 'Role', sortable: true, width: '18%',
      render: (r) => <span className="text-text-primary font-medium text-xs">{r.name}</span> },
    { key: 'permissionCount', label: 'Permissions', sortable: true, width: '12%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.permissionCount}</span> },
    { key: 'userCount', label: 'Users', width: '10%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.userCount}</span> },
    { key: 'isSystem', label: 'Type', width: '10%',
      render: (r) => <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
        r.isSystem ? 'text-text-muted bg-bg-elevated' : 'text-accent bg-accent/10')}>{r.isSystem ? 'System' : 'Custom'}</span> },
    { key: 'description', label: 'Description', width: '30%',
      render: (r) => <span className="text-[10px] text-text-muted truncate block max-w-[260px]">{r.description}</span> },
  ], [])

  const sessionColumns: Column<SessionRecord>[] = useMemo(() => [
    { key: 'userName', label: 'User', width: '18%',
      render: (r) => <span className="text-text-primary font-medium text-xs">{r.userName}</span> },
    { key: 'ip', label: 'IP', width: '14%',
      render: (r) => <span className="text-text-secondary font-mono text-[11px]">{r.ip}</span> },
    { key: 'device', label: 'Device', width: '18%',
      render: (r) => <span className="text-[10px] text-text-muted">{r.device}</span> },
    { key: 'startedAt', label: 'Started', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.startedAt)}</span> },
    { key: 'lastActivity', label: 'Last Activity', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.lastActivity)}</span> },
    { key: 'status', label: 'Status', width: '10%',
      render: (r) => <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[r.status] ?? '')}>{r.status}</span> },
    { key: 'actions', label: '', width: '8%',
      render: (r) => r.status === 'active' ? (
        <button onClick={(e) => { e.stopPropagation(); revokeSession.mutate(r.id) }}
          disabled={revokeSession.isPending} title="Revoke session"
          className="text-[10px] px-2 py-1 rounded bg-sev-critical/10 text-sev-critical hover:bg-sev-critical/20 transition-colors disabled:opacity-50">
          Revoke
        </button>
      ) : null },
  ], [revokeSession])

  const auditColumns: Column<AuditLogEntry>[] = useMemo(() => [
    { key: 'timestamp', label: 'Time', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.timestamp)}</span> },
    { key: 'userName', label: 'User', width: '14%',
      render: (r) => <span className="text-text-primary text-xs">{r.userName}</span> },
    { key: 'action', label: 'Action', width: '14%',
      render: (r) => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-accent bg-accent/10">{r.action}</span> },
    { key: 'resource', label: 'Resource', width: '14%',
      render: (r) => <span className="text-text-secondary font-mono text-[11px]">{r.resource}</span> },
    { key: 'ip', label: 'IP', width: '12%',
      render: (r) => <span className="text-text-muted font-mono text-[11px]">{r.ip}</span> },
    { key: 'details', label: 'Details', width: '22%',
      render: (r) => <span className="text-[10px] text-text-muted truncate block max-w-[200px]">{r.details}</span> },
  ], [])

  const addButtonLabel = activeTab === 'users' ? 'Invite User' : activeTab === 'teams' ? 'Create Team' : activeTab === 'roles' ? 'Create Role' : null

  return (
    <div className="flex flex-col h-full">
      <PageStatsBar>
        <CompactStat label="Total Users" value={stats?.totalUsers?.toString() ?? '—'} />
        <CompactStat label="Active Sessions" value={stats?.activeSessions?.toString() ?? '—'} color="text-sev-low" />
        <CompactStat label="Teams" value={stats?.teams?.toString() ?? '—'} />
        <CompactStat label="Roles" value={stats?.roles?.toString() ?? '—'} />
        <CompactStat label="MFA Enabled" value={stats?.mfaPercent != null ? `${stats.mfaPercent}%` : '—'} color={
          stats?.mfaPercent == null ? undefined : stats.mfaPercent >= 80 ? 'text-sev-low' : stats.mfaPercent >= 50 ? 'text-sev-medium' : 'text-sev-critical'
        } />
      </PageStatsBar>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === key ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary')}>
              <Icon className="w-3 h-3" /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}

          {addButtonLabel && (
            <button onClick={() => setShowModal(activeTab === 'users' ? 'invite' : activeTab === 'teams' ? 'team' : 'role')}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors">
              <Plus className="w-3 h-3" />{addButtonLabel}
            </button>
          )}

          {activeTab === 'sessions' && (
            <button onClick={() => revokeAll.mutate()} disabled={revokeAll.isPending}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sev-critical/10 text-sev-critical border border-sev-critical/20 rounded-md hover:bg-sev-critical/20 transition-colors disabled:opacity-50">
              <XCircle className="w-3 h-3" />Revoke All
            </button>
          )}
        </div>

        {/* Audit Log filter bar */}
        {activeTab === 'audit' && (
          <FilterBar searchValue={auditSearch} onSearchChange={(v) => { setAuditSearch(v); setAuditPage(1) }}
            searchPlaceholder="Search by user, action, resource…" filters={AUDIT_FILTERS}
            filterValues={auditFilters} onFilterChange={(k, v) => { setAuditFilters(f => ({ ...f, [k]: v })); setAuditPage(1) }} />
        )}

        {/* Data Tables — each wrapped in its own QueryStateView so one failing endpoint doesn't blank the page */}
        {activeTab === 'users' && (
          <QueryStateView query={usersQuery} resource="users">
            {userData => (
              <DataTable columns={userColumns} data={userData.data} loading={false} rowKey={(r) => r.id}
                sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}
                density="compact" onRowClick={(r) => setSelectedUser(r)} emptyMessage="No users found." />
            )}
          </QueryStateView>
        )}
        {activeTab === 'teams' && (
          <QueryStateView query={teamsQuery} resource="teams">
            {teamData => (
              <DataTable columns={teamColumns} data={teamData.data} loading={false} rowKey={(r) => r.id}
                sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}
                density="compact" emptyMessage="No teams created yet." />
            )}
          </QueryStateView>
        )}
        {activeTab === 'roles' && (
          <QueryStateView query={rolesQuery} resource="roles">
            {roleData => (
              <DataTable columns={roleColumns} data={roleData.data} loading={false} rowKey={(r) => r.id}
                sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}
                density="compact" emptyMessage="No roles configured." />
            )}
          </QueryStateView>
        )}
        {activeTab === 'sessions' && (
          <QueryStateView query={sessionsQuery} resource="user sessions">
            {sessionData => (
              <DataTable columns={sessionColumns} data={sessionData.data} loading={false} rowKey={(r) => r.id}
                density="compact" emptyMessage="No active sessions." />
            )}
          </QueryStateView>
        )}
        {activeTab === 'audit' && (
          <QueryStateView query={auditQuery} resource="audit log">
            {auditData => (
              <>
                <DataTable columns={auditColumns} data={filterBySearch(auditData.data)} loading={false} rowKey={(r) => r.id}
                  density="compact" emptyMessage="No audit log entries." />
                <Pagination page={auditPage} limit={50} total={auditData.total} onPageChange={setAuditPage} />
              </>
            )}
          </QueryStateView>
        )}
      </div>

      {/* Modals */}
      <InviteUserModal open={showModal === 'invite'} onClose={() => setShowModal(null)} roles={rolesQuery.data?.data ?? []} teams={teamsQuery.data?.data ?? []} />
      <CreateTeamModal open={showModal === 'team'} onClose={() => setShowModal(null)} users={usersQuery.data?.data ?? []} />
      <CreateRoleModal open={showModal === 'role'} onClose={() => setShowModal(null)} />

      {/* User Detail Panel */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedUser(null)} />
          <UserDetailPanel user={selectedUser} onClose={() => setSelectedUser(null)} />
        </>
      )}
    </div>
  )
}
