/**
 * @module components/command-center/SystemTab
 * @description System tab for Command Center — super-admin only.
 * Absorbs AdminOpsPage + PipelineMonitorPage + Feeds tab content.
 * Sub-tabs: System Health, Pipeline, Feeds, Emergency Access, Maintenance, Backups.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useSystemHealth,
  useMaintenanceWindows, useActivateMaintenance, useDeactivateMaintenance,
  useCreateMaintenanceWindow,
  type ServiceHealth,
} from '@/hooks/use-phase6-data'
import {
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Play, Square,
  Shield, Calendar,
} from 'lucide-react'
import { BreakGlassPanel } from './BreakGlassPanel'
import { UnifiedFeedsPanel } from './FeedsTab'
import { PipelinePanel } from './PipelinePanel'
import { BackupsPanel } from './BackupsPanel'

// ─── Sub-tab Switcher ───────────────────────────────────────────

type SubTab = 'health' | 'pipeline' | 'feeds' | 'emergency' | 'maintenance' | 'backups'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'health', label: 'System Health' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'feeds', label: 'Feeds' },
  { id: 'emergency', label: 'Emergency Access' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'backups', label: 'Backups' },
]

// ─── Status helpers ─────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'healthy' ? 'bg-sev-low' :
    status === 'degraded' ? 'bg-amber-400' :
    'bg-sev-critical'
  return <span className={cn('inline-block w-2 h-2 rounded-full', color)} />
}

function formatUptime(pct: number | undefined) {
  if (pct == null || isNaN(pct)) return '—'
  return `${pct.toFixed(1)}%`
}

// ─── Main Component ─────────────────────────────────────────────

export function SystemTab() {
  const [subTab, setSubTab] = useState<SubTab>('health')

  return (
    <div className="space-y-4" data-testid="system-tab">
      {/* PillSwitcher sub-tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-bg-elevated rounded-lg w-fit" data-testid="system-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            data-testid={`subtab-${t.id}`}
            onClick={() => setSubTab(t.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              subTab === t.id
                ? 'bg-accent/20 text-accent'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'health' && <HealthSubTab />}
      {subTab === 'pipeline' && <PipelinePanel />}
      {subTab === 'feeds' && <UnifiedFeedsPanel isSuperAdmin={true} />}
      {subTab === 'emergency' && <BreakGlassPanel />}
      {subTab === 'maintenance' && <MaintenanceSubTab />}
      {subTab === 'backups' && <BackupsPanel />}
    </div>
  )
}

// ─── System Health Sub-tab ──────────────────────────────────────

function HealthSubTab() {
  const { data: health, refetch, isFetching } = useSystemHealth()
  const services: ServiceHealth[] = health?.services ?? []
  const summary = health?.summary ?? { healthy: 0, degraded: 0, down: 0, total: 0, uptimePercent: 0, lastUpdated: '' }

  const healthScore = summary.total > 0
    ? Math.round((summary.healthy / summary.total) * 100)
    : 0

  return (
    <div className="space-y-4" data-testid="health-subtab">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4 text-sev-low" />}
          label="Healthy"
          value={String(summary.healthy)}
          color="text-sev-low"
        />
        <SummaryCard
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
          label="Degraded"
          value={String(summary.degraded)}
          color="text-amber-400"
        />
        <SummaryCard
          icon={<XCircle className="w-4 h-4 text-sev-critical" />}
          label="Down"
          value={String(summary.down)}
          color="text-sev-critical"
        />
        <SummaryCard
          icon={<Shield className="w-4 h-4 text-accent" />}
          label="Health Score"
          value={`${healthScore}%`}
          color="text-accent"
        />
      </div>

      {/* Resource bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ResourceBar label="Platform Uptime" value={summary.uptimePercent} color="bg-sev-low" />
        <ResourceBar label="Services Online" value={healthScore} color="bg-accent" />
      </div>

      {/* Last check + refresh */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Last check: {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleTimeString() : '—'}</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-accent hover:text-accent-hover disabled:opacity-50"
          data-testid="refresh-health"
        >
          <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" data-testid="service-grid">
        {services.map(svc => (
          <div
            key={svc.name}
            className="flex items-center gap-2 p-2.5 bg-bg-elevated rounded-lg border border-border"
          >
            <StatusDot status={svc.status} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-primary truncate">{svc.name}</p>
              <p className="text-[10px] text-text-muted">
                {formatUptime(svc.uptime)} uptime · {svc.responseMs}ms · :{svc.port}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-bg-elevated rounded-lg border border-border">
      {icon}
      <div>
        <p className={cn('text-lg font-bold', color)}>{value}</p>
        <p className="text-[10px] text-text-muted">{label}</p>
      </div>
    </div>
  )
}

function ResourceBar({ label, value, color }: { label: string; value: number | undefined; color: string }) {
  const v = value ?? 0
  return (
    <div className="p-3 bg-bg-elevated rounded-lg border border-border">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary font-medium">{v.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-bg-base rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(v, 100)}%` }} />
      </div>
    </div>
  )
}

// ─── Maintenance Sub-tab ────────────────────────────────────────

function MaintenanceSubTab() {
  const { data: maintData } = useMaintenanceWindows()
  const activateMaint = useActivateMaintenance()
  const deactivateMaint = useDeactivateMaintenance()
  const createMaint = useCreateMaintenanceWindow()
  const [showCreate, setShowCreate] = useState(false)

  const windows = maintData?.data ?? []
  const activeWindow = windows.find(w => w.status === 'active')

  return (
    <div className="space-y-4" data-testid="maintenance-subtab">
      {/* Active maintenance banner */}
      {activeWindow && (
        <div className="p-3 bg-amber-400/10 border border-amber-400/30 rounded-lg" data-testid="active-maintenance-banner">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Maintenance Active
              </p>
              <p className="text-xs text-text-secondary mt-0.5">{activeWindow.title} — {activeWindow.description}</p>
            </div>
            <button
              onClick={() => deactivateMaint.mutate(activeWindow.id)}
              disabled={deactivateMaint.isPending}
              className="px-3 py-1.5 text-xs bg-bg-base border border-border rounded-md hover:bg-bg-hover text-text-primary disabled:opacity-50"
            >
              <Square className="w-3 h-3 inline mr-1" /> End
            </button>
          </div>
        </div>
      )}

      {/* Create maintenance toggle */}
      {!activeWindow && (
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-md hover:bg-accent/20 transition-colors"
          data-testid="create-maintenance-btn"
        >
          <Calendar className="w-3 h-3 inline mr-1" /> Schedule Maintenance
        </button>
      )}

      {/* Simple create form */}
      {showCreate && (
        <CreateMaintenanceForm
          onSubmit={(body) => {
            createMaint.mutate(body)
            setShowCreate(false)
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Maintenance history */}
      <div data-testid="maintenance-history">
        <h3 className="text-sm font-semibold text-text-primary mb-2">History</h3>
        {windows.length === 0 ? (
          <p className="text-xs text-text-muted">No maintenance windows recorded.</p>
        ) : (
          <div className="space-y-2">
            {windows.map(w => (
              <div key={w.id} className="flex items-center justify-between p-2.5 bg-bg-elevated rounded-lg border border-border">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-primary truncate">{w.title}</p>
                  <p className="text-[10px] text-text-muted">
                    {new Date(w.startsAt).toLocaleDateString()} — {w.status}
                    {w.affectedServices.length > 0 && ` · ${w.affectedServices.length} services`}
                  </p>
                </div>
                {w.status === 'scheduled' && (
                  <button
                    onClick={() => activateMaint.mutate(w.id)}
                    disabled={activateMaint.isPending}
                    className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-50 flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Activate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CreateMaintenanceForm({ onSubmit, onCancel }: {
  onSubmit: (body: { title: string; description: string; startsAt: string; endsAt: string; affectedServices: string[] }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [duration, setDuration] = useState('60')

  const handleSubmit = () => {
    if (!title || !startsAt) return
    const start = new Date(startsAt)
    const end = new Date(start.getTime() + Number(duration) * 60_000)
    onSubmit({ title, description, startsAt: start.toISOString(), endsAt: end.toISOString(), affectedServices: [] })
  }

  return (
    <div className="p-3 bg-bg-elevated rounded-lg border border-border space-y-2" data-testid="create-maintenance-form">
      <input
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full px-2 py-1.5 text-xs bg-bg-base border border-border rounded text-text-primary placeholder:text-text-muted"
      />
      <input
        placeholder="Description"
        value={description}
        onChange={e => setDescription(e.target.value)}
        className="w-full px-2 py-1.5 text-xs bg-bg-base border border-border rounded text-text-primary placeholder:text-text-muted"
      />
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={startsAt}
          onChange={e => setStartsAt(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs bg-bg-base border border-border rounded text-text-primary"
        />
        <select
          value={duration}
          onChange={e => setDuration(e.target.value)}
          className="px-2 py-1.5 text-xs bg-bg-base border border-border rounded text-text-primary"
        >
          <option value="30">30 min</option>
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="240">4 hours</option>
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-xs text-text-muted hover:text-text-primary">Cancel</button>
        <button onClick={handleSubmit} className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover">Create</button>
      </div>
    </div>
  )
}

