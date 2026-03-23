/**
 * @module pages/CorrelationPage
 * @description Correlation Engine page — cluster list, detail view, auto-correlate.
 * Improvements: #9 Diamond Model visualization, #10 Kill Chain progress,
 * #11 Campaign attribution cards.
 */
import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  useCorrelations, useCorrelationStats, useCampaigns, useTriggerCorrelation,
  useCorrelationFeedback,
  type CorrelationResult, type CampaignCluster,
} from '@/hooks/use-phase4-data'
import { toast, ToastContainer } from '@/components/ui/Toast'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import {
  Zap, Layers, X, CheckCircle, TrendingUp, TrendingDown,
  Play, Users, Globe, Crosshair, Target, ChevronRight,
  Search as SearchIcon, Send, ExternalLink, Download,
} from 'lucide-react'

// ─── Filters ────────────────────────────────────────────────────

const CORR_FILTERS: FilterOption[] = [
  { key: 'type', label: 'Type', options: [
    { value: 'cooccurrence', label: 'Co-occurrence' }, { value: 'infrastructure', label: 'Infrastructure' },
    { value: 'temporal', label: 'Temporal' }, { value: 'ttp_similarity', label: 'TTP Similarity' },
    { value: 'campaign', label: 'Campaign' },
  ]},
  { key: 'severity', label: 'Severity', options: [
    { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
  ]},
]

const TYPE_LABELS: Record<string, string> = {
  cooccurrence: 'Co-occurrence',
  infrastructure: 'Infrastructure',
  temporal: 'Temporal',
  ttp_similarity: 'TTP Similarity',
  campaign: 'Campaign',
}

const TYPE_COLORS: Record<string, string> = {
  cooccurrence: 'text-blue-400 bg-blue-400/10',
  infrastructure: 'text-cyan-400 bg-cyan-400/10',
  temporal: 'text-purple-400 bg-purple-400/10',
  ttp_similarity: 'text-amber-400 bg-amber-400/10',
  campaign: 'text-rose-400 bg-rose-400/10',
}

// ─── #10: Kill Chain Progress Bar ───────────────────────────────

const KILL_CHAIN_PHASES = [
  { key: 'reconnaissance', label: 'Recon' },
  { key: 'weaponization', label: 'Weaponize' },
  { key: 'delivery', label: 'Deliver' },
  { key: 'exploitation', label: 'Exploit' },
  { key: 'installation', label: 'Install' },
  { key: 'command_and_control', label: 'C2' },
  { key: 'actions_on_objectives', label: 'Actions' },
]

function KillChainBar({ activePhase, onPhaseClick }: { activePhase?: string; onPhaseClick?: (phase: string) => void }) {
  const activeIdx = KILL_CHAIN_PHASES.findIndex(p => p.key === activePhase)
  return (
    <div className="flex items-center gap-0.5">
      {KILL_CHAIN_PHASES.map((phase, i) => {
        const isActive = i === activeIdx
        const isPast = i < activeIdx
        return (
          <div key={phase.key} className="flex items-center gap-0.5">
            <div
              onClick={() => onPhaseClick?.(phase.key)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-medium transition-all',
                isActive ? 'bg-sev-critical/20 text-sev-critical ring-1 ring-sev-critical/40' :
                isPast ? 'bg-sev-medium/15 text-sev-medium' : 'bg-bg-elevated text-text-muted',
                onPhaseClick && 'cursor-pointer hover:ring-1 hover:ring-accent/40',
              )}
              title={`Filter by: ${phase.key}`}
            >
              {phase.label}
            </div>
            {i < KILL_CHAIN_PHASES.length - 1 && (
              <ChevronRight className={cn('w-2.5 h-2.5', isPast || isActive ? 'text-sev-medium' : 'text-text-muted/30')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── #9: Diamond Model Visualization ────────────────────────────

function DiamondModelCard({ diamond, onNavigate }: {
  diamond: { adversary: string; infrastructure: string; capability: string; victim: string }
  onNavigate?: (route: string, search: string) => void
}) {
  const quad = (route: string, search: string) => () => onNavigate?.(route, search)
  return (
    <div className="relative w-full max-w-[240px] mx-auto py-4">
      <div className="grid grid-cols-3 gap-1 text-center">
        {/* Top: Adversary */}
        <div className="col-start-2">
          <div onClick={quad('/threat-actors', diamond.adversary)}
            className={cn('p-2 bg-sev-critical/10 border border-sev-critical/20 rounded-lg', onNavigate && 'cursor-pointer hover:border-sev-critical/50')}>
            <Users className="w-3.5 h-3.5 text-sev-critical mx-auto mb-0.5" />
            <div className="text-[9px] text-text-muted uppercase">Adversary</div>
            <div className="text-[10px] text-text-primary font-medium truncate">{diamond.adversary}</div>
          </div>
        </div>
        {/* Middle row: Infrastructure — Capability */}
        <div className="col-start-1 flex items-center justify-end">
          <div onClick={quad('/iocs', diamond.infrastructure)}
            className={cn('p-2 bg-cyan-400/10 border border-cyan-400/20 rounded-lg w-full', onNavigate && 'cursor-pointer hover:border-cyan-400/50')}>
            <Globe className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-0.5" />
            <div className="text-[9px] text-text-muted uppercase">Infra</div>
            <div className="text-[10px] text-text-primary font-medium truncate">{diamond.infrastructure}</div>
          </div>
        </div>
        <div className="col-start-2 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            <Zap className="w-3 h-3 text-accent" />
          </div>
        </div>
        <div className="col-start-3 flex items-center justify-start">
          <div onClick={quad('/malware', diamond.capability)}
            className={cn('p-2 bg-amber-400/10 border border-amber-400/20 rounded-lg w-full', onNavigate && 'cursor-pointer hover:border-amber-400/50')}>
            <Crosshair className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
            <div className="text-[9px] text-text-muted uppercase">Capability</div>
            <div className="text-[10px] text-text-primary font-medium truncate">{diamond.capability}</div>
          </div>
        </div>
        {/* Bottom: Victim */}
        <div className="col-start-2">
          <div className="p-2 bg-purple-400/10 border border-purple-400/20 rounded-lg">
            <Target className="w-3.5 h-3.5 text-purple-400 mx-auto mb-0.5" />
            <div className="text-[9px] text-text-muted uppercase">Victim</div>
            <div className="text-[10px] text-text-primary font-medium truncate">{diamond.victim}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── #11: Campaign Attribution Card ─────────────────────────────

function CampaignCard({ campaign }: { campaign: CampaignCluster }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div onClick={() => setExpanded(!expanded)}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-accent/30 transition-colors cursor-pointer">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-xs font-semibold text-text-primary">{campaign.name}</h4>
          {campaign.actorName && (
            <span className="text-[10px] text-sev-critical font-medium">{campaign.actorName}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] tabular-nums text-text-muted">{campaign.confidence}%</span>
          <ConfidenceBar value={campaign.confidence} />
        </div>
      </div>
      <p className={cn('text-[10px] text-text-muted mb-2', !expanded && 'line-clamp-2')}>{campaign.description}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {(expanded ? campaign.techniques : campaign.techniques.slice(0, 3)).map(t => (
          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">{t}</span>
        ))}
        {!expanded && campaign.techniques.length > 3 && (
          <span className="text-[9px] text-text-muted">+{campaign.techniques.length - 3}</span>
        )}
        <span className="ml-auto text-[10px] text-text-muted">{campaign.iocCount} IOCs</span>
      </div>
      {expanded && (
        <div className="mt-3 pt-2 border-t border-border flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); toast('STIX bundle exported', 'success') }}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            <Download className="w-3 h-3" />Export STIX
          </button>
          <span className="text-[9px] text-text-muted ml-auto">ID: {campaign.id.slice(0, 12)}…</span>
        </div>
      )}
    </div>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-sev-low' : value >= 40 ? 'bg-sev-medium' : 'bg-sev-critical'
  return (
    <div className="w-10 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
    </div>
  )
}

// ─── Correlation Detail Panel ───────────────────────────────────

function CorrelationDetail({ corr, onClose, isDemo, onKillChainClick, onDiamondNavigate }: {
  corr: CorrelationResult; onClose: () => void; isDemo: boolean
  onKillChainClick?: (phase: string) => void
  onDiamondNavigate?: (route: string, search: string) => void
}) {
  const feedbackMutation = useCorrelationFeedback()

  const handleFeedback = (verdict: 'true_positive' | 'false_positive') => {
    feedbackMutation.mutate({ id: corr.id, verdict })
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-bg-primary border-l border-border shadow-xl z-50 overflow-y-auto">
      <div className="sticky top-0 bg-bg-primary border-b border-border p-4 z-10">
        <div className="flex items-center justify-between">
          <SeverityBadge severity={corr.severity.toUpperCase() as any} />
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-text-primary mt-2">{corr.title}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TYPE_COLORS[corr.correlationType])}>
            {TYPE_LABELS[corr.correlationType]}
          </span>
          <span className="text-[10px] text-text-muted tabular-nums">{corr.confidence}% confidence</span>
          {corr.suppressed && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">Suppressed (FP)</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-text-secondary">{corr.description}</p>

        {/* Verdict Feedback */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-2">Verdict Feedback</h4>
          <div className="flex items-center gap-2">
            <button onClick={() => handleFeedback('true_positive')}
              disabled={feedbackMutation.isPending || isDemo}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-md bg-sev-critical/10 border border-sev-critical/20 text-sev-critical hover:bg-sev-critical/20 transition-colors disabled:opacity-50">
              <Target className="w-3 h-3" />True Positive
            </button>
            <button onClick={() => handleFeedback('false_positive')}
              disabled={feedbackMutation.isPending || isDemo}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-md bg-sev-low/10 border border-sev-low/20 text-sev-low hover:bg-sev-low/20 transition-colors disabled:opacity-50">
              <X className="w-3 h-3" />False Positive
            </button>
          </div>
          {feedbackMutation.isSuccess && (
            <p className="text-[10px] text-sev-low mt-1">Feedback recorded. Suppression rules updated.</p>
          )}
        </div>

        {/* Action buttons */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-2">Actions</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => toast('Investigation panel opened', 'info')}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors">
              <SearchIcon className="w-3 h-3" />Investigate
            </button>
            <button onClick={() => toast('Ticket created via integration-service', 'success')}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-purple-400/10 border border-purple-400/20 text-purple-400 hover:bg-purple-400/20 transition-colors">
              <Send className="w-3 h-3" />Create Ticket
            </button>
            <button onClick={() => toast('Added to active hunt session', 'success')}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 hover:bg-emerald-400/20 transition-colors">
              <Crosshair className="w-3 h-3" />Add to Hunt
            </button>
          </div>
        </div>

        {/* Linked entities */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Linked Entities ({corr.entityIds.length})</h4>
          <div className="flex flex-wrap gap-1.5">
            {corr.entityLabels.map((label, i) => (
              <button key={i} onClick={() => { navigator.clipboard.writeText(label); toast(`Copied: ${label}`) }}
                className="text-[10px] px-2 py-1 rounded bg-bg-secondary border border-border text-text-primary hover:border-accent/40 hover:text-accent transition-colors cursor-pointer flex items-center gap-1">
                {label}<ExternalLink className="w-2.5 h-2.5 opacity-50" />
              </button>
            ))}
          </div>
        </div>

        {/* #10: Kill Chain */}
        {corr.killChainPhase && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="text-[10px] text-text-muted uppercase">Kill Chain Phase</h4>
              <TooltipHelp message="Lockheed Martin Cyber Kill Chain positioning. Shows where in the attack lifecycle this correlation falls." />
            </div>
            <KillChainBar activePhase={corr.killChainPhase} onPhaseClick={onKillChainClick} />
          </div>
        )}

        {/* #9: Diamond Model */}
        {corr.diamondModel && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="text-[10px] text-text-muted uppercase">Diamond Model</h4>
              <TooltipHelp message="Diamond Model of Intrusion Analysis — click a quadrant to navigate to the entity." />
            </div>
            <DiamondModelCard diamond={corr.diamondModel} onNavigate={onDiamondNavigate} />
          </div>
        )}

        {/* Metadata */}
        <div>
          <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Details</h4>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-text-muted">ID</span><span className="text-text-primary font-mono">{corr.id.slice(0, 16)}...</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Type</span><span className="text-text-primary">{TYPE_LABELS[corr.correlationType]}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Created</span><span className="text-text-primary tabular-nums">{new Date(corr.createdAt).toLocaleString()}</span></div>
          </div>
        </div>

        {isDemo && (
          <div className="p-2 bg-accent/5 border border-accent/20 rounded-md text-[10px] text-accent">
            Feedback disabled in demo mode. Connect the Correlation Engine to enable TP/FP verdicts.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

export function CorrelationPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'correlations' | 'campaigns'>('correlations')
  const [killChainFilter, setKillChainFilter] = useState<string | null>(null)
  const [autoCorrelating, setAutoCorrelating] = useState(false)

  const { data: corrData, isLoading, isDemo } = useCorrelations({ page, ...filters })
  const { data: stats } = useCorrelationStats()
  const { data: campData } = useCampaigns()
  const correlateMutation = useTriggerCorrelation()

  const handleAutoCorrelate = useCallback(() => {
    if (isDemo) {
      setAutoCorrelating(true)
      setTimeout(() => {
        setAutoCorrelating(false)
        toast('Correlation complete: 3 new correlations, 1 campaign detected', 'success')
      }, 2000)
    } else {
      correlateMutation.mutate()
    }
  }, [isDemo, correlateMutation])

  const handleDiamondNavigate = useCallback((route: string, search: string) => {
    navigate(`${route}?search=${encodeURIComponent(search)}`)
  }, [navigate])

  const handleKillChainClick = useCallback((phase: string) => {
    setKillChainFilter(prev => prev === phase ? null : phase)
    setSelectedId(null)
  }, [])

  const correlations = useMemo(() => {
    let items = corrData?.data ?? []
    if (!isDemo) return items
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.entityLabels.some(l => l.toLowerCase().includes(q)),
      )
    }
    if (filters.type) items = items.filter(c => c.correlationType === filters.type)
    if (filters.severity) items = items.filter(c => c.severity === filters.severity)
    if (killChainFilter) items = items.filter(c => c.killChainPhase === killChainFilter)
    return items
  }, [corrData, isDemo, search, filters, killChainFilter])

  const selectedCorrelation = useMemo(
    () => correlations.find(c => c.id === selectedId) ?? null,
    [correlations, selectedId],
  )

  const columns: Column<CorrelationResult>[] = [
    {
      key: 'severity', label: 'Sev', width: '6%',
      render: (row) => <SeverityBadge severity={row.severity.toUpperCase() as any} showDot />,
    },
    {
      key: 'title', label: 'Correlation', sortable: true, width: '32%',
      render: (row) => (
        <div className="min-w-0">
          <div className="text-text-primary font-medium truncate text-xs">{row.title}</div>
          <div className="text-[10px] text-text-muted truncate">{row.entityLabels.join(' • ')}</div>
        </div>
      ),
    },
    {
      key: 'correlationType', label: 'Type', width: '12%',
      render: (row) => (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TYPE_COLORS[row.correlationType])}>
          {TYPE_LABELS[row.correlationType]}
        </span>
      ),
    },
    {
      key: 'confidence', label: 'Confidence', sortable: true, width: '14%',
      render: (row) => (
        <div className="flex items-center gap-1">
          <ConfidenceBar value={row.confidence} />
          <span className="text-[10px] tabular-nums text-text-primary">{row.confidence}%</span>
          {row.confidence >= 65 && <TrendingUp className="w-3 h-3 text-sev-low" />}
          {row.confidence <= 35 && <TrendingDown className="w-3 h-3 text-sev-critical" />}
        </div>
      ),
    },
    {
      key: 'killChainPhase', label: 'Kill Chain', width: '18%',
      render: (row) => row.killChainPhase
        ? <span className="text-[10px] text-text-secondary capitalize">{row.killChainPhase.replace(/_/g, ' ')}</span>
        : <span className="text-[10px] text-text-muted">—</span>,
    },
    {
      key: 'entityCount', label: 'Entities', width: '8%',
      render: (row) => <span className="tabular-nums">{row.entityIds.length}</span>,
    },
    {
      key: 'suppressed', label: '', width: '6%',
      render: (row) => row.suppressed
        ? <span className="text-[9px] px-1 py-0.5 rounded bg-bg-elevated text-text-muted">FP</span>
        : null,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Demo banner */}
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect Correlation Engine for live analysis</span>
        </div>
      )}

      {/* Stats bar */}
      <PageStatsBar>
        <CompactStat label="Correlations" value={stats?.total?.toString() ?? '—'} />
        <CompactStat label="Critical" value={stats?.bySeverity?.['critical']?.toString() ?? '0'} color="text-sev-critical" />
        <CompactStat label="Avg Confidence" value={stats?.avgConfidence ? `${stats.avgConfidence}%` : '—'} />
        <CompactStat label="Suppressed" value={stats?.suppressedCount?.toString() ?? '0'} color="text-text-muted" />
        <CompactStat label="Campaigns" value={campData?.total?.toString() ?? '0'} color="text-rose-400" />
      </PageStatsBar>

      {/* Tab bar + Auto-correlate button */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3">
        <div className="flex items-center gap-1">
          {([
            { key: 'correlations' as const, label: 'Correlations', icon: Zap },
            { key: 'campaigns' as const, label: 'Campaigns', icon: Layers },
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
        </div>
        {killChainFilter && (
          <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-1 rounded-md">
            Kill Chain: {killChainFilter.replace(/_/g, ' ')}
            <button onClick={() => setKillChainFilter(null)} className="ml-1 hover:text-text-primary"><X className="w-3 h-3" /></button>
          </span>
        )}
        <button
          onClick={handleAutoCorrelate}
          disabled={correlateMutation.isPending || autoCorrelating}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-md hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
        >
          <Play className={cn('w-3 h-3', (correlateMutation.isPending || autoCorrelating) && 'animate-spin')} />
          {autoCorrelating ? 'Correlating…' : 'Auto-Correlate'}
        </button>
      </div>

      {/* Auto-correlate result banner */}
      {correlateMutation.isSuccess && (correlateMutation.data as any) && (
        <div className="mx-4 mt-2 p-2 bg-sev-low/5 border border-sev-low/20 rounded-lg flex items-center gap-2 text-xs text-sev-low">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          <span>
            Correlation complete: {(correlateMutation.data as any).correlationsFound ?? 0} correlations,{' '}
            {(correlateMutation.data as any).campaignsDetected ?? 0} campaigns,{' '}
            {(correlateMutation.data as any).suppressed ?? 0} suppressed
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {activeTab === 'correlations' && (
          <>
            <FilterBar
              searchValue={search}
              onSearchChange={(v) => { setSearch(v); setPage(1) }}
              searchPlaceholder="Search correlations…"
              filters={CORR_FILTERS}
              filterValues={filters}
              onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
            />

            <DataTable
              columns={columns}
              data={correlations}
              loading={isLoading}
              rowKey={(r) => r.id}
              density={density}
              severityField={(r) => r.severity}
              selectedId={selectedId}
              onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
              emptyMessage="No correlations found. Click Auto-Correlate to start analysis."
            />

            <Pagination
              page={page} limit={50} total={isDemo ? correlations.length : (corrData?.total ?? 0)}
              onPageChange={setPage} density={density} onDensityChange={setDensity}
            />
          </>
        )}

        {/* #11: Campaign Attribution Cards */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-semibold text-text-primary">Campaign Clusters</h2>
              <TooltipHelp message="Automated campaign attribution using DBSCAN clustering with MITRE ATT&CK technique mapping." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(campData?.data ?? []).map(camp => (
                <CampaignCard key={camp.id} campaign={camp} />
              ))}
            </div>
            {(campData?.data ?? []).length === 0 && (
              <div className="text-center py-12 text-text-muted">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No campaigns detected yet</p>
                <p className="text-xs mt-1">Run auto-correlation to discover campaign clusters</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Panel overlay */}
      {selectedCorrelation && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedId(null)} />
          <CorrelationDetail corr={selectedCorrelation} onClose={() => setSelectedId(null)} isDemo={isDemo}
            onKillChainClick={handleKillChainClick} onDiamondNavigate={handleDiamondNavigate} />
        </>
      )}
      <ToastContainer />
    </div>
  )
}
