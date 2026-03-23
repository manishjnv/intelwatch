/**
 * @module pages/IocListPage
 * @description IOC Intelligence list page — shows all IOCs with EntityChip,
 * SeverityBadge, density-adaptive table, severity row tinting.
 * P0-3: Inline entity hover preview. P0-5: Radial confidence gauge.
 */
import { useState, useMemo, lazy, Suspense } from 'react'
import { useIOCs, useIOCStats, type IOCRecord } from '@/hooks/use-intel-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
// Stats merged inline with FilterBar (no separate PageStatsBar)
import { EntityChip } from '@etip/shared-ui/components/EntityChip'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { Brain, GitBranch, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

// UI improvements (#3, #6, #7, #8, #9, #10)
import { EntityPreview } from '@/components/viz/EntityPreview'
import { SplitPane } from '@/components/viz/SplitPane'
import { IOCDetailBack } from '@/components/viz/FlipDetailCard'
import { QuickActionToolbar } from '@/components/viz/QuickActionToolbar'
import { SparklineCell, generateStubTrend } from '@/components/viz/SparklineCell'
import type { GraphNode, GraphEdge } from '@/components/viz/RelationshipGraph'

// Lazy-loaded so D3 is not pulled into the main bundle
const LazyRelationshipGraph = lazy(() =>
  import('@/components/viz/RelationshipGraph').then(m => ({ default: m.RelationshipGraph }))
)

// Pure utility — duplicated here to avoid a static import of the D3 module
function generateStubRelations(record: { id: string; normalizedValue: string; iocType: string; threatActors: string[]; malwareFamilies: string[] }): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [
    { id: record.id, type: record.iocType, label: record.normalizedValue, primary: true },
  ]
  const edges: GraphEdge[] = []
  record.threatActors.slice(0, 3).forEach((actor, i) => {
    const nodeId = `actor-${i}`
    nodes.push({ id: nodeId, type: 'actor', label: actor })
    edges.push({ source: record.id, target: nodeId, label: 'attributed' })
  })
  record.malwareFamilies.slice(0, 3).forEach((mal, i) => {
    const nodeId = `malware-${i}`
    nodes.push({ id: nodeId, type: 'malware', label: mal })
    edges.push({ source: record.id, target: nodeId, label: 'delivers' })
  })
  return { nodes, edges }
}
import { EnrichmentDetailPanel } from '@/components/viz/EnrichmentDetailPanel'

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

/** Map backend IOC types to EntityChip types (shared-ui uses file_hash_ prefix) */
function toChipType(iocType: string): string {
  if (iocType === 'hash_sha256') return 'file_hash_sha256'
  if (iocType === 'hash_sha1') return 'file_hash_sha1'
  if (iocType === 'hash_md5') return 'file_hash_md5'
  return iocType
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
  const [detailTab, setDetailTab] = useState<'enrichment' | 'details' | 'relations'>('enrichment')

  const queryParams = useMemo(() => ({
    page, limit: 50, sortBy, sortOrder,
    ...(search ? { q: search } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [page, search, sortBy, sortOrder, filters])

  const { data, isLoading, isDemo } = useIOCs(queryParams)
  const { data: stats } = useIOCStats()

  // Client-side filter + sort for demo data (API doesn't apply to static fallback)
  const rows = useMemo(() => {
    let items = data?.data ?? []
    if (!isDemo || items.length === 0) return items
    // Filter
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(r => r.normalizedValue.toLowerCase().includes(q) || r.iocType.includes(q) || r.tags.some(t => t.toLowerCase().includes(q)))
    }
    if (filters.iocType) items = items.filter(r => r.iocType === filters.iocType)
    if (filters.severity) items = items.filter(r => r.severity === filters.severity)
    if (filters.lifecycle) items = items.filter(r => r.lifecycle === filters.lifecycle)
    // Sort
    return [...items].sort((a, b) => {
      const av = a[sortBy as keyof IOCRecord] ?? ''
      const bv = b[sortBy as keyof IOCRecord] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [data, isDemo, sortBy, sortOrder, search, filters])

  const selectedRecord = useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId])
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
          <EntityChip type={toChipType(row.iocType) as any} value={row.normalizedValue}
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
      render: (row, d) => <SeverityBadge severity={row.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'} showDot={d !== 'ultra-dense'} />,
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
    {
      key: 'campaignId', label: 'Campaign', width: '8%',
      render: (row) => row.campaignId
        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-400/10 text-purple-400 font-medium truncate max-w-[80px] block" title={row.campaignId}>{row.campaignId}</span>
        : null,
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

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search IOCs by value, type, tag…"
        filters={IOC_FILTERS}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
      >
        {/* Inline stats — merged into filter bar row */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto text-[10px] sm:text-xs shrink-0">
          <span className="text-text-muted">IOCs <span className="text-text-primary font-medium">{stats?.total?.toLocaleString() ?? '—'}</span></span>
          <span className="text-text-muted">Critical <span className="text-sev-critical font-medium">{stats?.bySeverity?.['critical'] ?? 0}</span></span>
          <span className="text-text-muted">Active <span className="text-sev-low font-medium">{stats?.byLifecycle?.['active'] ?? 0}</span></span>
          <span className="text-text-muted">New <span className="text-accent font-medium">{stats?.byLifecycle?.['new'] ?? 0}</span></span>
        </div>
      </FilterBar>

      {/* #7: Split-pane layout — table left, detail right */}
      <SplitPane
        onCloseRight={() => setSelectedId(null)}
        left={
          <DataTable
            columns={columns}
            data={rows}
            loading={isLoading}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            rowKey={(r) => r.id}
            density={density}
            severityField={(r) => r.severity}
            selectedId={selectedId}
            onRowClick={(r) => {
              setSelectedId(r.id === selectedId ? null : r.id)
            }}
            emptyMessage="No IOCs found. Activate a feed to start ingesting threat intelligence."
          />
        }
        right={selectedRecord ? (
          <div className="h-full flex flex-col">
            {/* Compact IOC header — always visible */}
            <div className="shrink-0 p-3 border-b border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary truncate max-w-[70%]">{selectedRecord.normalizedValue}</span>
                <SeverityBadge severity={selectedRecord.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'} />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-text-muted">
                <span className="uppercase font-mono">{selectedRecord.iocType}</span>
                <span>Conf: <span className="text-text-primary tabular-nums">{selectedRecord.confidence}%</span></span>
                <span className="uppercase">{selectedRecord.tlp}</span>
                <span>{selectedRecord.lifecycle}</span>
              </div>
            </div>

            {/* Tab bar */}
            <div className="shrink-0 flex border-b border-border">
              {([
                { key: 'enrichment' as const, label: 'Enrichment', icon: Brain },
                { key: 'details' as const, label: 'Details', icon: FileText },
                { key: 'relations' as const, label: 'Relations', icon: GitBranch },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors',
                    detailTab === key
                      ? 'text-accent border-b-2 border-accent bg-accent/5'
                      : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content — fills remaining height */}
            <div className="flex-1 overflow-y-auto">
              {detailTab === 'enrichment' && (
                <EnrichmentDetailPanel
                  iocId={selectedRecord.id}
                  iocType={selectedRecord.iocType}
                  enrichment={null}
                  className="p-3"
                />
              )}
              {detailTab === 'details' && (
                <IOCDetailBack
                  record={selectedRecord}
                  onFlipBack={() => setDetailTab('enrichment')}
                />
              )}
              {detailTab === 'relations' && stubRelations && (
                <div className="p-2">
                  <Suspense fallback={<div className="rounded-lg border border-border bg-bg-secondary/30" style={{ width: 280, height: 200 }} />}>
                    <LazyRelationshipGraph
                      nodes={stubRelations.nodes}
                      edges={stubRelations.edges}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
        ) : null}
        showRight={!!selectedId}
      />

      <Pagination
        page={page} limit={50} total={isDemo ? rows.length : (data?.total ?? 0)}
        onPageChange={setPage}
        density={density}
        onDensityChange={setDensity}
      />

      {/* #9: Quick-action toolbar */}
      <QuickActionToolbar
        selectedCount={selectedId ? 1 : 0}
        onClear={() => setSelectedId(null)}
      />
    </div>
  )
}
