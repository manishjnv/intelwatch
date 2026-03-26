/**
 * @module pages/ReportingPage
 * @description Reporting dashboard — generate, schedule, and manage threat
 * intelligence reports. 3 tabs: Reports (table + bulk ops), Schedules (cron
 * management), Templates (card grid). Connects to reporting-service (port 3021
 * via nginx /api/v1/reports/*).
 */
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  useReports, useReportStats, useReportTemplates, useReportSchedules,
  useReportComparison, useCreateReport, useCloneReport, useBulkDeleteReports,
  useCreateSchedule, useDeleteSchedule, useBulkToggleSchedules,
  type ReportType, type ReportFormat, type ReportStatus,
} from '@/hooks/use-reporting-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  FileText, Calendar, LayoutTemplate, Download, Copy, Trash2,
  Plus, Clock, CheckCircle2, XCircle, Loader2,
  ToggleLeft, ToggleRight,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

const STATUS_CONFIG: Record<ReportStatus, { dot: string; text: string; Icon: React.FC<{ className?: string }> }> = {
  completed:  { dot: 'bg-sev-low',      text: 'text-sev-low',      Icon: CheckCircle2 },
  generating: { dot: 'bg-accent',        text: 'text-accent',        Icon: Loader2 },
  pending:    { dot: 'bg-sev-medium',    text: 'text-sev-medium',    Icon: Clock },
  failed:     { dot: 'bg-sev-critical',  text: 'text-sev-critical',  Icon: XCircle },
}

const TYPE_COLORS: Record<ReportType, string> = {
  daily: 'text-accent bg-accent/10',
  weekly: 'text-purple-400 bg-purple-400/10',
  monthly: 'text-cyan-400 bg-cyan-400/10',
  custom: 'text-amber-400 bg-amber-400/10',
  executive: 'text-rose-400 bg-rose-400/10',
}

const FORMAT_LABELS: Record<ReportFormat, string> = { json: 'JSON', html: 'HTML', pdf: 'PDF', csv: 'CSV' }

function Badge({ label, className }: { label: string; className?: string }) {
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap', className)}>{label}</span>
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.Icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', cfg.text)}>
      <Icon className={cn('w-3 h-3', status === 'generating' && 'animate-spin')} />
      {status}
    </span>
  )
}

// ─── New Report Modal ───────────────────────────────────────────

function NewReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<ReportType>('daily')
  const [format, setFormat] = useState<ReportFormat>('html')
  const [title, setTitle] = useState('')
  const createMut = useCreateReport()

  const handleSubmit = () => {
    createMut.mutate({ type, format, title: title || undefined }, { onSuccess: () => { onClose(); setTitle('') } })
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">New Report</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Report Type</label>
            <select value={type} onChange={e => setType(e.target.value as ReportType)}
              className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary focus:border-accent outline-none">
              {(['daily', 'weekly', 'monthly', 'custom', 'executive'] as const).map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Format</label>
            <div className="flex gap-2">
              {(['html', 'pdf', 'json', 'csv'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs border transition-colors',
                    format === f ? 'border-accent text-accent bg-accent/10' : 'border-border-subtle text-text-muted hover:text-text-secondary')}>
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Title (optional)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Auto-generated if blank"
              className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-xs text-text-muted rounded-lg border border-border-subtle hover:border-accent/40 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={createMut.isPending}
            className="px-4 py-2 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
            {createMut.isPending ? 'Creating…' : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Schedule Modal ─────────────────────────────────────────

function NewScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ReportType>('daily')
  const [format, setFormat] = useState<ReportFormat>('html')
  const [cron, setCron] = useState('0 6 * * *')
  const createMut = useCreateSchedule()

  const handleSubmit = () => {
    if (!name.trim()) return
    createMut.mutate({ name, type, format, cronExpression: cron, enabled: true }, {
      onSuccess: () => { onClose(); setName('') },
    })
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">New Schedule</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Schedule Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Daily Threat Summary"
              className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as ReportType)}
                className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary focus:border-accent outline-none">
                {(['daily', 'weekly', 'monthly', 'custom', 'executive'] as const).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Format</label>
              <select value={format} onChange={e => setFormat(e.target.value as ReportFormat)}
                className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary focus:border-accent outline-none">
                {(['html', 'pdf', 'json', 'csv'] as const).map(f => (
                  <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Cron Expression</label>
            <input value={cron} onChange={e => setCron(e.target.value)}
              className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none" />
            <p className="text-[10px] text-text-muted mt-1">e.g. &quot;0 6 * * *&quot; = daily at 6 AM, &quot;0 8 * * 1&quot; = weekly Monday 8 AM</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-xs text-text-muted rounded-lg border border-border-subtle hover:border-accent/40 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={createMut.isPending || !name.trim()}
            className="px-4 py-2 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
            {createMut.isPending ? 'Creating…' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Compare Panel ──────────────────────────────────────────────

function ComparePanel({ idA, idB, onClose }: { idA: string; idB: string; onClose: () => void }) {
  const { data: comparison } = useReportComparison(idA, idB)
  if (!comparison) return null

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">Report Comparison</h4>
        <button onClick={onClose} className="text-[10px] text-text-muted hover:text-text-primary">Close</button>
      </div>
      <div className="flex gap-4 text-[11px] text-text-muted">
        <span><strong className="text-text-primary">A:</strong> {comparison.reportA.title}</span>
        <span><strong className="text-text-primary">B:</strong> {comparison.reportB.title}</span>
      </div>
      <div className="space-y-1">
        {comparison.changes.map(c => (
          <div key={c.metric} className="flex items-center gap-3 text-[11px] py-1 border-b border-border-subtle/50 last:border-0">
            <span className="text-text-secondary w-36 shrink-0">{c.metric}</span>
            <span className="text-text-muted w-12 text-right">{c.valueA}</span>
            <span className="text-text-muted">→</span>
            <span className="text-text-muted w-12 text-right">{c.valueB}</span>
            <span className={cn('font-medium ml-auto',
              c.delta > 0 ? 'text-sev-low' : c.delta < 0 ? 'text-sev-critical' : 'text-text-muted')}>
              {c.delta > 0 ? '+' : ''}{c.deltaPercent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

type ReportingTab = 'reports' | 'schedules' | 'templates'

const TABS: { key: ReportingTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'reports',   label: 'Reports',   icon: FileText },
  { key: 'schedules', label: 'Schedules', icon: Calendar },
  { key: 'templates', label: 'Templates', icon: LayoutTemplate },
]

export function ReportingPage() {
  const [activeTab, setActiveTab] = useState<ReportingTab>('reports')
  const [showNewReport, setShowNewReport] = useState(false)
  const [showNewSchedule, setShowNewSchedule] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null)

  const { data: reports, isDemo } = useReports()
  const { data: stats } = useReportStats()
  const { data: templates } = useReportTemplates()
  const { data: schedules } = useReportSchedules()

  const cloneMut = useCloneReport()
  const bulkDeleteMut = useBulkDeleteReports()
  const deleteSched = useDeleteSchedule()
  const bulkToggle = useBulkToggleSchedules()

  const reportList = reports?.data ?? []
  const scheduleList = schedules ?? []
  const templateList = templates ?? []

  // Auto-refresh pending/generating reports every 5s
  const { refetch } = useReports()
  useEffect(() => {
    const hasPending = reportList.some(r => r.status === 'pending' || r.status === 'generating')
    if (!hasPending) return
    const interval = setInterval(() => refetch(), 5000)
    return () => clearInterval(interval)
  }, [reportList, refetch])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelected(prev => prev.size === reportList.length ? new Set() : new Set(reportList.map(r => r.id)))
  }, [reportList])

  const handleBulkDelete = () => {
    if (selected.size === 0) return
    bulkDeleteMut.mutate([...selected], { onSuccess: () => setSelected(new Set()) })
  }

  const handleCompare = () => {
    const completed = reportList.filter(r => r.status === 'completed' && selected.has(r.id))
    if (completed.length === 2) setCompareIds([completed[0]!.id, completed[1]!.id])
  }

  const handleDownload = (id: string) => {
    window.open(`/api/v1/reports/${id}/download`, '_blank')
  }

  // Schedule selection for bulk toggle
  const [selectedSchedules, setSelectedSchedules] = useState<Set<string>>(new Set())
  const toggleScheduleSelect = useCallback((id: string) => {
    setSelectedSchedules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Stats bar ─── */}
      <PageStatsBar title="Reporting" isDemo={isDemo}>
        <CompactStat label="Total Reports" value={stats ? String(stats.total) : '—'} />
        <CompactStat label="Completed" value={stats ? String(stats.byStatus.completed) : '—'} />
        <CompactStat label="Failed" value={stats ? String(stats.byStatus.failed) : '—'} highlight={!!stats?.byStatus.failed} />
        <CompactStat label="Avg Time" value={stats ? fmtMs(stats.avgGenerationTimeMs) : '—'} />
        <CompactStat label="Active Schedules" value={stats ? String(stats.activeSchedules) : '—'} />
      </PageStatsBar>

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 px-4 pt-4 border-b border-border-subtle">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2',
                activeTab === t.key
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-text-muted hover:text-text-secondary',
              )}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Reports tab ── */}
        {activeTab === 'reports' && (
          <div className="space-y-3">
            {/* Actions bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setShowNewReport(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
                <Plus className="w-3.5 h-3.5" /> New Report
              </button>
              {selected.size > 0 && (
                <>
                  <button onClick={handleBulkDelete} disabled={bulkDeleteMut.isPending}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sev-critical/40 text-sev-critical hover:bg-sev-critical/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> Delete ({selected.size})
                  </button>
                  {selected.size === 2 && (
                    <button onClick={handleCompare}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors">
                      Compare
                    </button>
                  )}
                </>
              )}
              <span className="ml-auto text-[11px] text-text-muted">
                {reportList.length} report{reportList.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Compare panel */}
            {compareIds && <ComparePanel idA={compareIds[0]} idB={compareIds[1]} onClose={() => setCompareIds(null)} />}

            {/* Report table */}
            <div className="bg-bg-elevated rounded-lg border border-border-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-4 py-3 w-8">
                        <input type="checkbox" checked={selected.size === reportList.length && reportList.length > 0}
                          onChange={toggleSelectAll} className="accent-accent" />
                      </th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Title</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Type</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Format</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden sm:table-cell">Created</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden lg:table-cell">Time</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportList.map(r => (
                      <tr key={r.id} className={cn(
                        'border-b border-border-subtle/50 hover:bg-bg-primary/50 transition-colors',
                        selected.has(r.id) && 'bg-accent/5',
                      )}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-accent" />
                        </td>
                        <td className="px-4 py-2.5 text-text-primary font-medium max-w-[200px] truncate" title={r.title}>{r.title}</td>
                        <td className="px-4 py-2.5"><Badge label={r.type} className={TYPE_COLORS[r.type]} /></td>
                        <td className="px-4 py-2.5 text-text-secondary">{FORMAT_LABELS[r.format]}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-2.5 text-text-muted hidden sm:table-cell whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                        <td className="px-4 py-2.5 text-text-muted hidden lg:table-cell">{r.generationTimeMs ? fmtMs(r.generationTimeMs) : '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            {r.status === 'completed' && (
                              <button onClick={() => handleDownload(r.id)} title="Download"
                                className="p-1 rounded hover:bg-bg-primary text-text-muted hover:text-accent transition-colors">
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => cloneMut.mutate(r.id)} title="Clone"
                              className="p-1 rounded hover:bg-bg-primary text-text-muted hover:text-accent transition-colors">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportList.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-text-muted">No reports found. Create your first report above.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Schedules tab ── */}
        {activeTab === 'schedules' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setShowNewSchedule(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
                <Plus className="w-3.5 h-3.5" /> New Schedule
              </button>
              {selectedSchedules.size > 0 && (
                <>
                  <button onClick={() => bulkToggle.mutate({ ids: [...selectedSchedules], enabled: true })}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sev-low/40 text-sev-low hover:bg-sev-low/10 transition-colors">
                    <ToggleRight className="w-3.5 h-3.5" /> Enable ({selectedSchedules.size})
                  </button>
                  <button onClick={() => bulkToggle.mutate({ ids: [...selectedSchedules], enabled: false })}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-text-muted/40 text-text-muted hover:bg-bg-primary transition-colors">
                    <ToggleLeft className="w-3.5 h-3.5" /> Disable ({selectedSchedules.size})
                  </button>
                </>
              )}
              <span className="ml-auto text-[11px] text-text-muted">
                {scheduleList.filter(s => s.enabled).length}/{scheduleList.length} active
              </span>
            </div>
            <div className="bg-bg-elevated rounded-lg border border-border-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-4 py-3 w-8">
                        <input type="checkbox"
                          checked={selectedSchedules.size === scheduleList.length && scheduleList.length > 0}
                          onChange={() => setSelectedSchedules(prev => prev.size === scheduleList.length ? new Set() : new Set(scheduleList.map(s => s.id)))}
                          className="accent-accent" />
                      </th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Name</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Type</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden sm:table-cell">Cron</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Enabled</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden md:table-cell">Last Run</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden lg:table-cell">Runs</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleList.map(s => (
                      <tr key={s.id} className={cn(
                        'border-b border-border-subtle/50 hover:bg-bg-primary/50 transition-colors',
                        selectedSchedules.has(s.id) && 'bg-accent/5',
                      )}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={selectedSchedules.has(s.id)} onChange={() => toggleScheduleSelect(s.id)} className="accent-accent" />
                        </td>
                        <td className="px-4 py-2.5 text-text-primary font-medium">{s.name}</td>
                        <td className="px-4 py-2.5"><Badge label={s.type} className={TYPE_COLORS[s.type]} /></td>
                        <td className="px-4 py-2.5 text-text-muted font-mono hidden sm:table-cell">{s.cronExpression}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-[11px] font-medium', s.enabled ? 'text-sev-low' : 'text-text-muted')}>
                            {s.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-text-muted hidden md:table-cell whitespace-nowrap">{s.lastRunAt ? fmtDate(s.lastRunAt) : '—'}</td>
                        <td className="px-4 py-2.5 text-text-secondary hidden lg:table-cell">{s.runCount}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => deleteSched.mutate(s.id)} title="Delete schedule"
                            className="p-1 rounded hover:bg-sev-critical/10 text-text-muted hover:text-sev-critical transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {scheduleList.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-text-muted">No schedules configured. Create one to automate report generation.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Templates tab ── */}
        {activeTab === 'templates' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-text-secondary">{templateList.length} templates available</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templateList.map(tpl => (
                <div key={tpl.id} className="bg-bg-elevated border border-border-subtle rounded-lg p-4 hover:border-accent/30 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-xs font-semibold text-text-primary">{tpl.name}</h4>
                    <Badge label={tpl.type} className={TYPE_COLORS[tpl.type]} />
                  </div>
                  <p className="text-[11px] text-text-secondary mb-3 leading-relaxed">{tpl.description}</p>
                  <div className="space-y-1">
                    <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Sections</p>
                    <div className="flex flex-wrap gap-1">
                      {tpl.sections.map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-primary border border-border-subtle text-text-muted">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
                    <span className="text-[10px] text-text-muted">Default: {FORMAT_LABELS[tpl.defaultFormat]}</span>
                    <button onClick={() => { setShowNewReport(true) }}
                      className="text-[11px] text-accent hover:underline">
                      Use template →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      <NewReportModal open={showNewReport} onClose={() => setShowNewReport(false)} />
      <NewScheduleModal open={showNewSchedule} onClose={() => setShowNewSchedule(false)} />
    </div>
  )
}
