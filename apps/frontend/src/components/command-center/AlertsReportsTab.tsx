/**
 * @module components/command-center/AlertsReportsTab
 * @description Unified alerting & reporting tab — absorbs AlertingPage + ReportingPage.
 * 4 sub-tabs: Alert Rules, Alert History, Report Templates, Generate & Schedule.
 */
import React, { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PillSwitcher, type PillItem } from './PillSwitcher'
import type { useCommandCenter } from '@/hooks/use-command-center'
import {
  useAlertRules, useAlerts, useAcknowledgeAlert, useResolveAlert,
  useBulkAcknowledge, useCreateRule, useToggleRule, useDeleteRule,
  type AlertRule, type Alert, type AlertSeverity, type AlertStatus,
} from '@/hooks/use-alerting-data'
import {
  useReports, useReportTemplates, useReportSchedules,
  useCreateReport, useCreateSchedule,
  type ReportTemplate, type ReportSchedule, type ReportType, type ReportFormat,
} from '@/hooks/use-reporting-data'
import {
  Bell, History, FileText, Calendar,
  Check, X, AlertTriangle, Shield, Copy, Trash2,
  Plus, Play, Download, Clock, Eye,
  ChevronDown, ChevronRight,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────

type SubTab = 'rules' | 'history' | 'templates' | 'generate'

interface AlertsReportsTabProps {
  data: ReturnType<typeof useCommandCenter>
}

// ─── Helpers ────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const SEV_COLORS: Record<string, string> = {
  critical: 'text-sev-critical bg-sev-critical/10',
  high:     'text-sev-high bg-sev-high/10',
  medium:   'text-sev-medium bg-sev-medium/10',
  low:      'text-sev-low bg-sev-low/10',
  info:     'text-accent bg-accent/10',
}

const STATUS_COLORS: Record<string, string> = {
  open:          'text-sev-high bg-sev-high/10',
  acknowledged:  'text-sev-medium bg-sev-medium/10',
  resolved:      'text-sev-low bg-sev-low/10',
  suppressed:    'text-text-muted bg-bg-elevated',
  escalated:     'text-sev-critical bg-sev-critical/10',
  // report statuses
  pending:       'text-sev-medium bg-sev-medium/10',
  generating:    'text-accent bg-accent/10',
  completed:     'text-sev-low bg-sev-low/10',
  failed:        'text-sev-critical bg-sev-critical/10',
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize', SEV_COLORS[severity] ?? 'bg-bg-hover text-text-muted')}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[status] ?? 'bg-bg-hover text-text-muted')}>
      {status}
    </span>
  )
}

const QUICK_TEMPLATES = [
  { name: 'Critical IOC Alert', severity: 'critical' as AlertSeverity, condition: { type: 'threshold' as const, entity: 'ioc', field: 'severity', operator: 'eq', value: 'critical' } },
  { name: 'New CVE for My Stack', severity: 'high' as AlertSeverity, condition: { type: 'pattern' as const, entity: 'vulnerability', field: 'affectsStack', operator: 'eq', value: 'true' } },
  { name: 'Feed Error Alert', severity: 'medium' as AlertSeverity, condition: { type: 'threshold' as const, entity: 'feed', field: 'consecutiveFailures', operator: 'gte', value: '3' } },
]

// ─── Alert Rules Sub-Tab ────────────────────────────────────

function AlertRulesPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { data: rules, isDemo } = useAlertRules()
  const toggleRule = useToggleRule()
  const deleteRule = useDeleteRule()
  const createRule = useCreateRule()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRule, setNewRule] = useState({ name: '', severity: 'medium' as AlertSeverity, entityType: 'ioc', field: 'severity', operator: 'eq', value: '' })

  const ruleList = (rules as AlertRule[] | undefined) ?? []

  return (
    <div className="space-y-4" data-testid="alert-rules-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Alert Rules</h3>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-bg-primary text-xs font-medium hover:bg-accent/90 transition-colors"
          onClick={() => setShowCreateModal(true)}
          data-testid="create-rule-btn"
        >
          <Plus className="w-3 h-3" /> New Rule
        </button>
      </div>

      {/* Quick templates */}
      <div className="flex flex-wrap gap-2">
        {QUICK_TEMPLATES.map(t => (
          <button
            key={t.name}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-text-muted hover:text-accent hover:border-accent/30 transition-colors"
            onClick={() => createRule.mutate({ name: t.name, severity: t.severity, condition: t.condition, enabled: true, channelIds: [], cooldownMinutes: 15, tags: [] })}
            data-testid={`quick-template-${t.name.replace(/\s+/g, '-').toLowerCase()}`}
          >
            <Shield className="w-3 h-3" /> {t.name}
          </button>
        ))}
      </div>

      {/* Rules table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="rules-table">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4 hidden sm:table-cell">Condition</th>
              <th className="pb-2 pr-4">Severity</th>
              <th className="pb-2 pr-4">Enabled</th>
              <th className="pb-2 pr-4 hidden md:table-cell">Last Triggered</th>
              <th className="pb-2 pr-4 hidden md:table-cell">Count</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ruleList.map((rule: AlertRule) => (
              <tr key={rule.id} className="border-b border-border/50 hover:bg-bg-hover">
                <td className="py-2 pr-4 font-medium text-text-primary text-xs">{rule.name}</td>
                <td className="py-2 pr-4 hidden sm:table-cell text-xs text-text-muted truncate max-w-[200px]">
                  {rule.condition.type}: {String(rule.condition.entity ?? '')} {String(rule.condition.field ?? '')} {String(rule.condition.operator ?? '')} {String(rule.condition.value ?? '')}
                </td>
                <td className="py-2 pr-4"><SeverityBadge severity={rule.severity} /></td>
                <td className="py-2 pr-4">
                  <button
                    className={cn('w-8 h-4 rounded-full transition-colors relative', rule.enabled ? 'bg-sev-low' : 'bg-bg-elevated')}
                    onClick={() => toggleRule.mutate(rule.id)}
                    data-testid={`toggle-rule-${rule.id}`}
                  >
                    <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform', rule.enabled ? 'left-4' : 'left-0.5')} />
                  </button>
                </td>
                <td className="py-2 pr-4 hidden md:table-cell text-xs text-text-muted">
                  {rule.lastTriggeredAt ? timeAgo(rule.lastTriggeredAt) : 'Never'}
                </td>
                <td className="py-2 pr-4 hidden md:table-cell text-xs text-text-muted">{rule.triggerCount}</td>
                <td className="py-2">
                  <button
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-sev-high"
                    onClick={() => deleteRule.mutate(rule.id)}
                    data-testid={`delete-rule-${rule.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {ruleList.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-text-muted text-sm">No alert rules configured</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="create-rule-modal">
          <div className="bg-bg-primary border border-border rounded-xl p-6 w-full max-w-md mx-4 sm:mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Create Alert Rule</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Rule Name</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                  value={newRule.name} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))}
                  placeholder="e.g., Critical IOC detected"
                  data-testid="rule-name-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Entity Type</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                    value={newRule.entityType} onChange={e => setNewRule(r => ({ ...r, entityType: e.target.value }))}
                  >
                    <option value="ioc">IOC</option>
                    <option value="vulnerability">Vulnerability</option>
                    <option value="threat_actor">Threat Actor</option>
                    <option value="feed">Feed</option>
                    <option value="malware">Malware</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Severity</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                    value={newRule.severity} onChange={e => setNewRule(r => ({ ...r, severity: e.target.value as AlertSeverity }))}
                    data-testid="rule-severity-select"
                  >
                    {['critical', 'high', 'medium', 'low', 'info'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Field</label>
                  <input className="w-full px-2 py-2 rounded-lg bg-bg-elevated border border-border text-xs text-text-primary" value={newRule.field} onChange={e => setNewRule(r => ({ ...r, field: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Operator</label>
                  <select className="w-full px-2 py-2 rounded-lg bg-bg-elevated border border-border text-xs text-text-primary" value={newRule.operator} onChange={e => setNewRule(r => ({ ...r, operator: e.target.value }))}>
                    <option value="eq">equals</option><option value="neq">not equals</option>
                    <option value="gt">greater than</option><option value="gte">{'>='}
                    </option>
                    <option value="lt">less than</option><option value="contains">contains</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Value</label>
                  <input className="w-full px-2 py-2 rounded-lg bg-bg-elevated border border-border text-xs text-text-primary" value={newRule.value} onChange={e => setNewRule(r => ({ ...r, value: e.target.value }))} data-testid="rule-value-input" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="px-4 py-2 rounded-lg border border-border text-xs text-text-muted hover:bg-bg-hover" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button
                className="px-4 py-2 rounded-lg bg-accent text-bg-primary text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
                disabled={!newRule.name.trim()}
                onClick={() => {
                  createRule.mutate({
                    name: newRule.name, severity: newRule.severity, enabled: true,
                    condition: { type: 'threshold', entity: newRule.entityType, field: newRule.field, operator: newRule.operator, value: newRule.value },
                    channelIds: [], cooldownMinutes: 15, tags: [],
                  })
                  setShowCreateModal(false)
                }}
                data-testid="submit-rule-btn"
              >
                Create Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Alert History Sub-Tab ──────────────────────────────────

function AlertHistoryPanel() {
  const [sevFilter, setSevFilter] = useState<AlertSeverity | undefined>()
  const [statusFilter, setStatusFilter] = useState<AlertStatus | undefined>()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: alertsData } = useAlerts(1, sevFilter, statusFilter)
  const ackAlert = useAcknowledgeAlert()
  const resolveAlert = useResolveAlert()
  const bulkAck = useBulkAcknowledge()

  const alerts = (alertsData as { data: Alert[] } | undefined)?.data ?? []

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3" data-testid="alert-history-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary mr-auto">Alert History</h3>

        <select
          className="px-2 py-1 rounded-lg bg-bg-elevated border border-border text-xs text-text-primary"
          value={sevFilter ?? ''} onChange={e => setSevFilter((e.target.value || undefined) as AlertSeverity | undefined)}
          data-testid="severity-filter"
        >
          <option value="">All Severities</option>
          {['critical', 'high', 'medium', 'low', 'info'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          className="px-2 py-1 rounded-lg bg-bg-elevated border border-border text-xs text-text-primary"
          value={statusFilter ?? ''} onChange={e => setStatusFilter((e.target.value || undefined) as AlertStatus | undefined)}
          data-testid="status-filter"
        >
          <option value="">All Statuses</option>
          {['open', 'acknowledged', 'resolved', 'suppressed', 'escalated'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {selectedIds.size > 0 && (
          <button
            className="px-2.5 py-1 rounded-lg bg-sev-medium/20 text-sev-medium text-xs font-medium hover:bg-sev-medium/30"
            onClick={() => { bulkAck.mutate(Array.from(selectedIds)); setSelectedIds(new Set()) }}
            data-testid="bulk-acknowledge-btn"
          >
            Acknowledge ({selectedIds.size})
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="alerts-table">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs">
              <th className="pb-2 pr-2 w-8">
                <input type="checkbox" className="rounded border-border accent-accent"
                  checked={selectedIds.size > 0 && selectedIds.size === alerts.length}
                  onChange={e => setSelectedIds(e.target.checked ? new Set(alerts.map((a: Alert) => a.id)) : new Set())}
                />
              </th>
              <th className="pb-2 pr-4">Time</th>
              <th className="pb-2 pr-4">Rule</th>
              <th className="pb-2 pr-4">Severity</th>
              <th className="pb-2 pr-4 hidden sm:table-cell">Entity</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert: Alert) => (
              <React.Fragment key={alert.id}>
                <tr
                  className={cn('border-b border-border/50 hover:bg-bg-hover cursor-pointer', expandedId === alert.id && 'bg-bg-hover')}
                  onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                >
                  <td className="py-2 pr-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="rounded border-border accent-accent"
                      checked={selectedIds.has(alert.id)} onChange={() => toggleSelect(alert.id)}
                    />
                  </td>
                  <td className="py-2 pr-4 text-xs text-text-muted whitespace-nowrap">{fmtDateTime(alert.createdAt)}</td>
                  <td className="py-2 pr-4 text-xs text-text-primary font-medium truncate max-w-[150px]">{alert.ruleName}</td>
                  <td className="py-2 pr-4"><SeverityBadge severity={alert.severity} /></td>
                  <td className="py-2 pr-4 hidden sm:table-cell text-xs text-text-muted truncate max-w-[150px]">{alert.title}</td>
                  <td className="py-2 pr-4"><StatusBadge status={alert.status} /></td>
                  <td className="py-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {alert.status === 'open' && (
                        <button className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-sev-medium" title="Acknowledge"
                          onClick={() => ackAlert.mutate(alert.id)} data-testid={`ack-${alert.id}`}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(alert.status === 'open' || alert.status === 'acknowledged') && (
                        <button className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-sev-low" title="Resolve"
                          onClick={() => resolveAlert.mutate(alert.id)} data-testid={`resolve-${alert.id}`}>
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === alert.id && (
                  <tr className="bg-bg-hover/50">
                    <td colSpan={7} className="px-4 py-3" data-testid={`alert-detail-${alert.id}`}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-text-muted">Description</span>
                          <p className="text-text-primary mt-0.5">{alert.description || '—'}</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Acknowledged</span>
                          <p className="text-text-primary mt-0.5">{alert.acknowledgedBy ? `${alert.acknowledgedBy} at ${fmtDateTime(alert.acknowledgedAt!)}` : 'Not yet'}</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Resolved</span>
                          <p className="text-text-primary mt-0.5">{alert.resolvedBy ? `${alert.resolvedBy} at ${fmtDateTime(alert.resolvedAt!)}` : 'Not yet'}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {alerts.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-text-muted text-sm">No alerts found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Report Templates Sub-Tab ────────────────────────────────

function ReportTemplatesPanel() {
  const { data: templates } = useReportTemplates()
  const templateList = (templates as ReportTemplate[] | undefined) ?? []

  const TYPE_COLORS: Record<string, string> = {
    executive: 'text-violet-400 bg-violet-400/10',
    daily: 'text-sev-low bg-sev-low/10',
    weekly: 'text-accent bg-accent/10',
    monthly: 'text-sev-medium bg-sev-medium/10',
    custom: 'text-text-muted bg-bg-elevated',
  }

  return (
    <div className="space-y-4" data-testid="report-templates-panel">
      <h3 className="text-sm font-semibold text-text-primary">Report Templates</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="template-cards">
        {templateList.map((t: ReportTemplate) => (
          <div key={t.id} className="p-3 rounded-lg border border-border bg-bg-elevated hover:border-border-hover transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-accent shrink-0" />
              <span className="text-xs font-semibold text-text-primary truncate">{t.name}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ml-auto shrink-0', TYPE_COLORS[t.type] ?? '')}>
                {t.type}
              </span>
            </div>
            <p className="text-[11px] text-text-muted mb-2 line-clamp-2">{t.description}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {t.sections.slice(0, 4).map(s => (
                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-hover text-text-muted">{s}</span>
              ))}
              {t.sections.length > 4 && <span className="text-[9px] text-text-muted">+{t.sections.length - 4}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <button className="flex-1 py-1.5 rounded-lg border border-border text-[10px] text-text-muted hover:text-accent hover:border-accent/30 transition-colors flex items-center justify-center gap-1">
                <Copy className="w-3 h-3" /> Clone
              </button>
              <button className="flex-1 py-1.5 rounded-lg border border-border text-[10px] text-text-muted hover:text-accent hover:border-accent/30 transition-colors flex items-center justify-center gap-1">
                <Play className="w-3 h-3" /> Generate
              </button>
            </div>
          </div>
        ))}
        {templateList.length === 0 && (
          <div className="col-span-full py-8 text-center text-text-muted text-sm">No templates available</div>
        )}
      </div>
    </div>
  )
}

// ─── Generate & Schedule Sub-Tab ─────────────────────────────

function GenerateSchedulePanel() {
  const { data: schedules } = useReportSchedules()
  const { data: reportsData } = useReports(1)
  const createReport = useCreateReport()
  const createSchedule = useCreateSchedule()
  const [showGenModal, setShowGenModal] = useState(false)
  const [showSchedModal, setShowSchedModal] = useState(false)
  const [genForm, setGenForm] = useState({ type: 'daily' as ReportType, format: 'pdf' as ReportFormat, title: '' })
  const [schedForm, setSchedForm] = useState({ name: '', type: 'weekly' as ReportType, format: 'pdf' as ReportFormat, cron: '0 9 * * 1', recipients: '' })

  const scheduleList = (schedules as ReportSchedule[] | undefined) ?? []
  const recentReports = ((reportsData as { data: unknown[] } | undefined)?.data ?? []).slice(0, 10)

  return (
    <div className="space-y-4" data-testid="generate-schedule-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary mr-auto">Generate & Schedule</h3>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-bg-primary text-xs font-medium hover:bg-accent/90"
          onClick={() => setShowGenModal(true)}
          data-testid="generate-report-btn"
        >
          <Play className="w-3 h-3" /> Generate Report
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-accent hover:border-accent/30"
          onClick={() => setShowSchedModal(true)}
          data-testid="create-schedule-btn"
        >
          <Calendar className="w-3 h-3" /> New Schedule
        </button>
      </div>

      {/* Scheduled reports */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Active Schedules</h4>
        {scheduleList.length === 0 && <p className="text-xs text-text-muted">No schedules configured</p>}
        {scheduleList.map((s: ReportSchedule) => (
          <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-elevated border border-border">
            <Calendar className="w-4 h-4 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">{s.name}</p>
              <p className="text-[10px] text-text-muted">{s.type} · {s.format.toUpperCase()} · {s.cronExpression}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {s.nextRunAt && <span className="text-[10px] text-text-muted hidden sm:block">Next: {fmtDate(s.nextRunAt)}</span>}
              <span className={cn('w-2 h-2 rounded-full', s.enabled ? 'bg-sev-low' : 'bg-bg-hover')} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent reports */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Recent Reports</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="recent-reports-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted text-xs">
                <th className="pb-2 pr-4">Title</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Format</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Download</th>
              </tr>
            </thead>
            <tbody>
              {(recentReports as Array<{ id: string; title: string; type: string; format: string; status: string }>).map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-bg-hover">
                  <td className="py-2 pr-4 text-xs text-text-primary font-medium truncate max-w-[200px]">{r.title}</td>
                  <td className="py-2 pr-4 text-xs text-text-muted capitalize">{r.type}</td>
                  <td className="py-2 pr-4 text-xs text-text-muted uppercase">{r.format}</td>
                  <td className="py-2 pr-4"><StatusBadge status={r.status} /></td>
                  <td className="py-2">
                    {r.status === 'completed' && (
                      <button className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent" data-testid={`download-report-${r.id}`}>
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="generate-report-modal">
          <div className="bg-bg-primary border border-border rounded-xl p-6 w-full max-w-md mx-4 sm:mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Generate Report</h3>
              <button onClick={() => setShowGenModal(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Title</label>
                <input className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                  value={genForm.title} onChange={e => setGenForm(f => ({ ...f, title: e.target.value }))} placeholder="Report title" data-testid="report-title-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Type</label>
                  <select className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                    value={genForm.type} onChange={e => setGenForm(f => ({ ...f, type: e.target.value as ReportType }))}>
                    {['daily', 'weekly', 'monthly', 'executive', 'custom'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Format</label>
                  <select className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                    value={genForm.format} onChange={e => setGenForm(f => ({ ...f, format: e.target.value as ReportFormat }))} data-testid="report-format-select">
                    {['pdf', 'html', 'csv', 'json'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-4 py-2 rounded-lg border border-border text-xs text-text-muted hover:bg-bg-hover" onClick={() => setShowGenModal(false)}>Cancel</button>
              <button
                className="px-4 py-2 rounded-lg bg-accent text-bg-primary text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
                disabled={!genForm.title.trim()}
                onClick={() => {
                  createReport.mutate({ type: genForm.type, format: genForm.format, title: genForm.title })
                  setShowGenModal(false)
                }}
                data-testid="submit-report-btn"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showSchedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="create-schedule-modal">
          <div className="bg-bg-primary border border-border rounded-xl p-6 w-full max-w-md mx-4 sm:mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Create Schedule</h3>
              <button onClick={() => setShowSchedModal(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Schedule Name</label>
                <input className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                  value={schedForm.name} onChange={e => setSchedForm(f => ({ ...f, name: e.target.value }))} placeholder="Weekly Threat Brief" data-testid="schedule-name-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Type</label>
                  <select className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                    value={schedForm.type} onChange={e => setSchedForm(f => ({ ...f, type: e.target.value as ReportType }))}>
                    {['daily', 'weekly', 'monthly', 'executive'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Format</label>
                  <select className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-primary"
                    value={schedForm.format} onChange={e => setSchedForm(f => ({ ...f, format: e.target.value as ReportFormat }))}>
                    {['pdf', 'html', 'csv'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Frequency (cron)</label>
                <div className="flex gap-2">
                  {[
                    { label: 'Daily 9am', cron: '0 9 * * *' },
                    { label: 'Weekly Mon', cron: '0 9 * * 1' },
                    { label: 'Monthly 1st', cron: '0 9 1 * *' },
                  ].map(p => (
                    <button key={p.label}
                      className={cn('px-2 py-1 rounded-lg border text-[10px]', schedForm.cron === p.cron ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-muted hover:border-accent/30')}
                      onClick={() => setSchedForm(f => ({ ...f, cron: p.cron }))}
                    >{p.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-4 py-2 rounded-lg border border-border text-xs text-text-muted hover:bg-bg-hover" onClick={() => setShowSchedModal(false)}>Cancel</button>
              <button
                className="px-4 py-2 rounded-lg bg-accent text-bg-primary text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
                disabled={!schedForm.name.trim()}
                onClick={() => {
                  createSchedule.mutate({ name: schedForm.name, type: schedForm.type, format: schedForm.format, cronExpression: schedForm.cron, enabled: true })
                  setShowSchedModal(false)
                }}
                data-testid="submit-schedule-btn"
              >
                Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────

export function AlertsReportsTab({ data }: AlertsReportsTabProps) {
  const { isSuperAdmin } = data
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('rules')

  const pills: PillItem[] = useMemo(() => [
    { id: 'rules', label: 'Alert Rules' },
    { id: 'history', label: 'Alert History' },
    { id: 'templates', label: 'Report Templates' },
    { id: 'generate', label: 'Generate & Schedule' },
  ], [])

  const effectiveSubTab = pills.find(p => p.id === activeSubTab) ? activeSubTab : 'rules'

  return (
    <div className="space-y-4" data-testid="alerts-reports-tab">
      <PillSwitcher items={pills} activeId={effectiveSubTab} onChange={id => setActiveSubTab(id as SubTab)} />

      {effectiveSubTab === 'rules' && <AlertRulesPanel isSuperAdmin={isSuperAdmin} />}
      {effectiveSubTab === 'history' && <AlertHistoryPanel />}
      {effectiveSubTab === 'templates' && <ReportTemplatesPanel />}
      {effectiveSubTab === 'generate' && <GenerateSchedulePanel />}
    </div>
  )
}
