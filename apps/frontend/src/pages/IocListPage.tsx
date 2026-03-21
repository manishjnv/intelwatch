/**
 * @module pages/IocListPage
 * @description IOC Intelligence list page — shows all IOCs with EntityChip,
 * SeverityBadge, density-adaptive table, severity row tinting.
 * P0-3: Inline entity hover preview. P0-5: Radial confidence gauge.
 */
import { useState, useMemo } from 'react'
import { useIOCs, useIOCStats, type IOCRecord } from '@/hooks/use-intel-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { EntityChip } from '@etip/shared-ui/components/EntityChip'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { Shield, AlertTriangle, Activity, Clock } from 'lucide-react'

// UI improvements (#3, #6, #7, #8, #9, #10)
import { EntityPreview } from '@/components/viz/EntityPreview'
import { SplitPane } from '@/components/viz/SplitPane'
import { FlipDetailCard, IOCSummaryFront, IOCDetailBack } from '@/components/viz/FlipDetailCard'
import { QuickActionToolbar } from '@/components/viz/QuickActionToolbar'
import { SparklineCell, generateStubTrend } from '@/components/viz/SparklineCell'
import { RelationshipGraph, generateStubRelations } from '@/components/viz/RelationshipGraph'

const IOC_FILTERS: FilterOption[] = [
  { key: 'iocType', label: 'Type', options: [
    { value: 'ip', label: 'IP' }, { value: 'domain', label: 'Domain' },
    { value: 'url', label: 'URL' }, { value: 'hash_sha256', label: 'SHA-256' },
    { value: 'hash_md5', label: 'MD5' }, { value: 'cve', label: 'CVE' },
    { value: 'email', label: 'Email' },
  ]},
  { key: 'severity', label: 'Severity', options: [
    { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
    { value: 'info', label: 'Info' },
  ]},
  { key: 'lifecycle', label: 'Lifecycle', options: [
    { value: 'new', label: 'New' }, { value: 'active', label: 'Active' },
    { value: 'aging', label: 'Aging' }, { value: 'expired', label: 'Expired' },
  ]},
]

/** P0-5: Radial confidence gauge (SVG arc) */
function ConfidenceGauge({ value }: { value: number }) {
  const r = 14, cx = 18, cy = 18, stroke = 3
  const circumference = 2 * Math.PI * r
  const offset = circumference - (value / 100) * circumference
  const color = value >= 70 ? 'var(--sev-low)' : value >= 40 ? 'var(--sev-medium)' : 'var(--sev-critical)'

  return (
    <div className="inline-flex items-center gap-1.5 group/gauge" title={`Confidence: ${value}%`}>
      <svg width="36" height="36" viewBox="0 0 36 36" className="transition-transform group-hover/gauge:scale-125">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-700"
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-primary)" fontSize="9" fontWeight="600">
          {value}
        </text>
      </svg>
    </div>
  )
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function IocListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('lastSeen')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  const queryParams = useMemo(() => ({
    page, limit: 50, sortBy, sortOrder,
    ...(search ? { q: search } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [page, search, sortBy, sortOrder, filters])

  const { data, isLoading, isDemo } = useIOCs(queryParams)
  const { data: stats } = useIOCStats()

  const selectedRecord = useMemo(() => data?.data?.find(r => r.id === selectedId) ?? null, [data, selectedId])
  const stubRelations = useMemo(() => selectedRecord ? generateStubRelations(selectedRecord) : null, [selectedRecord])

  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('desc') }
  }

  const columns: Column<IOCRecord>[] = [
    {
      key: 'normalizedValue', label: 'Value', sortable: true, width: '26%',
      render: (row, d) => (
        <EntityPreview type={row.iocType} value={row.normalizedValue} severity={row.severity} confidence={row.confidence} firstSeen={row.firstSeen} lastSeen={row.lastSeen} tags={row.tags}>
          <EntityChip type={row.iocType} value={row.normalizedValue}
            size={d === 'ultra-dense' ? 'xs' : 'sm'} />
        </EntityPreview>
      ),
    },
    {
      key: 'iocType', label: 'Type', sortable: true, width: '8%',
      render: (row) => (
        <span className="text-text-muted uppercase text-[10px] font-mono">{row.iocType}</span>
      ),
    },
    {
      key: 'severity', label: 'Severity', sortable: true, width: '10%',
      render: (row, d) => <SeverityBadge severity={row.severity} showDot={d !== 'ultra-dense'} />,
    },
    {
      key: 'confidence', label: 'Conf', sortable: true, width: '8%',
      render: (row, d) => d === 'ultra-dense'
        ? <span className="tabular-nums">{row.confidence}</span>
        : <ConfidenceGauge value={row.confidence} />,
    },
    {
      key: 'lifecycle', label: 'Status', sortable: true, width: '8%',
      render: (row) => {
        const colors: Record<string, string> = {
          new: 'text-accent bg-accent/10', active: 'text-sev-low bg-sev-low/10',
          aging: 'text-sev-medium bg-sev-medium/10', expired: 'text-text-muted bg-bg-elevated',
        }
        return (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[row.lifecycle] ?? 'text-text-muted'}`}>
            {row.lifecycle}
          </span>
        )
      },
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
          <div className="flex flex-wrap gap-0.5 max-w-[200px]">
            {row.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[10px] px-1 py-0.5 rounded bg-bg-elevated text-text-secondary truncate max-w-[80px]">{t}</span>
            ))}
            {row.tags.length > 3 && <span className="text-[10px] text-text-muted">+{row.tags.length - 3}</span>}
          </div>
        )
      },
    },
    {
      key: 'trend', label: 'Trend', width: '6%',
      render: (row, d) => d === 'ultra-dense' ? null : <SparklineCell data={generateStubTrend(row.id)} />,
    },
    {
      key: 'lastSeen', label: 'Last Seen', sortable: true, width: '10%',
      render: (row) => <span className="text-text-muted tabular-nums">{timeAgo(row.lastSeen)}</span>,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Demo data banner */}
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect backend for live intel</span>
        </div>
      )}

      <PageStatsBar>
        <CompactStat icon={<Shield className="w-3 h-3" />} label="Total IOCs" value={stats?.total?.toLocaleString() ?? '—'} />
        <CompactStat icon={<AlertTriangle className="w-3 h-3" />} label="Critical" value={stats?.bySeverity?.['critical']?.toString() ?? '0'} color="text-sev-critical" />
        <CompactStat icon={<Activity className="w-3 h-3" />} label="Active" value={stats?.byLifecycle?.['active']?.toString() ?? '0'} color="text-sev-low" />
        <CompactStat icon={<Clock className="w-3 h-3" />} label="New" value={stats?.byLifecycle?.['new']?.toString() ?? '0'} color="text-accent" />
      </PageStatsBar>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search IOCs by value, type, tag…"
        filters={IOC_FILTERS}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
      />

      {/* #7: Split-pane layout — table left, detail right */}
      <SplitPane
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
            severityField={(r) => r.severity}
            selectedId={selectedId}
            onRowClick={(r) => {
              const newId = r.id === selectedId ? null : r.id
              setSelectedId(newId)
              setShowDetail(!!newId)
            }}
            emptyMessage="No IOCs found. Activate a feed to start ingesting threat intelligence."
          />
        }
        right={selectedRecord ? (
          <div className="h-full flex flex-col">
            {/* #6: 3D Flip detail card */}
            <FlipDetailCard
              isFlipped={showDetail}
              front={<IOCSummaryFront record={selectedRecord} />}
              back={<IOCDetailBack record={selectedRecord} onFlipBack={() => setShowDetail(false)} />}
              className="flex-1"
            />
            {/* #10: Mini relationship graph */}
            {stubRelations && (
              <RelationshipGraph
                nodes={stubRelations.nodes}
                edges={stubRelations.edges}
                className="mt-2 mx-2 mb-2"
              />
            )}
          </div>
        ) : null}
        showRight={!!selectedId}
      />

      <Pagination
        page={page} limit={50} total={data?.total ?? 0}
        onPageChange={setPage}
        density={density}
        onDensityChange={setDensity}
      />

      {/* #9: Quick-action toolbar */}
      <QuickActionToolbar
        selectedCount={selectedId ? 1 : 0}
        onClear={() => { setSelectedId(null); setShowDetail(false) }}
      />
    </div>
  )
}
