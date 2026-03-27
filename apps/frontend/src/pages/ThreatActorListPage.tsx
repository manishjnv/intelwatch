/**
 * @module pages/ThreatActorListPage
 * @description Threat Actor list page — profiles with type, motivation,
 * sophistication, confidence gauge, and country.
 * Row click opens detail panel: MITRE ATT&CK badges + linked IOCs.
 */
import { useState, useMemo } from 'react'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useActors, useActorDetail, type ActorRecord } from '@/hooks/use-intel-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { TableSkeleton } from '@/components/data/TableSkeleton'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { SplitPane } from '@/components/viz/SplitPane'
import { Users, Globe, Target, Shield } from 'lucide-react'
import { AttackTechniqueMatrix } from '@/components/attack/AttackTechniqueMatrix'
import { LinkedIocsSection } from '@/components/LinkedIocsSection'

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

const DEMO_MITRE = ['T1059', 'T1078', 'T1190']

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

  const mitre = (detail?.mitreTechniques?.length ?? 0) > 0 ? detail!.mitreTechniques! : DEMO_MITRE

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

      {/* MITRE ATT&CK — Enhanced matrix */}
      <div className="p-3 border-b border-border space-y-1.5" data-testid="mitre-section">
        <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide flex items-center gap-1.5">
          MITRE ATT&amp;CK
          <span className="px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium tabular-nums">{mitre.length}</span>
        </div>
        <AttackTechniqueMatrix techniques={mitre} entityName={actor.name} entityType="actor" />
      </div>

      {/* Linked IOCs — Enhanced filterable section */}
      <div className="border-b border-border" data-testid="actor-ioc-section">
        <LinkedIocsSection entityId={actor.id} entityType="actor" entityName={actor.name} />
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
  const debouncedSearch = useDebouncedValue(search, 300)

  const queryParams = useMemo(() => ({
    page, limit: 50, sortBy, sortOrder,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [page, debouncedSearch, sortBy, sortOrder, filters])

  const { data, isLoading, isDemo } = useActors(queryParams)

  const rows = useMemo(() => {
    let items = data?.data ?? []
    if (!isDemo || items.length === 0) return items
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      items = items.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.aliases.some(a => a.toLowerCase().includes(q)) ||
        (r.country ?? '').toLowerCase().includes(q)
      )
    }
    if (filters.actorType) items = items.filter(r => r.actorType === filters.actorType)
    if (filters.motivation) items = items.filter(r => r.motivation === filters.motivation)
    if (filters.sophistication) items = items.filter(r => r.sophistication === filters.sophistication)
    return [...items].sort((a, b) => {
      const av = (a[sortBy as keyof ActorRecord] ?? '') as string | number
      const bv = (b[sortBy as keyof ActorRecord] ?? '') as string | number
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [data, isDemo, sortBy, sortOrder, debouncedSearch, filters])

  const selectedActor = useMemo(
    () => rows.find(r => r.id === selectedActorId) ?? null,
    [rows, selectedActorId],
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
        left={isLoading ? (
          <TableSkeleton rows={10} columns={columns.length} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            loading={false}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            rowKey={(r) => r.id}
            density={density}
            selectedId={selectedActorId}
            onRowClick={(r) => setSelectedActorId(r.id === selectedActorId ? null : r.id)}
            emptyMessage="No threat actors found."
          />
        )}
        right={selectedActor ? <ActorDetailPanel actor={selectedActor} /> : null}
        showRight={!!selectedActorId}
      />

      <Pagination page={page} limit={50} total={data?.total ?? 0} onPageChange={setPage}
        density={density} onDensityChange={setDensity} />
    </div>
  )
}
