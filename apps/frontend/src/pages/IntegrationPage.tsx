/**
 * @module pages/IntegrationPage
 * @description Enterprise Integration dashboard — SIEM connectors, webhooks,
 * ticketing, STIX/TAXII collections, and bulk export management.
 * 5 tabs with tables, add modals, and detail panels.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useSIEMIntegrations, useWebhooks, useTicketingIntegrations,
  useSTIXCollections, useBulkExports, useIntegrationStats,
  type SIEMIntegration, type WebhookConfig, type TicketingIntegration,
  type STIXCollection, type BulkExport,
} from '@/hooks/use-phase5-data'
import { DataTable, type Column } from '@/components/data/DataTable'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  Radio, Webhook, Ticket, FileJson, Download,
  Plus, Activity,
} from 'lucide-react'
import {
  AddSIEMModal, AddWebhookModal, AddTicketingModal,
  AddSTIXModal, AddExportModal, IntegrationDetailPanel,
} from '@/components/viz/IntegrationModals'

// ─── Tab type ───────────────────────────────────────────────────

type IntegrationTab = 'siem' | 'webhooks' | 'ticketing' | 'stix' | 'exports'

const TABS: { key: IntegrationTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'siem', label: 'SIEM', icon: Radio },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook },
  { key: 'ticketing', label: 'Ticketing', icon: Ticket },
  { key: 'stix', label: 'STIX/TAXII', icon: FileJson },
  { key: 'exports', label: 'Bulk Export', icon: Download },
]

const STATUS_COLORS: Record<string, string> = {
  active: 'text-sev-low bg-sev-low/10',
  error: 'text-sev-critical bg-sev-critical/10',
  failing: 'text-sev-high bg-sev-high/10',
  disabled: 'text-text-muted bg-bg-elevated',
  paused: 'text-sev-medium bg-sev-medium/10',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[status] ?? '')}>
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-accent bg-accent/10 uppercase">
      {type}
    </span>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const hrs = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hrs < 1) return '<1h ago'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// ─── Main Component ─────────────────────────────────────────────

export function IntegrationPage() {
  const [activeTab, setActiveTab] = useState<IntegrationTab>('siem')
  const [showModal, setShowModal] = useState<IntegrationTab | null>(null)
  const [selectedItem, setSelectedItem] = useState<{ tab: IntegrationTab; item: any } | null>(null)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('asc') }
  }

  const { data: stats, isDemo } = useIntegrationStats()
  const { data: siemData } = useSIEMIntegrations()
  const { data: webhookData } = useWebhooks()
  const { data: ticketingData } = useTicketingIntegrations()
  const { data: stixData } = useSTIXCollections()
  const { data: exportData } = useBulkExports()

  const siemColumns: Column<SIEMIntegration>[] = useMemo(() => [
    { key: 'name', label: 'Name', sortable: true, width: '22%',
      render: (r) => <span className="text-text-primary font-medium text-xs">{r.name}</span> },
    { key: 'type', label: 'Type', width: '10%', render: (r) => <TypeBadge type={r.type} /> },
    { key: 'status', label: 'Status', width: '10%', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'eventsForwarded', label: 'Events', sortable: true, width: '12%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.eventsForwarded.toLocaleString()}</span> },
    { key: 'lastSync', label: 'Last Sync', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.lastSync)}</span> },
    { key: 'latencyMs', label: 'Latency', width: '10%',
      render: (r) => {
        const color = r.latencyMs > 200 ? 'text-sev-critical' : r.latencyMs > 100 ? 'text-sev-medium' : 'text-sev-low'
        return <span className={cn('tabular-nums font-medium', color)}>{r.latencyMs}ms</span>
      } },
  ], [])

  const webhookColumns: Column<WebhookConfig>[] = useMemo(() => [
    { key: 'url', label: 'URL', width: '28%',
      render: (r) => <span className="text-text-primary font-mono text-[11px] truncate block max-w-[240px]">{r.url}</span> },
    { key: 'events', label: 'Events', width: '18%',
      render: (r) => <span className="text-[10px] text-text-muted">{r.events.join(', ')}</span> },
    { key: 'status', label: 'Status', width: '10%', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'deliveryRate', label: 'Delivery %', width: '10%',
      render: (r) => {
        const color = r.deliveryRate >= 99 ? 'text-sev-low' : r.deliveryRate >= 90 ? 'text-sev-medium' : 'text-sev-critical'
        return <span className={cn('tabular-nums font-medium', color)}>{r.deliveryRate}%</span>
      } },
    { key: 'lastTriggered', label: 'Last Triggered', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.lastTriggered)}</span> },
    { key: 'dlqCount', label: 'DLQ', width: '8%',
      render: (r) => <span className={cn('tabular-nums', r.dlqCount > 0 ? 'text-sev-high font-medium' : 'text-text-muted')}>{r.dlqCount}</span> },
  ], [])

  const ticketingColumns: Column<TicketingIntegration>[] = useMemo(() => [
    { key: 'name', label: 'Name', sortable: true, width: '24%',
      render: (r) => <span className="text-text-primary font-medium text-xs">{r.name}</span> },
    { key: 'type', label: 'Type', width: '12%', render: (r) => <TypeBadge type={r.type} /> },
    { key: 'project', label: 'Project/Queue', width: '14%',
      render: (r) => <span className="text-text-secondary font-mono text-[11px]">{r.project}</span> },
    { key: 'autoCreateRules', label: 'Auto-Create Rules', width: '14%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.autoCreateRules}</span> },
    { key: 'status', label: 'Status', width: '10%', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'recentTickets', label: 'Recent Tickets', width: '12%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.recentTickets}</span> },
  ], [])

  const stixColumns: Column<STIXCollection>[] = useMemo(() => [
    { key: 'name', label: 'Collection', sortable: true, width: '24%',
      render: (r) => <span className="text-text-primary font-medium text-xs">{r.name}</span> },
    { key: 'type', label: 'Direction', width: '12%',
      render: (r) => (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
          r.type === 'publish' ? 'text-cyan-400 bg-cyan-400/10' : 'text-purple-400 bg-purple-400/10')}>
          {r.type}
        </span>
      ) },
    { key: 'objectCount', label: 'Objects', sortable: true, width: '12%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.objectCount.toLocaleString()}</span> },
    { key: 'lastPollOrPush', label: 'Last Activity', width: '14%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.lastPollOrPush)}</span> },
    { key: 'status', label: 'Status', width: '10%', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'pollingInterval', label: 'Interval', width: '10%',
      render: (r) => <span className="text-[10px] text-text-muted">{r.pollingInterval >= 86400 ? `${r.pollingInterval / 86400}d` : `${r.pollingInterval / 3600}h`}</span> },
  ], [])

  const exportColumns: Column<BulkExport>[] = useMemo(() => [
    { key: 'name', label: 'Export Name', sortable: true, width: '22%',
      render: (r) => <span className="text-text-primary font-medium text-xs">{r.name}</span> },
    { key: 'format', label: 'Format', width: '10%', render: (r) => <TypeBadge type={r.format} /> },
    { key: 'schedule', label: 'Schedule', width: '12%',
      render: (r) => <span className="text-text-secondary font-mono text-[11px]">{r.schedule}</span> },
    { key: 'lastRun', label: 'Last Run', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.lastRun)}</span> },
    { key: 'nextRun', label: 'Next Run', width: '12%',
      render: (r) => <span className="text-[10px] text-text-muted tabular-nums">{timeAgo(r.nextRun)}</span> },
    { key: 'status', label: 'Status', width: '10%', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'recordCount', label: 'Records', width: '10%',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.recordCount.toLocaleString()}</span> },
  ], [])

  const tabContent = {
    siem: { columns: siemColumns, data: siemData?.data ?? [], rowKey: (r: SIEMIntegration) => r.id, empty: 'No SIEM integrations configured.' },
    webhooks: { columns: webhookColumns, data: webhookData?.data ?? [], rowKey: (r: WebhookConfig) => r.id, empty: 'No webhooks configured.' },
    ticketing: { columns: ticketingColumns, data: ticketingData?.data ?? [], rowKey: (r: TicketingIntegration) => r.id, empty: 'No ticketing integrations configured.' },
    stix: { columns: stixColumns, data: stixData?.data ?? [], rowKey: (r: STIXCollection) => r.id, empty: 'No STIX/TAXII collections configured.' },
    exports: { columns: exportColumns, data: exportData?.data ?? [], rowKey: (r: BulkExport) => r.id, empty: 'No bulk exports configured.' },
  }

  const current = tabContent[activeTab]

  const sortedData = useMemo(() => {
    const items = [...current.data] as unknown as Record<string, unknown>[]
    return items.sort((a, b) => {
      const av = a[sortBy] ?? ''
      const bv = b[sortBy] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [current.data, sortBy, sortOrder])

  return (
    <div className="flex flex-col h-full">
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-400/10 text-rose-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect Integration service for live data</span>
        </div>
      )}

      <PageStatsBar>
        <CompactStat label="Total Integrations" value={stats?.total?.toString() ?? '—'} />
        <CompactStat label="Active" value={stats?.active?.toString() ?? '0'} color="text-sev-low" />
        <CompactStat label="Failing" value={stats?.failing?.toString() ?? '0'} color="text-sev-critical" />
        <CompactStat label="Events/hr" value={stats?.eventsPerHour?.toLocaleString() ?? '0'} color="text-accent" />
        <CompactStat label="Last Sync" value={timeAgo(stats?.lastSync ?? null)} />
      </PageStatsBar>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Tab Navigation + Add Button */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === key ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary')}>
              <Icon className="w-3 h-3" /><span className="hidden sm:inline">{label}</span>
              <span className="text-[10px] text-text-muted hidden sm:inline">({tabContent[key].data.length})</span>
            </button>
          ))}
          <button onClick={() => setShowModal(activeTab)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors">
            <Plus className="w-3 h-3" />
            Add {TABS.find(t => t.key === activeTab)?.label}
          </button>
        </div>

        {/* Tab Summary Cards */}
        {activeTab === 'siem' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {(siemData?.data ?? []).map(s => (
              <div key={s.id} className="p-3 bg-bg-secondary rounded-lg border border-border cursor-pointer hover:border-accent/30 transition-colors"
                onClick={() => setSelectedItem({ tab: 'siem', item: s })}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-text-primary truncate">{s.name}</span>
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex items-center gap-3 text-[10px] text-text-muted">
                  <span><Activity className="w-3 h-3 inline mr-0.5" />{s.eventsForwarded.toLocaleString()}</span>
                  <span>{s.latencyMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Data Table */}
        <DataTable
          columns={current.columns as any}
          data={sortedData}
          loading={false}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          rowKey={current.rowKey as any}
          density="compact"
          onRowClick={(r: any) => setSelectedItem({ tab: activeTab, item: r })}
          emptyMessage={current.empty}
        />
      </div>

      {/* Modals */}
      <AddSIEMModal open={showModal === 'siem'} onClose={() => setShowModal(null)} />
      <AddWebhookModal open={showModal === 'webhooks'} onClose={() => setShowModal(null)} />
      <AddTicketingModal open={showModal === 'ticketing'} onClose={() => setShowModal(null)} />
      <AddSTIXModal open={showModal === 'stix'} onClose={() => setShowModal(null)} />
      <AddExportModal open={showModal === 'exports'} onClose={() => setShowModal(null)} />

      {/* Detail Panel */}
      {selectedItem && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedItem(null)} />
          <IntegrationDetailPanel tab={selectedItem.tab} item={selectedItem.item} onClose={() => setSelectedItem(null)} isDemo={isDemo} />
        </>
      )}
    </div>
  )
}
