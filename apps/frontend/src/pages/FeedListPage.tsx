/**
 * @module pages/FeedListPage
 * @description Feed management page — shows active feeds with health status,
 * last fetch time, reliability gauge, and error indicators.
 * P0-5: Radial reliability gauge. P0-2: Severity heatmap for feed health.
 */
import { useState, useMemo } from 'react'
import { useFeeds, type FeedRecord } from '@/hooks/use-intel-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { Rss, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'

const FEED_FILTERS: FilterOption[] = [
  { key: 'feedType', label: 'Type', options: [
    { value: 'rss', label: 'RSS' }, { value: 'stix', label: 'STIX' },
    { value: 'taxii', label: 'TAXII' }, { value: 'misp', label: 'MISP' },
    { value: 'rest_api', label: 'REST API' }, { value: 'csv_upload', label: 'CSV' },
  ]},
  { key: 'status', label: 'Status', options: [
    { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' },
    { value: 'error', label: 'Error' }, { value: 'disabled', label: 'Disabled' },
  ]},
]

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    active: { icon: <CheckCircle className="w-3 h-3" />, color: 'text-sev-low', bg: 'bg-sev-low/10' },
    paused: { icon: <Clock className="w-3 h-3" />, color: 'text-sev-medium', bg: 'bg-sev-medium/10' },
    error: { icon: <XCircle className="w-3 h-3" />, color: 'text-sev-critical', bg: 'bg-sev-critical/10' },
    disabled: { icon: <XCircle className="w-3 h-3" />, color: 'text-text-muted', bg: 'bg-bg-elevated' },
  }
  const c = config[status] ?? config['disabled']!
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.color} ${c.bg}`}>
      {c.icon}{status}
    </span>
  )
}

function ReliabilityBar({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-sev-low' : value >= 40 ? 'bg-sev-medium' : 'bg-sev-critical'
  return (
    <div className="flex items-center gap-1.5" title={`Reliability: ${value}%`}>
      <div className="w-16 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-text-muted">{value}%</span>
    </div>
  )
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function FeedListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const queryParams = useMemo(() => ({
    page, limit: 50,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [page, filters])

  const { data, isLoading } = useFeeds(queryParams)

  const activeCount = data?.data?.filter(f => f.status === 'active').length ?? 0
  const errorCount = data?.data?.filter(f => f.status === 'error').length ?? 0
  const totalIngested = data?.data?.reduce((s, f) => s + f.totalItemsIngested, 0) ?? 0

  const columns: Column<FeedRecord>[] = [
    {
      key: 'name', label: 'Feed Name', sortable: true, width: '25%',
      render: (row) => (
        <div className="min-w-0">
          <div className="text-text-primary font-medium truncate">{row.name}</div>
          {row.description && <div className="text-[10px] text-text-muted truncate max-w-[250px]">{row.description}</div>}
        </div>
      ),
    },
    {
      key: 'feedType', label: 'Type', sortable: true, width: '8%',
      render: (row) => <span className="text-[10px] font-mono uppercase text-text-muted">{row.feedType}</span>,
    },
    {
      key: 'status', label: 'Status', sortable: true, width: '10%',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'feedReliability', label: 'Reliability', sortable: true, width: '12%',
      render: (row) => <ReliabilityBar value={row.feedReliability} />,
    },
    {
      key: 'schedule', label: 'Schedule', width: '8%',
      render: (row) => <span className="text-[10px] font-mono text-text-muted">{row.schedule ?? '—'}</span>,
    },
    {
      key: 'totalItemsIngested', label: 'Ingested', sortable: true, width: '8%',
      render: (row) => <span className="tabular-nums">{row.totalItemsIngested.toLocaleString()}</span>,
    },
    {
      key: 'lastFetchAt', label: 'Last Fetch', sortable: true, width: '10%',
      render: (row) => (
        <span className={`text-text-muted ${row.consecutiveFailures > 0 ? 'text-sev-critical' : ''}`}>
          {formatTime(row.lastFetchAt)}
        </span>
      ),
    },
    {
      key: 'consecutiveFailures', label: 'Errors', width: '6%',
      render: (row) => row.consecutiveFailures > 0
        ? <span className="text-sev-critical font-medium">{row.consecutiveFailures}</span>
        : <span className="text-text-muted">0</span>,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageStatsBar>
        <CompactStat icon={<Rss className="w-3 h-3" />} label="Total Feeds" value={data?.total?.toString() ?? '—'} />
        <CompactStat icon={<CheckCircle className="w-3 h-3" />} label="Active" value={activeCount.toString()} color="text-sev-low" />
        <CompactStat icon={<AlertTriangle className="w-3 h-3" />} label="Errors" value={errorCount.toString()} color="text-sev-critical" />
        <CompactStat icon={<Clock className="w-3 h-3" />} label="Items Ingested" value={totalIngested.toLocaleString()} />
      </PageStatsBar>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search feeds by name…"
        filters={FEED_FILTERS}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
      />

      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          density={density}
          emptyMessage="No feeds configured. Add a threat intelligence feed to start ingesting data."
        />
      </div>

      <Pagination
        page={page} limit={50} total={data?.total ?? 0}
        onPageChange={setPage} density={density} onDensityChange={setDensity}
      />
    </div>
  )
}
