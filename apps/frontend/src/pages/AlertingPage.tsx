/** Alerting dashboard — 4 tabs: Rules, Alerts, Channels, Escalation Policies. Port 3023 via nginx. */
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  useAlertRules, useAlerts, useAlertStats, useNotificationChannels,
  useEscalationPolicies, useAlertTemplates,
  useToggleRule, useDeleteRule, useApplyTemplate,
  useAcknowledgeAlert, useResolveAlert, useEscalateAlert,
  useBulkAcknowledge, useBulkResolve,
  useDeleteChannel, useTestChannel,
  useCreateEscalation, useDeleteEscalation,
  type AlertSeverity, type AlertStatus, type ChannelType,
} from '@/hooks/use-alerting-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { HistoryDrawer, NewChannelModal } from './alerting-modals'
import {
  Bell, ShieldAlert, Radio, GitMerge, Plus, Trash2, Play, CheckCircle2,
  Eye, EyeOff, ArrowUpCircle, Search, Mail, MessageSquare, Webhook,
  Clock, ChevronRight, ToggleLeft, ToggleRight,
} from 'lucide-react'

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const SEV_COLORS: Record<AlertSeverity, string> = {
  critical: 'text-sev-critical bg-sev-critical/10', high: 'text-sev-high bg-sev-high/10',
  medium: 'text-sev-medium bg-sev-medium/10', low: 'text-sev-low bg-sev-low/10', info: 'text-text-muted bg-bg-elevated',
}
const STATUS_ICONS: Record<AlertStatus, React.FC<{ className?: string }>> = {
  open: Bell, acknowledged: Eye, resolved: CheckCircle2, suppressed: EyeOff, escalated: ArrowUpCircle,
}
const CHANNEL_ICONS: Record<ChannelType, React.FC<{ className?: string }>> = {
  email: Mail, slack: MessageSquare, webhook: Webhook,
}

function Badge({ label, className }: { label: string; className?: string }) {
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap', className)}>{label}</span>
}

type AlertingTab = 'rules' | 'alerts' | 'channels' | 'escalations'
const TABS: { key: AlertingTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'rules', label: 'Alert Rules', icon: ShieldAlert },
  { key: 'alerts', label: 'Alerts', icon: Bell },
  { key: 'channels', label: 'Channels', icon: Radio },
  { key: 'escalations', label: 'Escalation Policies', icon: GitMerge },
]

export function AlertingPage() {
  const [activeTab, setActiveTab] = useState<AlertingTab>('rules')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [historyAlertId, setHistoryAlertId] = useState<string | null>(null)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sevFilter, setSevFilter] = useState<AlertSeverity | ''>('')
  const [statusFilter, setStatusFilter] = useState<AlertStatus | ''>('')

  const { data: rules, isDemo } = useAlertRules()
  const { data: alertsResp } = useAlerts(1, sevFilter || undefined, statusFilter || undefined)
  const { data: stats } = useAlertStats()
  const { data: channels } = useNotificationChannels()
  const { data: escalations } = useEscalationPolicies()
  const { data: templates } = useAlertTemplates()

  const toggleRule = useToggleRule()
  const deleteRule = useDeleteRule()
  const applyTemplate = useApplyTemplate()
  const ackAlert = useAcknowledgeAlert()
  const resolveAlert = useResolveAlert()
  const escalateAlert = useEscalateAlert()
  const bulkAck = useBulkAcknowledge()
  const bulkResolve = useBulkResolve()
  const deleteChannel = useDeleteChannel()
  const testChannel = useTestChannel()
  const createEscalation = useCreateEscalation()
  const deleteEscalation = useDeleteEscalation()

  const ruleList = rules ?? []
  const alertList = alertsResp?.data ?? []
  const channelList = channels ?? []
  const escalationList = escalations ?? []
  const templateList = templates ?? []

  const filteredAlerts = searchQuery
    ? alertList.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.ruleName.toLowerCase().includes(searchQuery.toLowerCase()))
    : alertList

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stats bar */}
      <PageStatsBar title="Alerting" isDemo={isDemo}>
        <CompactStat label="Total" value={stats ? String(stats.total) : '—'} />
        <CompactStat label="Open" value={stats ? String(stats.open) : '—'} highlight={!!stats?.open} />
        <CompactStat label="Acknowledged" value={stats ? String(stats.acknowledged) : '—'} />
        <CompactStat label="Escalated" value={stats ? String(stats.escalated) : '—'} highlight={!!stats?.escalated} />
        <CompactStat label="Avg Resolution" value={stats ? `${stats.avgResolutionMinutes}m` : '—'} />
      </PageStatsBar>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-4 border-b border-border-subtle">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setSelected(new Set()) }}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Rules tab ── */}
        {activeTab === 'rules' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-text-secondary">Templates:</span>
              {templateList.slice(0, 4).map(t => (
                <button key={t.id} onClick={() => applyTemplate.mutate(t.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-border-subtle text-text-muted hover:text-accent hover:border-accent/40 transition-colors">
                  + {t.name}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-text-muted">{ruleList.filter(r => r.enabled).length}/{ruleList.length} active</span>
            </div>
            <div className="bg-bg-elevated rounded-lg border border-border-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Rule</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Severity</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden sm:table-cell">Type</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Enabled</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden md:table-cell">Triggers</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden lg:table-cell">Last Triggered</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruleList.map(r => (
                      <tr key={r.id} className="border-b border-border-subtle/50 hover:bg-bg-primary/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="text-text-primary font-medium">{r.name}</p>
                          <p className="text-[10px] text-text-muted mt-0.5 hidden sm:block">{r.description}</p>
                        </td>
                        <td className="px-4 py-2.5"><Badge label={r.severity} className={SEV_COLORS[r.severity]} /></td>
                        <td className="px-4 py-2.5 text-text-muted hidden sm:table-cell">{r.condition.type}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => toggleRule.mutate(r.id)} title={r.enabled ? 'Disable' : 'Enable'}
                            className={cn('transition-colors', r.enabled ? 'text-sev-low' : 'text-text-muted')}>
                            {r.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-text-secondary hidden md:table-cell">{r.triggerCount}</td>
                        <td className="px-4 py-2.5 text-text-muted hidden lg:table-cell whitespace-nowrap">{r.lastTriggeredAt ? fmtDate(r.lastTriggeredAt) : '—'}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => deleteRule.mutate(r.id)} title="Delete rule"
                            className="p-1 rounded hover:bg-sev-critical/10 text-text-muted hover:text-sev-critical transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ruleList.length === 0 && <div className="px-4 py-8 text-center text-xs text-text-muted">No alert rules. Use a template above to create one.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Alerts tab ── */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search alerts…"
                  className="pl-8 pr-3 py-1.5 text-xs bg-bg-primary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:border-accent outline-none w-48" />
              </div>
              {/* Severity filter */}
              <select value={sevFilter} onChange={e => setSevFilter(e.target.value as AlertSeverity | '')}
                className="text-xs bg-bg-primary border border-border-subtle rounded-lg px-2 py-1.5 text-text-secondary focus:border-accent outline-none">
                <option value="">All severities</option>
                {(['critical', 'high', 'medium', 'low', 'info'] as const).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {/* Status filter */}
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as AlertStatus | '')}
                className="text-xs bg-bg-primary border border-border-subtle rounded-lg px-2 py-1.5 text-text-secondary focus:border-accent outline-none">
                <option value="">All statuses</option>
                {(['open', 'acknowledged', 'resolved', 'suppressed', 'escalated'] as const).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {/* Bulk actions */}
              {selected.size > 0 && (
                <>
                  <button onClick={() => bulkAck.mutate([...selected], { onSuccess: () => setSelected(new Set()) })}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors">
                    <Eye className="w-3 h-3" /> Ack ({selected.size})
                  </button>
                  <button onClick={() => bulkResolve.mutate([...selected], { onSuccess: () => setSelected(new Set()) })}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-sev-low/40 text-sev-low hover:bg-sev-low/10 transition-colors">
                    <CheckCircle2 className="w-3 h-3" /> Resolve ({selected.size})
                  </button>
                </>
              )}
              <span className="ml-auto text-[11px] text-text-muted">{filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="bg-bg-elevated rounded-lg border border-border-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left px-4 py-3 w-8">
                        <input type="checkbox"
                          checked={selected.size === filteredAlerts.length && filteredAlerts.length > 0}
                          onChange={() => setSelected(prev => prev.size === filteredAlerts.length ? new Set() : new Set(filteredAlerts.map(a => a.id)))}
                          className="accent-accent" />
                      </th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Severity</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Title</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden sm:table-cell">Rule</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium hidden md:table-cell">Created</th>
                      <th className="text-left px-4 py-3 text-text-muted font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map(a => {
                      const StatusIcon = STATUS_ICONS[a.status]
                      return (
                        <tr key={a.id} className={cn(
                          'border-b border-border-subtle/50 hover:bg-bg-primary/50 transition-colors',
                          selected.has(a.id) && 'bg-accent/5',
                        )}>
                          <td className="px-4 py-2.5">
                            <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="accent-accent" />
                          </td>
                          <td className="px-4 py-2.5"><Badge label={a.severity} className={SEV_COLORS[a.severity]} /></td>
                          <td className="px-4 py-2.5 text-text-primary font-medium max-w-[250px] truncate" title={a.title}>{a.title}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                              <StatusIcon className="w-3 h-3" /> {a.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-text-muted hidden sm:table-cell">{a.ruleName}</td>
                          <td className="px-4 py-2.5 text-text-muted hidden md:table-cell whitespace-nowrap">{fmtDate(a.createdAt)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-0.5">
                              {a.status === 'open' && (
                                <>
                                  <button onClick={() => ackAlert.mutate(a.id)} title="Acknowledge"
                                    className="p-1 rounded hover:bg-accent/10 text-text-muted hover:text-accent transition-colors">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => escalateAlert.mutate(a.id)} title="Escalate"
                                    className="p-1 rounded hover:bg-sev-high/10 text-text-muted hover:text-sev-high transition-colors">
                                    <ArrowUpCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {(a.status === 'open' || a.status === 'acknowledged' || a.status === 'escalated') && (
                                <button onClick={() => resolveAlert.mutate(a.id)} title="Resolve"
                                  className="p-1 rounded hover:bg-sev-low/10 text-text-muted hover:text-sev-low transition-colors">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => setHistoryAlertId(a.id)} title="View history"
                                className="p-1 rounded hover:bg-bg-primary text-text-muted hover:text-text-primary transition-colors">
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredAlerts.length === 0 && <div className="px-4 py-8 text-center text-xs text-text-muted">No alerts match your filters.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Channels tab ── */}
        {activeTab === 'channels' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowNewChannel(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
                <Plus className="w-3.5 h-3.5" /> New Channel
              </button>
              <span className="ml-auto text-[11px] text-text-muted">{channelList.filter(c => c.enabled).length}/{channelList.length} active</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {channelList.map(ch => {
                const Icon = CHANNEL_ICONS[ch.type]
                return (
                  <div key={ch.id} className="bg-bg-elevated border border-border-subtle rounded-lg p-4 hover:border-accent/30 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-accent" />
                        <h4 className="text-xs font-semibold text-text-primary">{ch.name}</h4>
                      </div>
                      <Badge label={ch.type} className="text-text-muted bg-bg-primary" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-text-muted mt-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full', ch.enabled ? 'bg-sev-low' : 'bg-text-muted')} />
                      <span>{ch.enabled ? 'Active' : 'Disabled'}</span>
                      {ch.lastTestedAt && (
                        <span className="ml-auto">
                          Last test: <span className={ch.lastTestSuccess ? 'text-sev-low' : 'text-sev-critical'}>{ch.lastTestSuccess ? 'Pass' : 'Fail'}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-3 pt-3 border-t border-border-subtle">
                      <button onClick={() => testChannel.mutate(ch.id)} title="Send test"
                        className="flex items-center gap-1 text-[11px] text-accent hover:underline">
                        <Play className="w-3 h-3" /> Test
                      </button>
                      <button onClick={() => deleteChannel.mutate(ch.id)} title="Delete"
                        className="ml-auto p-1 rounded hover:bg-sev-critical/10 text-text-muted hover:text-sev-critical transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            {channelList.length === 0 && <div className="px-4 py-8 text-center text-xs text-text-muted">No notification channels. Create one to receive alerts.</div>}
          </div>
        )}

        {/* ── Escalation Policies tab ── */}
        {activeTab === 'escalations' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => createEscalation.mutate({
                name: 'New Escalation Policy', steps: [{ delayMinutes: 0, channelIds: [] }], repeatAfterMinutes: 0, enabled: true,
              } as never)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
                <Plus className="w-3.5 h-3.5" /> New Policy
              </button>
              <span className="ml-auto text-[11px] text-text-muted">{escalationList.filter(e => e.enabled).length}/{escalationList.length} active</span>
            </div>
            {escalationList.map(esc => (
              <div key={esc.id} className="bg-bg-elevated border border-border-subtle rounded-lg p-4 hover:border-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GitMerge className="w-4 h-4 text-accent" />
                    <h4 className="text-xs font-semibold text-text-primary">{esc.name}</h4>
                    <Badge label={esc.enabled ? 'Active' : 'Disabled'} className={esc.enabled ? 'text-sev-low bg-sev-low/10' : 'text-text-muted bg-bg-primary'} />
                  </div>
                  <button onClick={() => deleteEscalation.mutate(esc.id)} title="Delete policy"
                    className="p-1 rounded hover:bg-sev-critical/10 text-text-muted hover:text-sev-critical transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2">
                  {esc.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <div className="flex items-center gap-1.5 shrink-0 text-text-muted">
                        <span className="w-5 h-5 rounded-full bg-bg-primary border border-border-subtle flex items-center justify-center text-[10px] font-medium">{i + 1}</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                      <div>
                        <p className="text-text-secondary">
                          {step.delayMinutes === 0 ? 'Immediately' : `After ${step.delayMinutes}m`} → {step.channelIds.length} channel{step.channelIds.length !== 1 ? 's' : ''}
                        </p>
                        {step.notifyMessage && <p className="text-[10px] text-text-muted mt-0.5">{step.notifyMessage}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {esc.repeatAfterMinutes > 0 && (
                  <p className="text-[10px] text-text-muted mt-2 pt-2 border-t border-border-subtle">
                    Repeats every {esc.repeatAfterMinutes} minutes
                  </p>
                )}
              </div>
            ))}
            {escalationList.length === 0 && <div className="px-4 py-8 text-center text-xs text-text-muted">No escalation policies. Create one to auto-escalate unresolved alerts.</div>}
          </div>
        )}
      </div>

      {/* Modals / Drawers */}
      <NewChannelModal open={showNewChannel} onClose={() => setShowNewChannel(false)} />
      {historyAlertId && <HistoryDrawer alertId={historyAlertId} onClose={() => setHistoryAlertId(null)} />}
    </div>
  )
}
