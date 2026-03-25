/**
 * @module pages/DRPDashboardPage
 * @description Digital Risk Protection dashboard — interactive asset monitoring,
 * alert feed with triage actions, typosquat scanner, CertStream status.
 * Improvements: #1 visual diff, #2 executive risk score, #3 CertStream ticker,
 * #4 alert SLA tracking, #5 risk heatmap calendar.
 * Interactive: Asset CRUD, alert detail panel, scan triggers, triage actions.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useDRPAssets, useDRPAlerts, useDRPAlertStats, useDRPAssetStats,
  useCertStreamStatus, useDeleteAsset, useScanAsset,
  type DRPAlert, type DRPAsset,
} from '@/hooks/use-phase4-data'
import { generateAlertHeatmap } from '@/hooks/phase4-demo-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import {
  Shield, AlertTriangle, Globe, User, Server,
  Plus, Play, Trash2,
} from 'lucide-react'
import {
  ExecutiveRiskGauge, RiskHeatmap, CertStreamIndicator,
  SLABadge, TyposquatScanner,
} from '@/components/viz/DRPWidgets'
import { CreateAssetModal, AlertDetailPanel } from '@/components/viz/DRPModals'

// ─── Constants ──────────────────────────────────────────────────

const ALERT_FILTERS: FilterOption[] = [
  { key: 'type', label: 'Type', options: [
    { value: 'typosquatting', label: 'Typosquatting' }, { value: 'dark_web', label: 'Dark Web' },
    { value: 'credential_leak', label: 'Credential Leak' }, { value: 'attack_surface', label: 'Attack Surface' },
  ]},
  { key: 'severity', label: 'Severity', options: [
    { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
  ]},
  { key: 'status', label: 'Status', options: [
    { value: 'open', label: 'Open' }, { value: 'investigating', label: 'Investigating' },
    { value: 'resolved', label: 'Resolved' }, { value: 'false_positive', label: 'False Positive' },
  ]},
]

const TYPE_COLORS: Record<string, string> = {
  typosquatting: 'text-rose-400 bg-rose-400/10',
  dark_web: 'text-purple-400 bg-purple-400/10',
  credential_leak: 'text-sev-critical bg-sev-critical/10',
  attack_surface: 'text-sev-medium bg-sev-medium/10',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'text-sev-critical bg-sev-critical/10',
  investigating: 'text-sev-medium bg-sev-medium/10',
  resolved: 'text-sev-low bg-sev-low/10',
  false_positive: 'text-text-muted bg-bg-elevated',
}

const ASSET_TYPE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  domain: Globe, brand_name: Shield, email_domain: User, ip_range: Server,
}

// ─── Main Component ─────────────────────────────────────────────

export function DRPDashboardPage() {
  const [alertPage, setAlertPage] = useState(1)
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'alerts' | 'assets'>('alerts')
  const [showCreateAsset, setShowCreateAsset] = useState(false)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)

  const { data: alertData, isLoading: alertsLoading, isDemo } = useDRPAlerts({ page: alertPage, ...filters })
  const { data: alertStats } = useDRPAlertStats()
  const { data: assetData } = useDRPAssets()
  const { data: assetStats } = useDRPAssetStats()
  const { data: certStatus } = useCertStreamStatus()
  const deleteAssetMutation = useDeleteAsset()
  const scanAssetMutation = useScanAsset()
  const heatmapData = useMemo(() => generateAlertHeatmap(), [])

  const execRiskScore = useMemo(() => {
    if (!alertStats || !assetStats) return 0
    // Balanced formula: open ratio (0-25), severity mix (0-35), asset risk (0-25), volume (0-15)
    const openRatio = alertStats.total > 0 ? (alertStats.open + alertStats.investigating) / alertStats.total : 0
    const critCount = alertStats.bySeverity['critical'] ?? 0
    const highCount = alertStats.bySeverity['high'] ?? 0
    const sevScore = Math.min(35, critCount * 8 + highCount * 4)
    const assetRisk = assetStats.avgRiskScore * 0.25
    const volumeScore = Math.min(15, alertStats.total * 1.5)
    return Math.min(95, Math.round(openRatio * 25 + sevScore + assetRisk + volumeScore))
  }, [alertStats, assetStats])

  const alerts = useMemo(() => {
    let items = alertData?.data ?? []
    if (!isDemo) return items
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(a => a.title.toLowerCase().includes(q) || a.detectedValue.toLowerCase().includes(q))
    }
    if (filters.type) items = items.filter(a => a.type === filters.type)
    if (filters.severity) items = items.filter(a => a.severity === filters.severity)
    if (filters.status) items = items.filter(a => a.status === filters.status)
    return items
  }, [alertData, isDemo, search, filters])

  const selectedAlert = useMemo(
    () => alerts.find(a => a.id === selectedAlertId) ?? null,
    [alerts, selectedAlertId],
  )

  const alertColumns: Column<DRPAlert>[] = [
    { key: 'severity', label: 'Sev', width: '6%',
      render: (row) => <SeverityBadge severity={row.severity.toUpperCase() as any} showDot /> },
    { key: 'title', label: 'Alert', sortable: true, width: '30%',
      render: (row) => (
        <div className="min-w-0">
          <div className="text-text-primary font-medium truncate text-xs">{row.title}</div>
          <div className="text-[10px] text-text-muted truncate">{row.description}</div>
        </div>
      ) },
    { key: 'type', label: 'Type', width: '11%',
      render: (row) => <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TYPE_COLORS[row.type] ?? '')}>{row.type.replace('_', ' ')}</span> },
    { key: 'detectedValue', label: 'Detected Value', width: '16%',
      render: (row) => <span className="text-text-secondary font-mono text-[11px] truncate block max-w-[160px]">{row.detectedValue}</span> },
    { key: 'confidence', label: 'Conf', width: '7%',
      render: (row) => <span className="tabular-nums">{row.confidence}%</span> },
    { key: 'status', label: 'Status', width: '10%',
      render: (row) => <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_COLORS[row.status] ?? '')}>{row.status.replace('_', ' ')}</span> },
    { key: 'sla', label: 'SLA', width: '10%',
      render: (row) => <SLABadge createdAt={row.createdAt} triagedAt={row.triagedAt} resolvedAt={row.resolvedAt} /> },
    { key: 'assignee', label: 'Owner', width: '8%',
      render: (row) => row.assignee ? <span className="text-[10px] text-accent">{row.assignee}</span> : <span className="text-[10px] text-text-muted">—</span> },
  ]

  const assetColumns: Column<DRPAsset>[] = [
    { key: 'name', label: 'Asset', sortable: true, width: '24%',
      render: (row) => {
        const Icon = ASSET_TYPE_ICONS[row.type] ?? Globe
        return (
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <div className="min-w-0">
              <div className="text-text-primary font-medium truncate text-xs">{row.name}</div>
              <div className="text-[10px] text-text-muted font-mono truncate">{row.value}</div>
            </div>
          </div>
        )
      } },
    { key: 'type', label: 'Type', width: '10%',
      render: (row) => <span className="text-[10px] text-text-muted uppercase">{row.type.replace('_', ' ')}</span> },
    { key: 'status', label: 'Status', width: '8%',
      render: (row) => <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', row.status === 'active' ? 'text-sev-low bg-sev-low/10' : 'text-text-muted bg-bg-elevated')}>{row.status}</span> },
    { key: 'riskScore', label: 'Risk', sortable: true, width: '8%',
      render: (row) => {
        const color = row.riskScore >= 70 ? 'text-sev-critical' : row.riskScore >= 40 ? 'text-sev-medium' : 'text-sev-low'
        return <span className={cn('font-medium tabular-nums', color)}>{row.riskScore}</span>
      } },
    { key: 'alertCount', label: 'Alerts', width: '8%',
      render: (row) => <span className={cn('tabular-nums', row.alertCount > 0 ? 'text-sev-high font-medium' : 'text-text-muted')}>{row.alertCount}</span> },
    { key: 'lastScanAt', label: 'Last Scan', width: '12%',
      render: (row) => {
        if (!row.lastScanAt) return <span className="text-text-muted">Never</span>
        const hrs = Math.round((Date.now() - new Date(row.lastScanAt).getTime()) / 3_600_000)
        return <span className="text-[10px] text-text-muted tabular-nums">{hrs < 1 ? '<1h ago' : `${hrs}h ago`}</span>
      } },
    { key: 'actions', label: '', width: '14%',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => scanAssetMutation.mutate(row.id)}
            disabled={scanAssetMutation.isPending || isDemo}
            title="Scan now"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <Play className="w-3 h-3" />
            Scan
          </button>
          <button
            onClick={() => deleteAssetMutation.mutate(row.id)}
            disabled={deleteAssetMutation.isPending || isDemo}
            title="Delete asset"
            className="p-1 rounded text-text-muted hover:text-sev-critical hover:bg-sev-critical/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ) },
  ]

  return (
    <div className="flex flex-col h-full">
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-400/10 text-rose-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect DRP service for live monitoring</span>
        </div>
      )}

      <PageStatsBar>
        <CompactStat label="Assets" value={assetStats?.total?.toString() ?? '—'} />
        <CompactStat label="Open Alerts" value={alertStats?.open?.toString() ?? '0'} color="text-sev-critical" />
        <CompactStat label="Investigating" value={alertStats?.investigating?.toString() ?? '0'} color="text-sev-medium" />
        <CompactStat label="Resolved" value={alertStats?.resolved?.toString() ?? '0'} color="text-sev-low" />
        <CompactStat label="Risk Score" value={execRiskScore.toString()} color={execRiskScore >= 70 ? 'text-sev-critical' : execRiskScore >= 40 ? 'text-sev-medium' : 'text-sev-low'} />
      </PageStatsBar>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Top row: Risk Score + CertStream + Alerts by Type */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-bg-secondary rounded-lg border border-border flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-text-primary uppercase">Digital Risk Score</h3>
              <TooltipHelp message="Composite score based on open alert ratio, severity distribution, asset risk, and alert volume. Capped at 95 — only a confirmed breach reaches 100." />
            </div>
            <ExecutiveRiskGauge score={execRiskScore} />
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span>Critical: <span className="text-sev-critical font-medium">{alertStats?.bySeverity['critical'] ?? 0}</span></span>
              <span>High: <span className="text-sev-high font-medium">{alertStats?.bySeverity['high'] ?? 0}</span></span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {certStatus && <CertStreamIndicator status={certStatus} />}
            <div className="p-3 bg-bg-secondary rounded-lg border border-border">
              <p className="text-[10px] text-text-muted uppercase mb-2">Alerts by Type</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(alertStats?.byType ?? {}).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-[10px]">
                    <span className={cn('px-1.5 py-0.5 rounded-full font-medium', TYPE_COLORS[type] ?? '')}>{type.replace('_', ' ')}</span>
                    <span className="text-text-primary tabular-nums font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick stats summary card */}
          <div className="p-4 bg-bg-secondary rounded-lg border border-border space-y-3">
            <h3 className="text-[10px] text-text-muted uppercase font-medium">Alert Summary</h3>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-lg font-bold text-text-primary tabular-nums">{alertStats?.total ?? 0}</span><p className="text-[10px] text-text-muted">Total Alerts</p></div>
              <div><span className="text-lg font-bold text-sev-critical tabular-nums">{alertStats?.open ?? 0}</span><p className="text-[10px] text-text-muted">Unresolved</p></div>
              <div><span className="text-lg font-bold text-sev-low tabular-nums">{alertStats?.resolved ?? 0}</span><p className="text-[10px] text-text-muted">Resolved</p></div>
              <div><span className="text-lg font-bold text-text-primary tabular-nums">{assetStats?.total ?? 0}</span><p className="text-[10px] text-text-muted">Assets Monitored</p></div>
            </div>
          </div>
        </div>

        {/* Alert Activity Heatmap — full width for visibility */}
        <div className="p-4 bg-bg-secondary rounded-lg border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-text-primary">Alert Activity</h3>
              <span className="text-[10px] text-text-muted">Last 90 days</span>
              <TooltipHelp message="GitHub-style heatmap showing daily alert density. Darker = more alerts. Hover for exact counts." />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span>Less</span>
              <div className="w-3 h-3 rounded-sm bg-bg-elevated border border-border/50" />
              <div className="w-3 h-3 rounded-sm bg-sev-low/40" />
              <div className="w-3 h-3 rounded-sm bg-sev-medium/50" />
              <div className="w-3 h-3 rounded-sm bg-sev-high/60" />
              <div className="w-3 h-3 rounded-sm bg-sev-critical/80" />
              <span>More</span>
            </div>
          </div>
          <RiskHeatmap data={heatmapData} />
        </div>

        {/* Typosquat Scanner */}
        <div className="p-4 bg-bg-secondary rounded-lg border border-border">
          <TyposquatScanner />
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'alerts' as const, label: 'Alert Feed', icon: AlertTriangle, count: alertStats?.total },
            { key: 'assets' as const, label: 'Monitored Assets', icon: Shield, count: assetStats?.total },
          ]).map(({ key, label, icon: Icon, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === key ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary')}>
              <Icon className="w-3 h-3" /><span className="hidden sm:inline">{label}</span>
              {count != null && <span className="text-[10px] text-text-muted hidden sm:inline">({count})</span>}
            </button>
          ))}

          {/* Add Asset button — visible on assets tab */}
          {activeTab === 'assets' && (
            <button
              onClick={() => setShowCreateAsset(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Asset
            </button>
          )}
        </div>

        {/* Alert Feed */}
        {activeTab === 'alerts' && (
          <>
            <FilterBar searchValue={search} onSearchChange={(v) => { setSearch(v); setAlertPage(1) }}
              searchPlaceholder="Search alerts by title, detected value…" filters={ALERT_FILTERS}
              filterValues={filters} onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setAlertPage(1) }} />
            <DataTable columns={alertColumns} data={alerts} loading={alertsLoading} rowKey={(r) => r.id}
              density={density} severityField={(r) => r.severity} selectedId={selectedAlertId}
              onRowClick={(r) => setSelectedAlertId(r.id === selectedAlertId ? null : r.id)}
              emptyMessage="No DRP alerts. Your digital perimeter is clear." />
            <Pagination page={alertPage} limit={50} total={isDemo ? alerts.length : (alertData?.total ?? 0)}
              onPageChange={setAlertPage} density={density} onDensityChange={setDensity} />
          </>
        )}

        {/* Asset Table */}
        {activeTab === 'assets' && (
          <DataTable columns={assetColumns} data={assetData?.data ?? []} loading={false} rowKey={(r) => r.id}
            density={density} emptyMessage="No monitored assets. Click 'Add Asset' to start monitoring your domains, brands, or executives." />
        )}
      </div>

      {/* Modals */}
      <CreateAssetModal open={showCreateAsset} onClose={() => setShowCreateAsset(false)} />

      {/* Alert Detail Panel */}
      {selectedAlert && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedAlertId(null)} />
          <AlertDetailPanel alert={selectedAlert} onClose={() => setSelectedAlertId(null)} isDemo={isDemo} />
        </>
      )}
    </div>
  )
}
