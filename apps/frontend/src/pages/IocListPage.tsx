/**
 * @module pages/IocListPage
 * @description IOC Intelligence list page — shows all IOCs with EntityChip,
 * SeverityBadge, density-adaptive table, severity row tinting.
 * P0-3: Inline entity hover preview. P0-5: Radial confidence gauge.
 */
import { useState, useMemo } from 'react'
import { useIOCs, useIOCStats, type IOCRecord } from '@/hooks/use-intel-data'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { TableSkeleton } from '@/components/data/TableSkeleton'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { EntityChip } from '@etip/shared-ui/components/EntityChip'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { EntityPreview } from '@/components/viz/EntityPreview'
import { SplitPane } from '@/components/viz/SplitPane'
import { QuickActionToolbar } from '@/components/viz/QuickActionToolbar'
import { SparklineCell, generateStubTrend } from '@/components/viz/SparklineCell'
import { IocDetailPanel } from './IocDetailPanel'

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
  { key: 'hasCampaign', label: 'Campaign', options: [
    { value: 'true', label: 'Campaign IOCs only' },
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

  const debouncedSearch = useDebouncedValue(search, 300)

  const queryParams = useMemo(() => ({
    page, limit: 50, sortBy, sortOrder,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [page, debouncedSearch, sortBy, sortOrder, filters])

  const { data, isLoading, isDemo } = useIOCs(queryParams)
  const { data: stats } = useIOCStats()

  // Client-side filter + sort for demo data
  const rows = useMemo(() => {
    let items = data?.data ?? []
    if (!isDemo || items.length === 0) return items
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(r => r.normalizedValue.toLowerCase().includes(q) || r.iocType.includes(q) || r.tags.some(t => t.toLowerCase().includes(q)))
    }
    if (filters.iocType) items = items.filter(r => r.iocType === filters.iocType)
    if (filters.severity) items = items.filter(r => r.severity === filters.severity)
    if (filters.lifecycle) items = items.filter(r => r.lifecycle === filters.lifecycle)
    if (filters.hasCampaign === 'true') items = items.filter(r => r.campaignId != null && r.campaignId !== '')
    return [...items].sort((a, b) => {
      const av = a[sortBy as keyof IOCRecord] ?? ''
      const bv = b[sortBy as keyof IOCRecord] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [data, isDemo, sortBy, sortOrder, search, filters])

  const selectedRecord = useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId])

  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('desc') }
  }

  const columns: Column<IOCRecord>[] = [
    {
      key: 'normalizedValue', label: 'Value', sortable: true, width: '26%',
      render: (row) => (
        <EntityPreview type={row.iocType} value={row.normalizedValue} severity={row.severity} confidence={row.confidence} firstSeen={row.firstSeen} lastSeen={row.lastSeen} tags={row.tags}>
          <EntityChip type={toChipType(row.iocType) as any} value={row.normalizedValue} />
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
        <div className="flex items-center gap-2 sm:gap-3 ml-auto text-[10px] sm:text-xs shrink-0">
          <span className="text-text-muted">IOCs <span className="text-text-primary font-medium">{stats?.total?.toLocaleString() ?? '—'}</span></span>
          <span className="text-text-muted">Critical <span className="text-sev-critical font-medium">{(stats?.bySeverity as Record<string, number> | undefined)?.['critical'] ?? 0}</span></span>
          <span className="text-text-muted">Active <span className="text-sev-low font-medium">{(stats?.byLifecycle as Record<string, number> | undefined)?.['active'] ?? 0}</span></span>
          <span className="text-text-muted">New <span className="text-accent font-medium">{(stats?.byLifecycle as Record<string, number> | undefined)?.['new'] ?? 0}</span></span>
        </div>
      </FilterBar>

      <SplitPane
        onCloseRight={() => setSelectedId(null)}
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
            severityField={(r) => r.severity}
            selectedId={selectedId}
            onRowClick={(r) => {
              setSelectedId(r.id === selectedId ? null : r.id)
            }}
            emptyMessage="No IOCs found. Activate a feed to start ingesting threat intelligence."
          />
        )}
        right={selectedRecord ? (
          <IocDetailPanel record={selectedRecord} isDemo={isDemo} />
        ) : null}
        showRight={!!selectedId}
      />

      <Pagination
        page={page} limit={50} total={isDemo ? rows.length : (data?.total ?? 0)}
        onPageChange={setPage}
        density={density}
        onDensityChange={setDensity}
      />

      <QuickActionToolbar
        selectedCount={selectedId ? 1 : 0}
        onClear={() => setSelectedId(null)}
      />
    </div>
  )
}
