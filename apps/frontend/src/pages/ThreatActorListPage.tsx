/**
 * @module pages/ThreatActorListPage
 * @description Threat Actor list page — profiles with type, motivation,
 * sophistication, confidence gauge, and country.
 * Row click opens detail panel: MITRE ATT&CK badges + linked IOCs.
 */
import { useState, useMemo } from 'react'
import { useActors, useActorDetail, useActorLinkedIOCs, type ActorRecord, type LinkedIOC } from '@/hooks/use-intel-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { SplitPane } from '@/components/viz/SplitPane'
import { Users, Globe, Target, Shield, ExternalLink } from 'lucide-react'

const ACTOR_FILTERS: FilterOption[] = [
  { key: 'actorType', label: 'Type', options: [
    { value: 'nation_state', label: 'Nation State' }, { value: 'criminal', label: 'Criminal' },
    { value: 'hacktivist', label: 'Hacktivist' }, { value: 'insider', label: 'Insider' },
  ]},
  { key: 'motivation', label: 'Motivation', options: [
    { value: 'espionage', label: 'Espionage' }, { value: 'financial', label: 'Financial' },
    { value: 'hacktivism', label: 'Hacktivism' }, { value: 'sabotage', label: 'Sabotage' },
  ]},
  { key: 'sophistication', label: 'Sophistication', options: [
    { value: 'expert', label: 'Expert' }, { value: 'advanced', label: 'Advanced' },
    { value: 'intermediate', label: 'Intermediate' }, { value: 'minimal', label: 'Minimal' },
  ]},
]

const TYPE_COLORS: Record<string, string> = {
  nation_state: 'text-sev-critical bg-sev-critical/10',
  criminal: 'text-sev-high bg-sev-high/10',
  hacktivist: 'text-sev-medium bg-sev-medium/10',
  insider: 'text-purple-400 bg-purple-400/10',
  unknown: 'text-text-muted bg-bg-elevated',
}

const SOPH_COLORS: Record<string, string> = {
  expert: 'text-sev-critical', strategic: 'text-sev-critical',
  advanced: 'text-sev-high', intermediate: 'text-sev-medium',
  minimal: 'text-sev-low', none: 'text-text-muted',
}

const SEV_COLORS: Record<string, string> = {
  critical: 'text-sev-critical bg-sev-critical/10',
  high: 'text-sev-high bg-sev-high/10',
  medium: 'text-sev-medium bg-sev-medium/10',
  low: 'text-sev-low bg-sev-low/10',
  info: 'text-text-muted bg-bg-elevated',
}

const DEMO_MITRE = ['T1059', 'T1078', 'T1190']
const DEMO_ACTOR_IOCS: LinkedIOC[] = [
  { id: 'al1', iocType: 'ip', normalizedValue: '185.220.101.1', severity: 'critical' },
  { id: 'al2', iocType: 'domain', normalizedValue: 'evil-c2.net', severity: 'high' },
  { id: 'al3', iocType: 'hash_sha256', normalizedValue: 'a1b2c3d4e5f6...', severity: 'high' },
]

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-sev-low' : value >= 40 ? 'bg-sev-medium' : 'bg-sev-critical'
  return (
    <div className="flex items-center gap-1.5" title={`Confidence: ${value}%`}>
      <div className="w-12 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-text-muted">{value}</span>
    </div>
  )
}

function ActorDetailPanel({ actor }: { actor: ActorRecord }) {
  const { data: detail } = useActorDetail(actor.id)
  const { data: iocs = [] } = useActorLinkedIOCs(actor.id)

  const mitre = (detail?.mitreTechniques?.length ?? 0) > 0 ? detail!.mitreTechniques! : DEMO_MITRE
  const linkedIOCs: LinkedIOC[] = iocs.length > 0 ? iocs : DEMO_ACTOR_IOCS

  const tlpColors: Record<string, string> = {
    red: 'text-sev-critical', amber: 'text-sev-medium',
    green: 'text-sev-low', white: 'text-text-muted',
  }

  return (
    <div className="h-full overflow-y-auto" data-testid="actor-detail-panel">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary leading-tight">{actor.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[actor.actorType] ?? TYPE_COLORS['unknown']}`}>
            {actor.actorType.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-muted flex-wrap">
          {actor.country && <span>Country: <span className="text-text-secondary">{actor.country}</span></span>}
          <span className={`uppercase font-medium ${tlpColors[actor.tlp] ?? ''}`}>{actor.tlp}</span>
          {actor.active && <span className="text-sev-low font-medium">● Active</span>}
          <span>Conf: <span className="text-text-primary tabular-nums">{actor.confidence}%</span></span>
        </div>
        {actor.aliases.length > 0 && (
          <div className="text-[10px] text-text-muted truncate">aka {actor.aliases.slice(0, 3).join(', ')}</div>
        )}
      </div>

      {/* MITRE ATT&CK */}
      <div className="p-3 border-b border-border space-y-1.5" data-testid="mitre-section">
        <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide">MITRE ATT&amp;CK</div>
        <div className="flex flex-wrap gap-1">
          {mitre.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-accent/10 text-accent" data-testid="mitre-badge">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Linked IOCs */}
      <div className="p-3 border-b border-border space-y-1.5" data-testid="actor-ioc-section">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Linked IOCs</div>
          <a href="/iocs" className="text-[10px] text-accent hover:underline flex items-center gap-0.5">
            View all <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
        <div className="space-y-1">
          {linkedIOCs.slice(0, 10).map(ioc => (
            <div key={ioc.id} className="flex items-center gap-2 py-0.5" data-testid="linked-ioc-row">
              <span className="text-[10px] uppercase font-mono text-text-muted w-16 shrink-0">{ioc.iocType}</span>
              <span className="text-[10px] text-text-secondary truncate flex-1 font-mono">{ioc.normalizedValue}</span>
              <span className={`text-[10px] px-1 py-0.5 rounded-full shrink-0 ${SEV_COLORS[ioc.severity] ?? ''}`}>
                {ioc.severity}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      {actor.tags.length > 0 && (
        <div className="p-3 space-y-1.5">
          <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Tags</div>
          <div className="flex flex-wrap gap-1">
            {actor.tags.map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ThreatActorListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('confidence')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null)

  const queryParams = useMemo(() => ({
    page, limit: 50, sortBy, sortOrder,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [page, sortBy, sortOrder, filters])

  const { data, isLoading } = useActors(queryParams)

  const selectedActor = useMemo(
    () => (data?.data ?? []).find(r => r.id === selectedActorId) ?? null,
    [data, selectedActorId],
  )

  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('desc') }
  }

  const columns: Column<ActorRecord>[] = [
    {
      key: 'name', label: 'Actor Name', sortable: true, width: '22%',
      render: (row) => (
        <div className="min-w-0">
          <div className="text-text-primary font-medium truncate">{row.name}</div>
          {row.aliases.length > 0 && (
            <div className="text-[10px] text-text-muted truncate">aka {row.aliases.slice(0, 2).join(', ')}</div>
          )}
        </div>
      ),
    },
    {
      key: 'actorType', label: 'Type', sortable: true, width: '12%',
      render: (row) => (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[row.actorType] ?? TYPE_COLORS['unknown']}`}>
          {row.actorType.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'motivation', label: 'Motivation', sortable: true, width: '10%',
      render: (row) => <span className="text-text-secondary capitalize">{row.motivation}</span>,
    },
    {
      key: 'sophistication', label: 'Sophistication', sortable: true, width: '12%',
      render: (row) => (
        <span className={`capitalize font-medium ${SOPH_COLORS[row.sophistication] ?? 'text-text-muted'}`}>
          {row.sophistication}
        </span>
      ),
    },
    {
      key: 'country', label: 'Country', width: '8%',
      render: (row) => <span className="text-text-muted">{row.country ?? '—'}</span>,
    },
    {
      key: 'confidence', label: 'Confidence', sortable: true, width: '12%',
      render: (row) => <ConfidenceBar value={row.confidence} />,
    },
    {
      key: 'tlp', label: 'TLP', width: '6%',
      render: (row) => {
        const colors: Record<string, string> = { red: 'text-sev-critical', amber: 'text-sev-medium', green: 'text-sev-low', white: 'text-text-muted' }
        return <span className={`text-[10px] uppercase font-medium ${colors[row.tlp] ?? ''}`}>{row.tlp}</span>
      },
    },
    {
      key: 'tags', label: 'Tags', width: '15%',
      render: (row, d) => {
        if (d === 'ultra-dense') return <span className="text-text-muted">{row.tags.length || '—'}</span>
        return (
          <div className="flex flex-wrap gap-0.5 max-w-[180px]">
            {row.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[10px] px-1 py-0.5 rounded bg-bg-elevated text-text-secondary truncate max-w-[80px]">{t}</span>
            ))}
            {row.tags.length > 2 && <span className="text-[10px] text-text-muted">+{row.tags.length - 2}</span>}
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageStatsBar>
        <CompactStat icon={<Users className="w-3 h-3" />} label="Total Actors" value={data?.total?.toString() ?? '—'} />
        <CompactStat icon={<Globe className="w-3 h-3" />} label="Nation State" value="—" color="text-sev-critical" />
        <CompactStat icon={<Target className="w-3 h-3" />} label="Criminal" value="—" color="text-sev-high" />
        <CompactStat icon={<Shield className="w-3 h-3" />} label="Active" value="—" color="text-sev-low" />
      </PageStatsBar>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search actors by name, alias, country…"
        filters={ACTOR_FILTERS}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
      />

      <SplitPane
        onCloseRight={() => setSelectedActorId(null)}
        left={
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            rowKey={(r) => r.id}
            density={density}
            selectedId={selectedActorId}
            onRowClick={(r) => setSelectedActorId(r.id === selectedActorId ? null : r.id)}
            emptyMessage="No threat actors found."
          />
        }
        right={selectedActor ? <ActorDetailPanel actor={selectedActor} /> : null}
        showRight={!!selectedActorId}
      />

      <Pagination page={page} limit={50} total={data?.total ?? 0} onPageChange={setPage}
        density={density} onDensityChange={setDensity} />
    </div>
  )
}
