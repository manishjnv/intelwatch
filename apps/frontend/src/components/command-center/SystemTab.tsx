/**
 * @module components/command-center/SystemTab
 * @description System tab for Command Center — super-admin only.
 * Absorbs AdminOpsPage + PipelineMonitorPage content.
 * Sub-tabs: System Health, Pipeline Monitor, Maintenance, Backups.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useSystemHealth, useQueueHealth, useQueueAlerts,
  useMaintenanceWindows, useActivateMaintenance, useDeactivateMaintenance,
  useCreateMaintenanceWindow, useDlqStatus, useRetryDlqQueue, useRetryAllDlq,
  type ServiceHealth, type QueueDepth, type DlqQueueEntry,
} from '@/hooks/use-phase6-data'
import {
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Play, Square,
  ArrowRight, RotateCcw, Database, Shield, Calendar,
  Download, Upload, Trash2,
} from 'lucide-react'

// ─── Sub-tab Switcher ───────────────────────────────────────────

type SubTab = 'health' | 'pipeline' | 'maintenance' | 'backups'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'health', label: 'System Health' },
  { id: 'pipeline', label: 'Pipeline Monitor' },
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

function formatUptime(pct: number) {
  return `${pct.toFixed(1)}%`
}

// ─── Main Component ─────────────────────────────────────────────

export function SystemTab() {
  const [subTab, setSubTab] = useState<SubTab>('health')

  return (
    <div className="space-y-4" data-testid="system-tab">
      {/* PillSwitcher sub-tabs */}
      <div className="flex gap-1 p-1 bg-bg-elevated rounded-lg w-fit" data-testid="system-subtabs">
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
      {subTab === 'pipeline' && <PipelineSubTab />}
      {subTab === 'maintenance' && <MaintenanceSubTab />}
      {subTab === 'backups' && <BackupsSubTab />}
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

function ResourceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-3 bg-bg-elevated rounded-lg border border-border">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary font-medium">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-bg-base rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

// ─── Pipeline Monitor Sub-tab ───────────────────────────────────

const PIPELINE_STAGES = ['ingestion', 'normalization', 'enrichment', 'indexing'] as const

function PipelineSubTab() {
  const { data: queueData, refetch, isFetching } = useQueueHealth()
  const { data: alertsData } = useQueueAlerts()
  const { data: dlqData } = useDlqStatus()
  const retryQueue = useRetryDlqQueue()
  const retryAll = useRetryAllDlq()

  const queues: QueueDepth[] = queueData?.queues ?? []
  const alerts = alertsData?.alerts ?? []
  const dlqQueues: DlqQueueEntry[] = dlqData?.queues?.filter((q: DlqQueueEntry) => q.failed > 0) ?? []

  // Map queues to pipeline stages
  const stageStatus = (stage: string) => {
    const related = queues.filter(q => q.name.includes(stage.slice(0, 5)))
    const hasFailures = related.some(q => q.failed > 0)
    const hasWaiting = related.some(q => q.waiting > 10)
    if (hasFailures) return 'error'
    if (hasWaiting) return 'busy'
    return 'healthy'
  }

  return (
    <div className="space-y-4" data-testid="pipeline-subtab">
      {/* Pipeline flow diagram */}
      <div className="overflow-x-auto">
        <div className="flex items-center gap-2 min-w-[500px] p-3 bg-bg-elevated rounded-lg border border-border" data-testid="pipeline-flow">
          {PIPELINE_STAGES.map((stage, i) => {
            const status = stageStatus(stage)
            const dotColor = status === 'healthy' ? 'bg-sev-low' : status === 'busy' ? 'bg-amber-400' : 'bg-sev-critical'
            return (
              <div key={stage} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-bg-base rounded-md border border-border">
                  <span className={cn('w-2 h-2 rounded-full', dotColor)} />
                  <span className="text-xs font-medium text-text-primary capitalize">{stage}</span>
                </div>
                {i < PIPELINE_STAGES.length - 1 && <ArrowRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Active alerts banner */}
      {alerts.length > 0 && (
        <div className="p-2.5 bg-sev-critical/10 border border-sev-critical/30 rounded-lg" data-testid="queue-alerts">
          <p className="text-xs font-medium text-sev-critical flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {alerts.length} queue alert{alerts.length > 1 ? 's' : ''} active
          </p>
        </div>
      )}

      {/* Queue stats table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="queue-table">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="text-left py-2 px-2 font-medium">Queue</th>
              <th className="text-right py-2 px-2 font-medium">Waiting</th>
              <th className="text-right py-2 px-2 font-medium">Active</th>
              <th className="text-right py-2 px-2 font-medium">Completed</th>
              <th className="text-right py-2 px-2 font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {queues.map(q => {
              const isStuck = q.waiting > 10
              return (
                <tr key={q.name} className={cn('border-b border-border/50', isStuck && 'bg-amber-400/5')}>
                  <td className="py-1.5 px-2 font-medium text-text-primary">
                    {q.name.replace('etip-', '')}
                    {isStuck && <span className="ml-1 text-[10px] text-amber-400">(stuck)</span>}
                  </td>
                  <td className={cn('text-right py-1.5 px-2', q.waiting > 0 ? 'text-amber-400' : 'text-text-muted')}>{q.waiting}</td>
                  <td className={cn('text-right py-1.5 px-2', q.active > 0 ? 'text-accent' : 'text-text-muted')}>{q.active}</td>
                  <td className="text-right py-1.5 px-2 text-text-muted">{q.completed}</td>
                  <td className={cn('text-right py-1.5 px-2', q.failed > 0 ? 'text-sev-critical' : 'text-text-muted')}>{q.failed}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Refresh + last updated */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Updated: {queueData?.updatedAt ? new Date(queueData.updatedAt).toLocaleTimeString() : '—'}</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-accent hover:text-accent-hover disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* DLQ failed items */}
      {dlqQueues.length > 0 && (
        <div className="space-y-2" data-testid="dlq-section">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 text-sev-critical" /> Failed Items (DLQ)
            </h3>
            <button
              onClick={() => retryAll.mutate()}
              disabled={retryAll.isPending}
              className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-50 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Retry All
            </button>
          </div>
          {dlqQueues.map(q => (
            <div key={q.name} className="flex items-center justify-between p-2 bg-bg-elevated rounded border border-border">
              <span className="text-xs text-text-primary">{q.name.replace('etip-', '')} — {q.failed} failed</span>
              <button
                onClick={() => retryQueue.mutate(q.name)}
                disabled={retryQueue.isPending}
                className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          ))}
        </div>
      )}
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

// ─── Backups Sub-tab ────────────────────────────────────────────

// Demo backup data
const DEMO_BACKUPS = [
  { id: 'b1', date: '2026-03-28T02:00:00Z', type: 'auto' as const, sizeMb: 245, status: 'completed' as const },
  { id: 'b2', date: '2026-03-27T02:00:00Z', type: 'auto' as const, sizeMb: 238, status: 'completed' as const },
  { id: 'b3', date: '2026-03-26T14:30:00Z', type: 'manual' as const, sizeMb: 240, status: 'completed' as const },
  { id: 'b4', date: '2026-03-26T02:00:00Z', type: 'auto' as const, sizeMb: 235, status: 'completed' as const },
  { id: 'b5', date: '2026-03-25T02:00:00Z', type: 'auto' as const, sizeMb: 230, status: 'completed' as const },
]

function BackupsSubTab() {
  const [backups] = useState(DEMO_BACKUPS)
  const [triggerPending, setTriggerPending] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  const handleTriggerBackup = () => {
    setTriggerPending(true)
    setTimeout(() => setTriggerPending(false), 2000)
  }

  return (
    <div className="space-y-4" data-testid="backups-subtab">
      {/* Backup schedule info */}
      <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border">
        <div>
          <p className="text-xs font-medium text-text-primary">Auto Backup Schedule</p>
          <p className="text-[10px] text-text-muted">Daily at 02:00 UTC · Last: {new Date(backups[0]?.date ?? '').toLocaleString()}</p>
        </div>
        <button
          onClick={handleTriggerBackup}
          disabled={triggerPending}
          className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-md hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1"
          data-testid="trigger-backup-btn"
        >
          <Database className="w-3 h-3" /> {triggerPending ? 'Creating...' : 'Backup Now'}
        </button>
      </div>

      {/* Backup table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="backup-table">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-left py-2 px-2 font-medium">Type</th>
              <th className="text-right py-2 px-2 font-medium">Size</th>
              <th className="text-left py-2 px-2 font-medium">Status</th>
              <th className="text-right py-2 px-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.id} className="border-b border-border/50">
                <td className="py-1.5 px-2 text-text-primary">{new Date(b.date).toLocaleString()}</td>
                <td className="py-1.5 px-2">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    b.type === 'auto' ? 'bg-accent/10 text-accent' : 'bg-purple-400/10 text-purple-400',
                  )}>
                    {b.type}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 text-text-muted">{b.sizeMb} MB</td>
                <td className="py-1.5 px-2">
                  <span className="text-sev-low flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {b.status}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2">
                  <div className="flex items-center justify-end gap-2">
                    <button className="text-text-muted hover:text-accent" title="Download">
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setConfirmRestore(b.id)}
                      className="text-text-muted hover:text-amber-400"
                      title="Restore"
                    >
                      <Upload className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Restore confirmation modal */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="restore-confirm-modal">
          <div className="bg-bg-primary border border-border rounded-lg p-4 max-w-sm w-full mx-4 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Confirm Restore</h3>
            <p className="text-xs text-text-secondary">
              This will restore the database to the selected backup point. Current data will be overwritten.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-3 py-1.5 text-xs bg-sev-critical text-white rounded hover:bg-sev-critical/80"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
