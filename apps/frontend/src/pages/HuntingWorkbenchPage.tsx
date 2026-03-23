/**
 * @module pages/HuntingWorkbenchPage
 * @description Threat Hunting workbench — session manager, hypothesis tracker,
 * evidence collection, saved hunt templates.
 * Improvements: #12 hypothesis kanban, #13 evidence timeline,
 * #14 hunt effectiveness score, #15 IOC pivot chain visualization.
 */
import { useState, useMemo } from 'react'
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
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import {
  Crosshair, Play, Pause, CheckCircle, Archive, Target,
  BookOpen, Brain, FileText, ChevronRight,
  Shield, Layers, Eye,
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

function HuntScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--sev-low)' : score >= 50 ? 'var(--sev-medium)' : 'var(--sev-critical)'
  const r = 18, cx = 22, cy = 22, stroke = 4
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="inline-flex items-center gap-1.5" title={`Hunt Score: ${score}`}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-700" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-primary)" fontSize="12" fontWeight="700">{score}</text>
      </svg>
    </div>
  )
}

// ─── #15: IOC Pivot Chain ───────────────────────────────────────

function PivotChain({ evidence }: { evidence: HuntEvidence[] }) {
  const pivots = evidence.filter(e => e.entityValue)
  if (pivots.length === 0) return null

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {pivots.map((ev, i) => {
        const Icon = EVIDENCE_ICONS[ev.type] ?? Target
        return (
          <div key={ev.id} className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-bg-secondary border border-border">
              <Icon className="w-3 h-3 text-accent" />
              <span className="text-[10px] text-text-primary font-mono truncate max-w-[120px]">{ev.entityValue}</span>
            </div>
            {i < pivots.length - 1 && <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />}
          </div>
        )
      })}
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
        <HuntScoreGauge score={session.score} />
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

function HypothesisKanban({ hypotheses }: { hypotheses: HuntHypothesis[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {KANBAN_COLUMNS.map(col => {
        const items = hypotheses.filter(h => h.verdict === col.key)
        return (
          <div key={col.key} className={cn('rounded-lg border-t-2 p-2 bg-bg-secondary/50', col.color)}>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[10px] font-medium text-text-muted uppercase">{col.label}</h5>
              <span className="text-[10px] tabular-nums text-text-muted">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(h => (
                <div key={h.id} className={cn('p-2 rounded border text-[11px]', VERDICT_COLORS[h.verdict])}>
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
                <p className="text-[10px] text-text-muted text-center py-2">No hypotheses</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── #13: Evidence Timeline ─────────────────────────────────────

function EvidenceTimeline({ evidence }: { evidence: HuntEvidence[] }) {
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
            <div className="flex-1 p-2 bg-bg-secondary rounded border border-border">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3 h-3 text-accent shrink-0" />
                <span className="text-[11px] font-medium text-text-primary flex-1 truncate">{ev.title}</span>
                <span className="text-[9px] text-text-muted tabular-nums shrink-0">{timeStr}</span>
              </div>
              <p className="text-[10px] text-text-muted line-clamp-2">{ev.description}</p>
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

function TemplateCard({ template }: { template: HuntTemplate }) {
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-accent/30 transition-colors cursor-pointer">
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
      <div className="flex gap-1 flex-wrap">
        {template.mitreTechniques.slice(0, 3).map(t => (
          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">{t}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

export function HuntingWorkbenchPage() {
  const [selectedHuntId, setSelectedHuntId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'sessions' | 'templates'>('sessions')
  const [detailTab, setDetailTab] = useState<'hypotheses' | 'evidence' | 'pivot'>('hypotheses')
  const [showCreateHunt, setShowCreateHunt] = useState(false)
  const [showAddHypothesis, setShowAddHypothesis] = useState(false)
  const [showAddEvidence, setShowAddEvidence] = useState(false)

  const { data: sessionData, isDemo } = useHuntSessions()
  const { data: stats } = useHuntStats()
  const { data: hypothesisData } = useHuntHypotheses(selectedHuntId)
  const { data: evidenceData } = useHuntEvidence(selectedHuntId)
  const { data: templateData } = useHuntTemplates()

  const sessions = sessionData?.data ?? []
  const hypotheses = hypothesisData?.data ?? []
  const evidence = evidenceData?.data ?? []
  const templates = templateData?.data ?? []

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedHuntId) ?? null,
    [sessions, selectedHuntId],
  )

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
                    <HuntScoreGauge score={selectedSession.score} />
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
                    <HypothesisKanban hypotheses={hypotheses} />
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
                    <EvidenceTimeline evidence={evidence} />
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
                <TemplateCard key={tpl.id} template={tpl} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* H1: Create Hunt Modal */}
      <CreateHuntModal open={showCreateHunt} onClose={() => setShowCreateHunt(false)} templates={templates} />
    </div>
  )
}
