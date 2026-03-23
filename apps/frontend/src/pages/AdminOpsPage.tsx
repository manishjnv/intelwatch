/**
 * @module pages/AdminOpsPage
 * @description Admin Operations dashboard — system health monitoring for all
 * 18 services, maintenance windows calendar/list, tenant management table
 * with suspend/reinstate/plan-change actions, and audit log with CSV export.
 * Connects to admin-service API (port 3022 via nginx /api/v1/admin/*).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useSystemHealth, useMaintenanceWindows, useAdminTenants,
  useAdminAuditLog, useAdminStats,
  useActivateMaintenance, useDeactivateMaintenance,
  useSuspendTenant, useReinstateTenant, useChangeTenantPlan,
  type ServiceHealth, type MaintenanceWindow, type TenantRecord, type AdminAuditEntry,
} from '@/hooks/use-phase6-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  Activity, Calendar, Users, FileText, Download,
  CheckCircle2, AlertTriangle, XCircle, Clock,
  Play, Square, ChevronDown,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1_000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// ─── Status indicators ───────────────────────────────────────────

type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

const STATUS_CONFIG: Record<ServiceStatus, { label: string; dot: string; text: string; Icon: React.FC<{ className?: string }> }> = {
  healthy:  { label: 'Healthy',  dot: 'bg-sev-low',      text: 'text-sev-low',      Icon: CheckCircle2 },
  degraded: { label: 'Degraded', dot: 'bg-sev-high',     text: 'text-sev-high',     Icon: AlertTriangle },
  down:     { label: 'Down',     dot: 'bg-sev-critical',  text: 'text-sev-critical', Icon: XCircle },
  unknown:  { label: 'Unknown',  dot: 'bg-text-muted',   text: 'text-text-muted',   Icon: Clock },
}


const MAINT_STATUS_COLORS: Record<string, string> = {
  scheduled: 'text-accent bg-accent/10',
  active:    'text-sev-high bg-sev-high/10',
  completed: 'text-sev-low bg-sev-low/10',
  cancelled: 'text-text-muted bg-bg-elevated',
}

const TENANT_STATUS_COLORS: Record<string, string> = {
  active:    'text-sev-low bg-sev-low/10',
  suspended: 'text-sev-critical bg-sev-critical/10',
  trial:     'text-accent bg-accent/10',
}

const PLAN_COLORS: Record<string, string> = {
  Free:       'text-text-muted bg-bg-elevated',
  Starter:    'text-sev-low bg-sev-low/10',
  Pro:        'text-accent bg-accent/10',
  Enterprise: 'text-violet-400 bg-violet-400/10',
}

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', className)}>
      {label}
    </span>
  )
}

// ─── System Health Grid ──────────────────────────────────────────

function ServiceCard({ svc }: { svc: ServiceHealth }) {
  const status = svc.status as ServiceStatus
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.Icon

  return (
    <div className={cn(
      'bg-bg-elevated border rounded-lg p-3 transition-all duration-200',
      status === 'healthy'  ? 'border-border-subtle' :
      status === 'degraded' ? 'border-sev-high/40 bg-sev-high/5' :
      status === 'down'     ? 'border-sev-critical/50 bg-sev-critical/5' :
                              'border-border-subtle',
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-text-primary truncate pr-1">{svc.name}</span>
        <Icon className={cn('w-3.5 h-3.5 shrink-0', cfg.text)} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-text-muted mb-1.5">
        <span>:{svc.port}</span>
        <span>v{svc.version}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div>
          <span className="text-text-muted">Uptime </span>
          <span className={cn('font-medium',
            svc.uptime >= 99.9 ? 'text-sev-low' : svc.uptime >= 99 ? 'text-sev-medium' : 'text-sev-critical',
          )}>
            {svc.uptime.toFixed(2)}%
          </span>
        </div>
        <div>
          <span className="text-text-muted">Latency </span>
          <span className={cn('font-medium',
            svc.responseMs < 50 ? 'text-sev-low' : svc.responseMs < 200 ? 'text-sev-medium' : 'text-sev-high',
          )}>
            {svc.responseMs}ms
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Maintenance Window Row ──────────────────────────────────────

function MaintenanceRow({ mw, onActivate, onDeactivate }: {
  mw: MaintenanceWindow
  onActivate: (id: string) => void
  onDeactivate: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-primary/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Badge label={mw.status} className={MAINT_STATUS_COLORS[mw.status] ?? ''} />
        <span className="flex-1 text-xs font-medium text-text-primary truncate">{mw.title}</span>
        <span className="text-[11px] text-text-muted whitespace-nowrap hidden sm:block">{fmtDate(mw.startsAt)}</span>
        <div className="flex items-center gap-2">
          {mw.status === 'scheduled' && (
            <button
              onClick={e => { e.stopPropagation(); onActivate(mw.id) }}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-sev-high/10 text-sev-high hover:bg-sev-high/20 transition-colors"
              title="Activate now"
            >
              <Play className="w-3 h-3" />
              Activate
            </button>
          )}
          {mw.status === 'active' && (
            <button
              onClick={e => { e.stopPropagation(); onDeactivate(mw.id) }}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-sev-low/10 text-sev-low hover:bg-sev-low/20 transition-colors"
              title="End maintenance"
            >
              <Square className="w-3 h-3" />
              End
            </button>
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted transition-transform', expanded && 'rotate-180')} />
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border-subtle px-4 py-3 bg-bg-primary/30 space-y-2 text-[11px]">
          <p className="text-text-secondary">{mw.description}</p>
          <div className="flex flex-wrap gap-4 text-text-muted">
            <span><strong className="text-text-primary">Starts:</strong> {fmtDate(mw.startsAt)}</span>
            <span><strong className="text-text-primary">Ends:</strong> {fmtDate(mw.endsAt)}</span>
            <span><strong className="text-text-primary">By:</strong> {mw.createdBy}</span>
          </div>
          {mw.affectedServices.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-text-muted mr-1">Affects:</span>
              {mw.affectedServices.map(s => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-sev-high/10 text-sev-high">{s}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tenant Action Dropdown ──────────────────────────────────────

function TenantRow({ tenant, onSuspend, onReinstate, onChangePlan }: {
  tenant: TenantRecord
  onSuspend: (id: string) => void
  onReinstate: (id: string) => void
  onChangePlan: (id: string, plan: string) => void
}) {
  const [open, setOpen] = useState(false)
  const seatDisplay = tenant.seats < 0 ? `${tenant.usedSeats} / ∞` : `${tenant.usedSeats} / ${tenant.seats}`

  return (
    <tr className="border-b border-border-subtle/50 hover:bg-bg-primary/50 transition-colors">
      <td className="px-4 py-3">
        <div className="text-xs font-medium text-text-primary">{tenant.name}</div>
        <div className="text-[10px] text-text-muted">{tenant.domain}</div>
      </td>
      <td className="px-4 py-3">
        <Badge label={tenant.plan} className={PLAN_COLORS[tenant.plan] ?? ''} />
      </td>
      <td className="px-4 py-3">
        <Badge
          label={tenant.status}
          className={cn('capitalize', TENANT_STATUS_COLORS[tenant.status] ?? '')}
        />
      </td>
      <td className="px-4 py-3 text-xs text-text-secondary">{seatDisplay}</td>
      <td className="px-4 py-3 text-xs text-text-secondary">{tenant.iocCount.toLocaleString()}</td>
      <td className="px-4 py-3 text-[11px] text-text-muted">{timeAgo(tenant.lastActiveAt)}</td>
      <td className="px-4 py-3 relative">
        <button
          onClick={() => setOpen(!open)}
          className="text-xs px-2 py-1 rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors flex items-center gap-1"
        >
          Actions <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="absolute right-4 top-10 z-10 bg-bg-elevated border border-border-subtle rounded-lg shadow-lg min-w-[160px] py-1" onMouseLeave={() => setOpen(false)}>
            {tenant.status !== 'suspended' ? (
              <button
                onClick={() => { onSuspend(tenant.id); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-[11px] text-sev-critical hover:bg-sev-critical/10 transition-colors"
              >
                Suspend tenant
              </button>
            ) : (
              <button
                onClick={() => { onReinstate(tenant.id); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-[11px] text-sev-low hover:bg-sev-low/10 transition-colors"
              >
                Reinstate tenant
              </button>
            )}
            {(['Free', 'Starter', 'Pro', 'Enterprise'] as const).filter(p => p !== tenant.plan).map(p => (
              <button
                key={p}
                onClick={() => { onChangePlan(tenant.id, p); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-[11px] text-text-secondary hover:bg-bg-primary transition-colors"
              >
                Change to {p}
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Audit Log ───────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  'maintenance.activate': 'text-sev-high',
  'maintenance.complete': 'text-sev-low',
  'maintenance.create':   'text-accent',
  'tenant.suspend':       'text-sev-critical',
  'tenant.reinstate':     'text-sev-low',
  'tenant.update_plan':   'text-accent',
  'tenant.create':        'text-sev-low',
  'backup.trigger':       'text-text-muted',
  'alert_rule.update':    'text-sev-medium',
}

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
  const actionColor = ACTION_COLORS[entry.action] ?? 'text-text-secondary'

  return (
    <tr className="border-b border-border-subtle/50 hover:bg-bg-primary/50 transition-colors">
      <td className="px-4 py-2.5 text-[11px] text-text-muted whitespace-nowrap">{fmtDate(entry.timestamp)}</td>
      <td className="px-4 py-2.5 text-[11px] text-text-secondary">{entry.adminName}</td>
      <td className="px-4 py-2.5">
        <span className={cn('text-[11px] font-mono', actionColor)}>{entry.action}</span>
      </td>
      <td className="px-4 py-2.5 text-[11px] text-text-muted">{entry.targetType}</td>
      <td className="px-4 py-2.5 text-[11px] text-text-secondary max-w-[200px] truncate" title={entry.details}>{entry.details}</td>
      <td className="px-4 py-2.5 text-[11px] text-text-muted font-mono">{entry.ip}</td>
    </tr>
  )
}

// ─── Main Component ──────────────────────────────────────────────

type AdminTab = 'health' | 'maintenance' | 'tenants' | 'audit'

const TABS: { key: AdminTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'health',      label: 'System Health',   icon: Activity },
  { key: 'maintenance', label: 'Maintenance',      icon: Calendar },
  { key: 'tenants',     label: 'Tenants',          icon: Users },
  { key: 'audit',       label: 'Audit Log',        icon: FileText },
]

export function AdminOpsPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('health')

  const { data: health, isDemo: healthDemo } = useSystemHealth()
  const { data: maintenance } = useMaintenanceWindows()
  const { data: tenants } = useAdminTenants()
  const { data: audit } = useAdminAuditLog()
  const { data: stats } = useAdminStats()

  const activateMutation    = useActivateMaintenance()
  const deactivateMutation  = useDeactivateMaintenance()
  const suspendMutation     = useSuspendTenant()
  const reinstateMutation   = useReinstateTenant()
  const changePlanMutation  = useChangeTenantPlan()

  const services = health?.services ?? []
  const summary  = health?.summary
  const mwList   = maintenance?.data ?? []
  const tenantList = tenants?.data ?? []
  const auditList  = audit?.data ?? []

  // CSV export of audit log
  const handleExportAudit = () => {
    if (!auditList.length) return
    const header = 'timestamp,admin,action,targetType,targetId,details,ip\n'
    const rows = auditList.map(e =>
      `"${e.timestamp}","${e.adminName}","${e.action}","${e.targetType}","${e.targetId}","${e.details}","${e.ip}"`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `etip-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Stats bar ─── */}
      <PageStatsBar title="Admin Operations" isDemo={healthDemo}>
        <CompactStat label="Services" value={summary ? `${summary.healthy}/${summary.total} healthy` : '—'} />
        <CompactStat label="Platform Uptime" value={summary ? `${summary.uptimePercent.toFixed(2)}%` : '—'} />
        <CompactStat label="Tenants" value={stats ? String(stats.totalTenants) : '—'} />
        <CompactStat label="Active" value={stats ? String(stats.activeTenants) : '—'} />
        <CompactStat label="Open Alerts" value={stats ? String(stats.openAlerts) : '—'} highlight={!!stats?.openAlerts} />
      </PageStatsBar>

      {/* ─── System status summary strip ─── */}
      {summary && (
        <div className="mx-4 mt-3 flex flex-wrap gap-4 bg-bg-elevated border border-border-subtle rounded-lg px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sev-low animate-pulse" />
            <span className="text-text-muted">Healthy:</span>
            <span className="text-sev-low font-medium">{summary.healthy}</span>
          </div>
          {summary.degraded > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sev-high" />
              <span className="text-text-muted">Degraded:</span>
              <span className="text-sev-high font-medium">{summary.degraded}</span>
            </div>
          )}
          {summary.down > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sev-critical" />
              <span className="text-text-muted">Down:</span>
              <span className="text-sev-critical font-medium">{summary.down}</span>
            </div>
          )}
          <div className="text-text-muted ml-auto text-[11px]">
            Last updated {timeAgo(summary.lastUpdated)}
          </div>
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 px-4 pt-4 border-b border-border-subtle">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2',
                activeTab === t.key
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-text-muted hover:text-text-secondary',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Health tab ── */}
        {activeTab === 'health' && (
          <div className="space-y-4">
            {/* Degraded services alert */}
            {(summary?.degraded ?? 0) > 0 && (
              <div className="flex items-start gap-3 bg-sev-high/10 border border-sev-high/30 rounded-lg p-3 text-xs text-sev-high">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>{summary!.degraded} service{summary!.degraded > 1 ? 's are' : ' is'} degraded.</strong>
                  {' '}Review response times and error rates. Consider scheduling a maintenance window.
                </div>
              </div>
            )}

            {/* Service grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {services.map(svc => (
                <ServiceCard key={svc.name} svc={svc} />
              ))}
            </div>

            {/* CISO insight */}
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-[11px] text-text-secondary">
              <strong className="text-accent">CISO Insight:</strong> Platform uptime at{' '}
              {summary?.uptimePercent.toFixed(2) ?? '—'}% over the last 30 days.
              AI enrichment service is showing elevated response times (340ms vs 50ms baseline) —
              likely due to upstream VirusTotal rate limiting. Monitor and consider burst scheduling.
            </div>
          </div>
        )}

        {/* ── Maintenance tab ── */}
        {activeTab === 'maintenance' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold text-text-secondary">
                {mwList.filter(m => m.status === 'active').length > 0 && (
                  <span className="text-sev-high mr-2">
                    {mwList.filter(m => m.status === 'active').length} ACTIVE
                  </span>
                )}
                {mwList.length} window{mwList.length !== 1 ? 's' : ''} total
              </h3>
              <div className="flex gap-2 text-[10px] text-text-muted">
                <span className={cn('px-2 py-0.5 rounded-full', MAINT_STATUS_COLORS['active']!)}>Active</span>
                <span className={cn('px-2 py-0.5 rounded-full', MAINT_STATUS_COLORS['scheduled']!)}>Scheduled</span>
                <span className={cn('px-2 py-0.5 rounded-full', MAINT_STATUS_COLORS['completed']!)}>Completed</span>
              </div>
            </div>
            {mwList.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-muted">No maintenance windows found.</div>
            ) : (
              mwList.map(mw => (
                <MaintenanceRow
                  key={mw.id}
                  mw={mw}
                  onActivate={id => activateMutation.mutate(id)}
                  onDeactivate={id => deactivateMutation.mutate(id)}
                />
              ))
            )}
          </div>
        )}

        {/* ── Tenants tab ── */}
        {activeTab === 'tenants' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-secondary">
                {tenantList.length} tenant{tenantList.length !== 1 ? 's' : ''}
              </h3>
              <div className="flex gap-2 text-[10px]">
                <span className={cn('px-2 py-0.5 rounded-full', TENANT_STATUS_COLORS['active']!)}>
                  {tenantList.filter(t => t.status === 'active').length} active
                </span>
                <span className={cn('px-2 py-0.5 rounded-full', TENANT_STATUS_COLORS['trial']!)}>
                  {tenantList.filter(t => t.status === 'trial').length} trial
                </span>
                {tenantList.filter(t => t.status === 'suspended').length > 0 && (
                  <span className={cn('px-2 py-0.5 rounded-full', TENANT_STATUS_COLORS['suspended']!)}>
                    {tenantList.filter(t => t.status === 'suspended').length} suspended
                  </span>
                )}
              </div>
            </div>
            <div className="bg-bg-elevated rounded-lg border border-border-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Tenant</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Plan</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Seats</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">IOCs</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Last Active</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantList.map(t => (
                      <TenantRow
                        key={t.id}
                        tenant={t}
                        onSuspend={id => suspendMutation.mutate({ id, reason: 'Admin action' })}
                        onReinstate={id => reinstateMutation.mutate(id)}
                        onChangePlan={(id, plan) => changePlanMutation.mutate({ id, plan })}
                      />
                    ))}
                  </tbody>
                </table>
                {tenantList.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-text-muted">No tenants found.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Audit tab ── */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-secondary">
                {auditList.length} audit events
              </h3>
              <button
                onClick={handleExportAudit}
                disabled={!auditList.length}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border-subtle text-text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
            <div className="bg-bg-elevated rounded-lg border border-border-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-4 py-3 text-[11px] text-text-muted font-medium whitespace-nowrap">Time</th>
                      <th className="text-left px-4 py-3 text-[11px] text-text-muted font-medium">Admin</th>
                      <th className="text-left px-4 py-3 text-[11px] text-text-muted font-medium">Action</th>
                      <th className="text-left px-4 py-3 text-[11px] text-text-muted font-medium">Type</th>
                      <th className="text-left px-4 py-3 text-[11px] text-text-muted font-medium">Details</th>
                      <th className="text-left px-4 py-3 text-[11px] text-text-muted font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditList.map(entry => (
                      <AuditRow key={entry.id} entry={entry} />
                    ))}
                  </tbody>
                </table>
                {auditList.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-text-muted">No audit entries found.</div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-text-muted">
              Showing up to 50 most recent events. Use Export CSV to download full history.
              Audit records are retained for 90 days per compliance policy.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
