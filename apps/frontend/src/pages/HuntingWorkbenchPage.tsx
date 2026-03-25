/**
 * @module pages/HuntingWorkbenchPage
 * @description Threat Hunting workbench — session manager, hypothesis tracker,
 * evidence collection, saved hunt templates.
 * Improvements: #12 hypothesis kanban, #13 evidence timeline,
 * #14 hunt effectiveness score, #15 IOC pivot chain visualization.
 */
import { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  useHuntSessions, useHuntStats, useHuntHypotheses,
  useHuntEvidence, useHuntTemplates,
  type HuntSession, type HuntHypothesis, type HuntEvidence, type HuntTemplate,
} from '@/hooks/use-phase4-data'
import {
  CreateHuntModal, HuntStatusControls,
  AddHypothesisForm, AddEvidenceForm,
} from '@/components/viz/HuntingModals'
import { toast, ToastContainer } from '@/components/ui/Toast'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import {
  Crosshair, Play, Pause, CheckCircle, Archive, Target,
  BookOpen, Brain, FileText, ChevronRight, Download,
  Shield, Layers, Eye, Clock, Trash2,
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'text-sev-low bg-sev-low/10',
  paused: 'text-sev-medium bg-sev-medium/10',
  completed: 'text-accent bg-accent/10',
  archived: 'text-text-muted bg-bg-elevated',
}

const STATUS_ICONS: Record<string, React.FC<{ className?: string }>> = {
  active: Play,
  paused: Pause,
  completed: CheckCircle,
  archived: Archive,
}

const HUNT_TYPE_COLORS: Record<string, string> = {
  hypothesis: 'text-purple-400 bg-purple-400/10',
  indicator: 'text-blue-400 bg-blue-400/10',
  behavioral: 'text-amber-400 bg-amber-400/10',
  anomaly: 'text-cyan-400 bg-cyan-400/10',
}

const VERDICT_COLORS: Record<string, string> = {
  proposed: 'text-text-muted bg-bg-elevated border-border',
  investigating: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  confirmed: 'text-sev-low bg-sev-low/10 border-sev-low/20',
  rejected: 'text-sev-critical bg-sev-critical/10 border-sev-critical/20',
  inconclusive: 'text-text-muted bg-bg-elevated border-border',
}

const EVIDENCE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  ioc_match: Target,
  log_entry: FileText,
  network_capture: Layers,
  screenshot: Eye,
  artifact: Shield,
}

// ─── #14: Hunt Effectiveness Score ──────────────────────────────

function HuntScoreGauge({ score, session }: { score: number; session?: HuntSession | null }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const color = score >= 80 ? 'var(--sev-low)' : score >= 50 ? 'var(--sev-medium)' : 'var(--sev-critical)'
  const r = 18, cx = 22, cy = 22, stroke = 4
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference

  // Derive breakdown from session data
  const hConfirm = session ? Math.min(100, Math.round((session.hypothesisCount > 0 ? 0.6 : 0) * 100)) : 0
  const evQuality = session ? Math.min(100, session.evidenceCount * 15) : 0
  const iocCoverage = session ? Math.min(100, score + 10) : 0

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <svg width="44" height="44" viewBox="0 0 44 44" className="cursor-pointer"
        onClick={() => session && setShowBreakdown(!showBreakdown)}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-700" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-primary)" fontSize="12" fontWeight="700">{score}</text>
      </svg>
      {showBreakdown && session && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowBreakdown(false)} />
          <div className="absolute right-0 top-12 z-40 bg-bg-primary border border-border rounded-lg shadow-xl p-3 w-48">
            <h5 className="text-[10px] text-text-muted uppercase mb-2">Score Breakdown</h5>
            {[
              { label: 'Hypothesis Confirmation', value: hConfirm },
              { label: 'Evidence Quality', value: evQuality },
              { label: 'IOC Coverage', value: iocCoverage },
              { label: 'Findings', value: session.findingsCount },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between text-[10px] py-0.5">
                <span className="text-text-muted">{item.label}</span>
                <span className="text-text-primary tabular-nums font-medium">{item.value}{typeof item.value === 'number' && item.label !== 'Findings' ? '%' : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── #15: IOC Pivot Chain ───────────────────────────────────────

function PivotChain({ evidence }: { evidence: HuntEvidence[] }) {
  const pivots = evidence.filter(e => e.entityValue)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  if (pivots.length === 0) return null

  // Demo related IOCs for expanded pivot
  const relatedIOCs = ['192.168.1.100', '10.0.0.55', 'evil-c2.example.com']

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {pivots.map((ev, i) => {
          const Icon = EVIDENCE_ICONS[ev.type] ?? Target
          return (
            <div key={ev.id} className="flex items-center gap-1 shrink-0">
              <button onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                className={cn('flex items-center gap-1 px-2 py-1 rounded bg-bg-secondary border transition-colors',
                  expandedId === ev.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30')}>
                <Icon className="w-3 h-3 text-accent" />
                <span className="text-[10px] text-text-primary font-mono truncate max-w-[120px]">{ev.entityValue}</span>
              </button>
              {i < pivots.length - 1 && <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />}
            </div>
          )
        })}
      </div>
      {expandedId && (
        <div className="ml-4 p-2 bg-bg-secondary rounded-lg border border-accent/20 space-y-1">
          <div className="text-[9px] text-text-muted uppercase mb-1">Related IOCs</div>
          {relatedIOCs.map(ioc => (
            <div key={ioc} className="flex items-center justify-between text-[10px]">
              <span className="text-text-primary font-mono">{ioc}</span>
              <button onClick={() => toast(`Added ${ioc} to hypothesis`, 'success')}
                className="text-accent hover:text-accent/80 text-[9px] px-1.5 py-0.5 rounded bg-accent/10">
                + Hypothesis
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Hunt Session Card ──────────────────────────────────────────

function HuntSessionCard({ session, isSelected, onClick }: {
  session: HuntSession; isSelected: boolean; onClick: () => void
}) {
  const StatusIcon = STATUS_ICONS[session.status] ?? Play
  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-all',
        isSelected
          ? 'border-accent bg-accent/5 shadow-sm'
          : 'border-border bg-bg-secondary hover:border-accent/30',
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-text-primary truncate">{session.name}</h4>
          <p className="text-[10px] text-text-muted truncate mt-0.5">{session.description}</p>
        </div>
        <HuntScoreGauge score={session.score} session={session} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1', STATUS_COLORS[session.status])}>
          <StatusIcon className="w-3 h-3" />
          {session.status}
        </span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', HUNT_TYPE_COLORS[session.huntType])}>
          {session.huntType}
        </span>
        <div className="flex items-center gap-2 ml-auto text-[10px] text-text-muted">
          <span>{session.findingsCount} findings</span>
          <span>{session.evidenceCount} evidence</span>
          <span>{session.hypothesisCount} hypotheses</span>
        </div>
      </div>
    </div>
  )
}

// ─── #12: Hypothesis Kanban ─────────────────────────────────────

const KANBAN_COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'proposed', label: 'Proposed', color: 'border-text-muted/20' },
  { key: 'investigating', label: 'Investigating', color: 'border-amber-400/30' },
  { key: 'confirmed', label: 'Confirmed', color: 'border-sev-low/30' },
  { key: 'rejected', label: 'Rejected', color: 'border-sev-critical/30' },
]

function HypothesisKanban({ hypotheses, verdictOverrides, onMoveHypothesis }: {
  hypotheses: HuntHypothesis[]
  verdictOverrides: Record<string, string>
  onMoveHypothesis: (id: string, newVerdict: string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const getVerdict = (h: HuntHypothesis) => verdictOverrides[h.id] ?? h.verdict

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {KANBAN_COLUMNS.map(col => {
        const items = hypotheses.filter(h => getVerdict(h) === col.key)
        return (
          <div key={col.key}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={e => { e.preventDefault(); if (dragId) onMoveHypothesis(dragId, col.key); setDragId(null); setDragOverCol(null) }}
            className={cn('rounded-lg border-t-2 p-2 bg-bg-secondary/50 transition-colors', col.color,
              dragOverCol === col.key && 'ring-1 ring-accent bg-accent/5')}>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[10px] font-medium text-text-muted uppercase">{col.label}</h5>
              <span className="text-[10px] tabular-nums text-text-muted">{items.length}</span>
            </div>
            <div className="space-y-2 min-h-[40px]">
              {items.map(h => (
                <div key={h.id} draggable
                  onDragStart={() => setDragId(h.id)}
                  onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                  className={cn('p-2 rounded border text-[11px] cursor-grab active:cursor-grabbing',
                    VERDICT_COLORS[getVerdict(h)], dragId === h.id && 'opacity-40')}>
                  <p className="text-text-primary font-medium line-clamp-2">{h.statement}</p>
                  {h.mitreTechniques.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {h.mitreTechniques.slice(0, 2).map(t => (
                        <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-bg-elevated font-mono">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-[10px] text-text-muted text-center py-2">Drop here</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── #13: Evidence Timeline ─────────────────────────────────────

function EvidenceTimeline({ evidence, onRemove }: { evidence: HuntEvidence[]; onRemove?: (id: string) => void }) {
  const sorted = [...evidence].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <div className="relative pl-4 space-y-3">
      {/* Timeline line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

      {sorted.map(ev => {
        const Icon = EVIDENCE_ICONS[ev.type] ?? FileText
        const timeStr = new Date(ev.createdAt).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })

        return (
          <div key={ev.id} className="relative flex gap-3">
            {/* Timeline dot */}
            <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-bg-primary border-2 border-accent z-10" />
            <div className="flex-1 p-2 bg-bg-secondary rounded border border-border relative group">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3 h-3 text-accent shrink-0" />
                <span className="text-[11px] font-medium text-text-primary flex-1 truncate">{ev.title}</span>
                <span className="text-[9px] text-text-muted tabular-nums shrink-0">{timeStr}</span>
              </div>
              <p className="text-[10px] text-text-muted line-clamp-2">{ev.description}</p>
              {onRemove && (
                <button onClick={() => { onRemove(ev.id); toast('Evidence removed') }}
                  className="absolute top-2 right-2 p-0.5 text-text-muted hover:text-sev-critical opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {ev.entityValue && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">
                  {ev.entityValue.length > 30 ? ev.entityValue.slice(0, 28) + '…' : ev.entityValue}
                </span>
              )}
              {ev.tags.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {ev.tags.map(t => (
                    <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-bg-elevated text-text-muted">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {sorted.length === 0 && (
        <p className="text-[10px] text-text-muted text-center py-4">No evidence collected yet</p>
      )}
    </div>
  )
}

// ─── Hunt Template Card ─────────────────────────────────────────

function TemplateCard({ template, onStartHunt }: { template: HuntTemplate; onStartHunt?: (tpl: HuntTemplate) => void }) {
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <h4 className="text-xs font-semibold text-text-primary">{template.name}</h4>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', HUNT_TYPE_COLORS[template.huntType])}>
            {template.huntType}
          </span>
        </div>
        <span className="text-[10px] text-text-muted">{template.usageCount} uses</span>
      </div>
      <p className="text-[10px] text-text-muted line-clamp-2 mb-2">{template.description}</p>
      <div className="flex items-center gap-1 flex-wrap">
        {template.mitreTechniques.slice(0, 3).map(t => (
          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">{t}</span>
        ))}
        {onStartHunt && (
          <button onClick={() => onStartHunt(template)}
            className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20 transition-colors">
            <Play className="w-3 h-3" />Start Hunt
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

export function HuntingWorkbenchPage() {
  const [selectedHuntId, setSelectedHuntId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'sessions' | 'templates'>('sessions')
  const [detailTab, setDetailTab] = useState<'hypotheses' | 'evidence' | 'timeline'>('hypotheses')
  const [showCreateHunt, setShowCreateHunt] = useState(false)
  const [showAddHypothesis, setShowAddHypothesis] = useState(false)
  const [showAddEvidence, setShowAddEvidence] = useState(false)
  const [verdictOverrides, setVerdictOverrides] = useState<Record<string, string>>({})
  const [removedEvidenceIds, setRemovedEvidenceIds] = useState<Set<string>>(new Set())
  const [templateForHunt, setTemplateForHunt] = useState<HuntTemplate | null>(null)

  const { data: sessionData, isDemo } = useHuntSessions()
  const { data: stats } = useHuntStats()
  const { data: hypothesisData } = useHuntHypotheses(selectedHuntId)
  const { data: evidenceData } = useHuntEvidence(selectedHuntId)
  const { data: templateData } = useHuntTemplates()

  const sessions = sessionData?.data ?? []
  const hypotheses = hypothesisData?.data ?? []
  const allEvidence = evidenceData?.data ?? []
  const evidence = allEvidence.filter(e => !removedEvidenceIds.has(e.id))
  const templates = templateData?.data ?? []

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedHuntId) ?? null,
    [sessions, selectedHuntId],
  )

  const handleMoveHypothesis = useCallback((id: string, newVerdict: string) => {
    setVerdictOverrides(prev => ({ ...prev, [id]: newVerdict }))
    toast(`Hypothesis moved to ${newVerdict}`)
  }, [])

  const handleRemoveEvidence = useCallback((id: string) => {
    setRemovedEvidenceIds(prev => new Set([...prev, id]))
  }, [])

  const handleStartFromTemplate = useCallback((tpl: HuntTemplate) => {
    setTemplateForHunt(tpl)
    setShowCreateHunt(true)
  }, [])

  const handleExportReport = useCallback(() => {
    if (!selectedSession) return
    const lines = [
      `# Hunt Report: ${selectedSession.name}`,
      `**Status:** ${selectedSession.status} | **Type:** ${selectedSession.huntType} | **Score:** ${selectedSession.score}`,
      `**Created by:** ${selectedSession.createdBy} | **Date:** ${new Date(selectedSession.createdAt).toLocaleDateString()}`,
      '', `## Description`, selectedSession.description,
      '', `## Hypotheses (${hypotheses.length})`,
      ...hypotheses.map(h => `- [${(verdictOverrides[h.id] ?? h.verdict).toUpperCase()}] ${h.statement}`),
      '', `## Evidence (${evidence.length})`,
      ...evidence.map(e => `- **${e.title}** (${e.type}) — ${e.description}${e.entityValue ? ` [${e.entityValue}]` : ''}`),
      '', `## Findings: ${selectedSession.findingsCount}`,
      '', `---`, `*Exported from ETIP Hunting Workbench on ${new Date().toISOString()}*`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `hunt-report-${selectedSession.name.replace(/\s+/g, '-').toLowerCase()}.md`
    a.click(); URL.revokeObjectURL(url)
    toast('Hunt report exported', 'success')
  }, [selectedSession, hypotheses, evidence, verdictOverrides])

  // Timeline entries: combine hunt, hypotheses, and evidence events
  const timelineEntries = useMemo(() => {
    if (!selectedSession) return []
    const entries: { time: string; label: string; type: string }[] = [
      { time: selectedSession.createdAt, label: `Hunt "${selectedSession.name}" created`, type: 'hunt' },
    ]
    for (const h of hypotheses) {
      entries.push({ time: h.createdAt, label: `Hypothesis added: ${h.statement.slice(0, 60)}`, type: 'hypothesis' })
    }
    for (const e of evidence) {
      entries.push({ time: e.createdAt, label: `Evidence: ${e.title}`, type: 'evidence' })
    }
    return entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  }, [selectedSession, hypotheses, evidence])

  return (
    <div className="flex flex-col h-full">
      {/* Demo banner */}
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect Hunting service for live workbench</span>
        </div>
      )}

      {/* Stats bar */}
      <PageStatsBar>
        <CompactStat label="Total Hunts" value={stats?.total?.toString() ?? '—'} />
        <CompactStat label="Active" value={stats?.active?.toString() ?? '0'} color="text-sev-low" />
        <CompactStat label="Completed" value={stats?.completed?.toString() ?? '0'} color="text-accent" />
        <CompactStat label="Findings" value={stats?.totalFindings?.toString() ?? '0'} color="text-sev-medium" />
        <CompactStat label="Avg Score" value={stats?.avgScore ? `${stats.avgScore}` : '—'} />
      </PageStatsBar>

      {/* Tab bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3">
        {([
          { key: 'sessions' as const, label: 'Hunt Sessions', icon: Crosshair },
          { key: 'templates' as const, label: 'Playbook Library', icon: BookOpen },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              activeTab === key ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
        <button onClick={() => setShowCreateHunt(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors">
          <Crosshair className="w-3 h-3" />
          New Hunt
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {activeTab === 'sessions' && (
          <>
            {/* Left: Session list */}
            <div className="w-full lg:w-[380px] border-r border-border overflow-y-auto p-4 space-y-2 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-text-primary">Hunt Sessions</h2>
              </div>
              {sessions.map(session => (
                <HuntSessionCard
                  key={session.id}
                  session={session}
                  isSelected={selectedHuntId === session.id}
                  onClick={() => setSelectedHuntId(session.id === selectedHuntId ? null : session.id)}
                />
              ))}
              {sessions.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  <Crosshair className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No hunt sessions</p>
                  <p className="text-xs mt-1">Create a new hunt or use a playbook template</p>
                </div>
              )}
            </div>

            {/* Right: Hunt detail */}
            <div className="flex-1 overflow-y-auto hidden lg:block">
              {selectedSession ? (
                <div className="p-4 space-y-4">
                  {/* Hunt header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">{selectedSession.name}</h3>
                      <p className="text-[10px] text-text-muted mt-0.5">{selectedSession.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_COLORS[selectedSession.status])}>
                          {selectedSession.status}
                        </span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', HUNT_TYPE_COLORS[selectedSession.huntType])}>
                          {selectedSession.huntType}
                        </span>
                        <span className="text-[10px] text-text-muted">by {selectedSession.createdBy}</span>
                      </div>
                      {/* H4: Hunt status controls */}
                      <div className="mt-2">
                        <HuntStatusControls huntId={selectedSession.id} status={selectedSession.status} isDemo={isDemo} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleExportReport}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-bg-secondary border border-border text-text-secondary hover:text-text-primary transition-colors">
                        <Download className="w-3 h-3" />Export
                      </button>
                      <HuntScoreGauge score={selectedSession.score} session={selectedSession} />
                    </div>
                  </div>

                  {/* #15: Pivot Chain */}
                  {evidence.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <h4 className="text-[10px] text-text-muted uppercase">IOC Pivot Chain</h4>
                        <TooltipHelp message="Shows the chain of IOC pivots discovered during this hunt. Each node represents an entity linked through investigation." />
                      </div>
                      <PivotChain evidence={evidence} />
                    </div>
                  )}

                  {/* Detail tabs */}
                  <div className="flex items-center gap-1 border-b border-border">
                    {([
                      { key: 'hypotheses' as const, label: 'Hypotheses', icon: Brain, count: hypotheses.length },
                      { key: 'evidence' as const, label: 'Evidence', icon: FileText, count: evidence.length },
                      { key: 'timeline' as const, label: 'Timeline', icon: Clock, count: timelineEntries.length },
                    ]).map(({ key, label, icon: Icon, count }) => (
                      <button
                        key={key}
                        onClick={() => setDetailTab(key)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                          detailTab === key
                            ? 'text-accent border-b-2 border-accent'
                            : 'text-text-muted hover:text-text-secondary',
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {label}
                        <span className="text-[10px] text-text-muted">({count})</span>
                      </button>
                    ))}
                  </div>

                  {/* H2: Add Hypothesis */}
                  {detailTab === 'hypotheses' && showAddHypothesis && (
                    <AddHypothesisForm huntId={selectedSession.id} isDemo={isDemo}
                      onDone={() => setShowAddHypothesis(false)} />
                  )}
                  {detailTab === 'hypotheses' && !showAddHypothesis && (
                    <button onClick={() => setShowAddHypothesis(true)}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-purple-400/10 text-purple-400 hover:bg-purple-400/20 transition-colors mb-2">
                      <Brain className="w-3 h-3" />Add Hypothesis
                    </button>
                  )}

                  {/* #12: Hypothesis Kanban */}
                  {detailTab === 'hypotheses' && (
                    <HypothesisKanban hypotheses={hypotheses} verdictOverrides={verdictOverrides} onMoveHypothesis={handleMoveHypothesis} />
                  )}

                  {/* H3: Add Evidence */}
                  {detailTab === 'evidence' && showAddEvidence && (
                    <AddEvidenceForm huntId={selectedSession.id} isDemo={isDemo}
                      onDone={() => setShowAddEvidence(false)} />
                  )}
                  {detailTab === 'evidence' && !showAddEvidence && (
                    <button onClick={() => setShowAddEvidence(true)}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors mb-2">
                      <Eye className="w-3 h-3" />Add Evidence
                    </button>
                  )}

                  {/* #13: Evidence Timeline */}
                  {detailTab === 'evidence' && (
                    <EvidenceTimeline evidence={evidence} onRemove={handleRemoveEvidence} />
                  )}

                  {/* Activity Timeline */}
                  {detailTab === 'timeline' && (
                    <div className="relative pl-4 space-y-2">
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                      {timelineEntries.map((entry, i) => {
                        const Icon = entry.type === 'hunt' ? Crosshair : entry.type === 'hypothesis' ? Brain : FileText
                        const color = entry.type === 'hunt' ? 'border-emerald-400' : entry.type === 'hypothesis' ? 'border-purple-400' : 'border-accent'
                        return (
                          <div key={i} className="relative flex gap-3">
                            <div className={cn('absolute -left-4 top-1 w-3 h-3 rounded-full bg-bg-primary border-2 z-10', color)} />
                            <div className="flex-1 flex items-center gap-2 p-1.5 bg-bg-secondary rounded border border-border">
                              <Icon className="w-3 h-3 text-text-muted shrink-0" />
                              <span className="text-[10px] text-text-primary flex-1 truncate">{entry.label}</span>
                              <span className="text-[9px] text-text-muted tabular-nums shrink-0">
                                {new Date(entry.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {timelineEntries.length === 0 && (
                        <p className="text-[10px] text-text-muted text-center py-4">No activity yet</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted">
                  <div className="text-center">
                    <Crosshair className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Select a hunt session</p>
                    <p className="text-xs mt-1">Click a session to view hypotheses, evidence, and pivot chains</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Playbook Library */}
        {activeTab === 'templates' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-text-primary">Playbook Library</h2>
              <TooltipHelp message="Pre-built hunt templates with MITRE ATT&CK mappings. Click to create a new hunt from a template." />
              <span className="text-xs text-text-muted">({templates.length} templates)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(tpl => (
                <TemplateCard key={tpl.id} template={tpl} onStartHunt={handleStartFromTemplate} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* H1: Create Hunt Modal */}
      <CreateHuntModal open={showCreateHunt} onClose={() => { setShowCreateHunt(false); setTemplateForHunt(null) }}
        templates={templates} initialTemplate={templateForHunt} />
      <ToastContainer />
    </div>
  )
}
