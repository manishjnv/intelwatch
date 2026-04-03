/**
 * @module pages/IocListPage
 * @description IOC Intelligence list page — Tier 1 stats + Tier 2 bulk actions,
 * context menu, create modal, saved filter presets.
 */
import { useState, useMemo, useCallback, type MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useIOCs, useIOCStats, useUpdateIOCLifecycle, type IOCRecord } from '@/hooks/use-intel-data'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useMultiSelect } from '@/hooks/use-multi-select'
import { DataTable, type Density } from '@/components/data/DataTable'
import { TableSkeleton } from '@/components/data/TableSkeleton'
import { FilterBar } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { toast, ToastContainer } from '@/components/ui/Toast'
import { SplitPane } from '@/components/viz/SplitPane'
import { QuickActionToolbar } from '@/components/viz/QuickActionToolbar'
import { IocStatsCards } from '@/components/ioc/IocStatsCards'
import { IOC_FILTERS } from '@/components/ioc/ioc-constants'
import { getIocColumns } from '@/components/ioc/ioc-columns'
import { CreateIocModal } from '@/components/ioc/CreateIocModal'
import { IocContextMenu } from '@/components/ioc/IocContextMenu'
import { IocComparePanel } from '@/components/ioc/IocComparePanel'
import { InlineEnrichmentRow } from '@/components/ioc/InlineEnrichmentRow'
import { SavedFilterPresets } from '@/components/ioc/SavedFilterPresets'
import { exportCsv, exportJson, exportStix } from '@/utils/ioc-export'
import { useEnrichmentStats } from '@/hooks/use-enrichment-data'
import { useCampaigns, type Campaign } from '@/hooks/use-campaigns'
import { CampaignPanel } from '@/components/campaigns/CampaignPanel'
import { IocDetailPanel } from './IocDetailPanel'
import { Download, Plus } from 'lucide-react'
import type { FilterPreset } from '@/hooks/use-filter-presets'

export function IocListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('lastSeen')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ ioc: IOCRecord; pos: { x: number; y: number } } | null>(null)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const queryClient = useQueryClient()

  const debouncedSearch = useDebouncedValue(search, 300)

  const queryParams = useMemo(() => ({
    page, limit: 50, sort: sortBy, order: sortOrder,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [page, debouncedSearch, sortBy, sortOrder, filters])

  const { data, isLoading, isDemo } = useIOCs(queryParams)
  const { data: stats } = useIOCStats()
  const { data: enrichmentStats } = useEnrichmentStats()
  const { data: campaignData } = useCampaigns({ limit: 50 })
  const lifecycleMutation = useUpdateIOCLifecycle()

  const campaignMap = useMemo(() => {
    const map = new Map<string, Campaign>()
    ;(campaignData?.data ?? []).forEach(c => map.set(c.id, c))
    return map
  }, [campaignData])

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
    if (filters.source) items = items.filter(r => (r as any).source === filters.source)
    if (filters.hasCampaign === 'true') items = items.filter(r => r.campaignId != null && r.campaignId !== '')
    return [...items].sort((a, b) => {
      const av = a[sortBy as keyof IOCRecord] ?? ''
      const bv = b[sortBy as keyof IOCRecord] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [data, isDemo, sortBy, sortOrder, search, filters])

  const rowIds = useMemo(() => rows.map(r => r.id), [rows])
  const { selectedIds, toggle, selectAllOnPage, clear: clearSelection, selectAllState } = useMultiSelect(rowIds)
  const selectedRecord = useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId])

  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('desc') }
  }

  // Build MITRE technique map from cached enrichment data (progressive — fills as user views IOCs)
  const mitreMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const r of rows) {
      const cached = queryClient.getQueryData<any>(['enrichment-ioc', r.id])
      const techniques = cached?.haikuResult?.mitreTechniques ?? cached?.mitreTechniques
      if (Array.isArray(techniques) && techniques.length > 0) map.set(r.id, techniques)
    }
    return map
  }, [rows, queryClient])

  const columns = useMemo(() => getIocColumns({
    campaignMap,
    expandedCampaignId,
    onCampaignClick: (id) => setExpandedCampaignId(id || null),
    mitreMap,
  }), [campaignMap, expandedCampaignId, mitreMap])

  // Bulk actions
  const selectedRows = useMemo(() => rows.filter(r => selectedIds.has(r.id)), [rows, selectedIds])

  const handleBulkExport = useCallback((format: 'csv' | 'json' | 'stix') => {
    const target = selectedRows.length > 0 ? selectedRows : rows
    if (format === 'csv') exportCsv(target)
    else if (format === 'json') exportJson(target)
    else exportStix(target)
    toast(`Exported ${target.length} IOCs as ${format.toUpperCase()}`, 'success')
  }, [selectedRows, rows])

  const handleBulkLifecycle = useCallback((state: string) => {
    selectedIds.forEach(id => lifecycleMutation.mutate({ iocId: id, state }))
    toast(`Lifecycle → ${state} for ${selectedIds.size} IOCs`, 'success')
    clearSelection()
  }, [selectedIds, lifecycleMutation, clearSelection])

  const handleBulkTag = useCallback((tag: string) => {
    // Stub — bulk tag not wired to backend yet
    toast(`Tag "${tag}" applied to ${selectedIds.size} IOCs (backend pending)`, 'info')
  }, [selectedIds])

  const handleReEnrich = useCallback(() => {
    toast(`Re-enrichment queued for ${selectedIds.size} IOCs (backend pending)`, 'info')
  }, [selectedIds])

  const handleCompare = useCallback(() => {
    if (selectedIds.size >= 2 && selectedIds.size <= 3) setShowCompare(true)
  }, [selectedIds])

  const handleExpandRow = useCallback((id: string | null) => {
    setExpandedRowId(id)
    if (id) queryClient.prefetchQuery({ queryKey: ['enrichment-ioc', id], queryFn: () => Promise.resolve(null) })
  }, [queryClient])

  const handleContextMenu = useCallback((row: IOCRecord, event: MouseEvent) => {
    setContextMenu({ ioc: row, pos: { x: event.clientX, y: event.clientY } })
  }, [])

  const handleLifecycleFromContext = useCallback((iocId: string, state: string) => {
    lifecycleMutation.mutate({ iocId, state })
    toast(`Lifecycle → ${state}`, 'success')
  }, [lifecycleMutation])

  const handleLoadPreset = useCallback((preset: FilterPreset) => {
    setFilters(preset.filters)
    setSortBy(preset.sortBy)
    setSortOrder(preset.sortOrder)
    if (preset.search !== undefined) setSearch(preset.search)
    setPage(1)
  }, [])

  // Single-export dropdown
  const dl = (fn: () => void) => { fn(); setShowExport(false) }

  return (
    <div className="flex flex-col h-full">
      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search IOCs by value, type, tag…"
        filters={IOC_FILTERS}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
      >
        <div className="flex items-center gap-2 sm:gap-3 ml-auto text-[10px] sm:text-xs shrink-0">
          <SavedFilterPresets currentFilters={filters} currentSortBy={sortBy}
            currentSortOrder={sortOrder} currentSearch={search} onLoadPreset={handleLoadPreset} />
          <button onClick={() => setShowCreateModal(true)} data-testid="add-ioc-btn"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition-colors">
            <Plus className="w-3 h-3" />IOC
          </button>
          <div className="relative">
            <button onClick={() => setShowExport(s => !s)} data-testid="export-iocs-btn"
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border text-text-muted hover:text-accent hover:border-accent/30 transition-colors">
              <Download className="w-3 h-3" />Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 bg-bg-secondary border border-border rounded-lg shadow-lg z-20 py-1 w-36" data-testid="export-dropdown">
                <button onClick={() => dl(() => exportCsv(rows))} className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover">CSV</button>
                <button onClick={() => dl(() => exportJson(rows))} className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover">JSON</button>
                <button onClick={() => dl(() => exportStix(rows))} className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover">STIX 2.1 Bundle</button>
              </div>
            )}
          </div>
          <span className="text-text-muted">IOCs <span className="text-text-primary font-medium">{stats?.total?.toLocaleString() ?? '—'}</span></span>
        </div>
      </FilterBar>

      <IocStatsCards
        stats={stats as { total: number; byType: Record<string, number>; bySeverity: Record<string, number>; byLifecycle: Record<string, number> } | null}
        enrichmentStats={enrichmentStats as { total: number; enriched: number; pending: number; failed: number } | null}
        feedCount={12}
      />

      <SplitPane
        onCloseRight={() => setSelectedId(null)}
        left={isLoading ? (
          <TableSkeleton rows={10} columns={columns.length} />
        ) : (
          <DataTable
            columns={columns} data={rows} loading={false}
            sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}
            rowKey={(r) => r.id} density={density}
            severityField={(r) => r.severity}
            selectedId={selectedId}
            onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
            selectable selectedIds={selectedIds}
            onSelectToggle={toggle}
            onSelectAllPage={() => selectAllOnPage(rowIds)}
            selectAllState={selectAllState(rowIds)}
            onRowContextMenu={handleContextMenu}
            expandableRow={(r) => {
              const cached = queryClient.getQueryData<any>(['enrichment-ioc', r.id])
              return <InlineEnrichmentRow enrichment={cached ? {
                vtDetections: cached.vtResult?.positives ?? cached.vtDetections,
                vtTotal: cached.vtResult?.total ?? cached.vtTotal,
                abuseipdbScore: cached.abuseipdbResult?.abuseConfidenceScore ?? cached.abuseipdbScore,
                country: cached.geolocation?.country ?? cached.country,
                countryCode: cached.geolocation?.countryCode ?? cached.countryCode,
                severity: cached.haikuResult?.severity ?? cached.severity,
                riskVerdict: cached.haikuResult?.summary ?? cached.riskVerdict,
              } : null} isLoading={false} />
            }}
            expandedRowId={expandedRowId}
            onExpandRow={handleExpandRow}
            emptyMessage="No IOCs found. Activate a feed to start ingesting threat intelligence."
          />
        )}
        right={selectedRecord ? <IocDetailPanel record={selectedRecord} isDemo={isDemo} /> : null}
        showRight={!!selectedId}
      />

      <Pagination page={page} limit={50} total={isDemo ? rows.length : (data?.total ?? 0)}
        onPageChange={setPage} density={density} onDensityChange={setDensity} />

      {/* Campaign detail overlay */}
      {expandedCampaignId && campaignMap.has(expandedCampaignId) && (
        <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-bg-primary border-l border-border shadow-xl z-30 overflow-y-auto" data-testid="campaign-overlay">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="text-xs font-medium text-text-primary">Campaign Detail</span>
            <button onClick={() => setExpandedCampaignId(null)} className="text-text-muted hover:text-text-primary text-xs">&times;</button>
          </div>
          <CampaignPanel campaign={campaignMap.get(expandedCampaignId)!} />
        </div>
      )}

      {/* Context menu */}
      <IocContextMenu
        ioc={contextMenu?.ioc ?? null} position={contextMenu?.pos ?? null}
        onClose={() => setContextMenu(null)} onLifecycleChange={handleLifecycleFromContext}
      />

      {/* Create IOC modal */}
      <CreateIocModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />

      {/* Bulk action toolbar */}
      <QuickActionToolbar
        selectedCount={selectedIds.size || (selectedId ? 1 : 0)}
        onBulkExport={handleBulkExport}
        onBulkTag={handleBulkTag}
        onCompare={handleCompare}
        onLifecycleChange={handleBulkLifecycle}
        onReEnrich={handleReEnrich}
        onClear={() => { clearSelection(); setSelectedId(null) }}
      />

      {/* IOC Compare Panel (Feature 4) */}
      {showCompare && selectedRows.length >= 2 && (
        <IocComparePanel records={selectedRows.slice(0, 3)} onClose={() => setShowCompare(false)} />
      )}
      <ToastContainer />
    </div>
  )
}
