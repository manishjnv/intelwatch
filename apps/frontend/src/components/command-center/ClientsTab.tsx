/**
 * @module components/command-center/ClientsTab
 * @description Tab 5: Super-admin tenant management — summary cards,
 * filterable tenant table, detail drawer with consumption sparkline.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter, TenantListItem } from '@/hooks/use-command-center'
import { DataTable, type Column } from '@/components/data/DataTable'
import {
  DollarSign, Users, Building2, AlertTriangle,
  Search, X, ChevronRight,
} from 'lucide-react'
import { TenantOverridePanel } from './TenantOverridePanel'
import { OffboardingPanel } from './OffboardingPanel'
import { AdminSsoView } from './SsoConfigPanel'

// ─── Types ──────────────────────────────────────────────────────

interface ClientsTabProps {
  data: ReturnType<typeof useCommandCenter>
}

// ─── Summary Card ───────────────────────────────────────────────

function SummaryCard({ icon, label, value, sublabel, color }: {
  icon: React.ReactNode; label: string; value: string; sublabel?: string; color?: string
}) {
  return (
    <div className="p-4 bg-bg-elevated rounded-lg border border-border">
      <div className="flex items-center gap-2 mb-1">
        <span className={color ?? 'text-text-muted'}>{icon}</span>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold text-text-primary tabular-nums">{value}</p>
      {sublabel && <p className="text-[10px] text-text-muted mt-0.5">{sublabel}</p>}
    </div>
  )
}

// ─── Plan Badge ─────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    free: 'bg-bg-elevated text-text-muted',
    starter: 'bg-sev-low/20 text-sev-low',
    teams: 'bg-accent/20 text-accent',
    enterprise: 'bg-purple-400/20 text-purple-400',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium capitalize', colors[plan] ?? colors.free)}>
      {plan}
    </span>
  )
}

// ─── Usage Dots ─────────────────────────────────────────────────

function UsageDots({ percent }: { percent: number }) {
  const filled = Math.min(5, Math.round(percent / 20))
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={cn(
            'w-2 h-2 rounded-full',
            i < filled ? 'bg-accent' : 'border border-border',
          )}
        />
      ))}
    </div>
  )
}

// ─── MiniSparkline ──────────────────────────────────────────────

function MiniSparkline({ data, width = 200, height = 60 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * height}`).join(' ')
  return (
    <svg width={width} height={height} className="text-accent">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Tenant Detail Drawer ─────────���─────────────────────────────

function TenantDetailDrawer({ tenant, data, onClose }: {
  tenant: TenantListItem
  data: ReturnType<typeof useCommandCenter>
  onClose: () => void
}) {
  const sparklineData = data.tenantStats.consumptionTrend.map(d => d.count)

  return (
    <div
      data-testid="tenant-detail-drawer"
      className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-bg-primary border-l border-border shadow-xl z-50 overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{tenant.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <PlanBadge plan={tenant.plan} />
            <span className="text-xs text-text-muted">{tenant.members} members</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary" data-testid="close-drawer">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Status */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Status:</span>
          <span className={cn(
            'text-xs font-medium',
            tenant.status === 'active' ? 'text-sev-low' : tenant.status === 'over_limit' ? 'text-sev-high' : 'text-text-muted',
          )}>
            {tenant.status === 'over_limit' ? 'Over Monthly Limit' : tenant.status === 'suspended' ? 'Suspended' : 'Active'}
          </span>
        </div>
      </div>

      {/* 30-Day Consumption Sparkline */}
      <div className="p-4 border-b border-border">
        <p className="text-xs text-text-muted mb-2">30-Day Consumption</p>
        <MiniSparkline data={sparklineData} />
      </div>

      {/* Cost Attribution */}
      <div className="p-4 border-b border-border space-y-3">
        <p className="text-xs text-text-muted">Cost Attribution</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-text-muted mb-1">By Provider</p>
            {Object.entries(data.tenantStats.costByProvider).map(([p, cost]) => (
              <div key={p} className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-text-secondary capitalize">{p}</span>
                <span className="text-text-primary tabular-nums">${cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] text-text-muted mb-1">By Item Type</p>
            {Object.entries(data.tenantStats.costByItemType).map(([t, cost]) => (
              <div key={t} className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-text-secondary capitalize">{t}</span>
                <span className="text-text-primary tabular-nums">${cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="p-3 bg-bg-elevated rounded-lg border border-border">
          <p className="text-[10px] text-text-muted">Items Consumed</p>
          <p className="text-lg font-bold text-text-primary tabular-nums">{tenant.itemsConsumed.toLocaleString()}</p>
        </div>
        <div className="p-3 bg-bg-elevated rounded-lg border border-border">
          <p className="text-[10px] text-text-muted">Attributed Cost</p>
          <p className="text-lg font-bold text-text-primary tabular-nums">${tenant.attributedCostUsd.toFixed(2)}</p>
        </div>
      </div>

      {/* Feature Overrides */}
      <div className="p-4 border-t border-border">
        <TenantOverridePanel tenantId={tenant.tenantId} />
      </div>

      {/* SSO Config (read-only) */}
      <div className="p-4 border-t border-border">
        <h4 className="text-xs font-semibold text-text-primary mb-2">SSO Configuration</h4>
        <AdminSsoView tenantId={tenant.tenantId} />
      </div>

      {/* Offboard Action */}
      <div className="p-4 border-t border-border">
        <OffboardingPanel triggerForTenant={{ tenantId: tenant.tenantId, orgName: tenant.name }} />
      </div>
    </div>
  )
}

// ─── Clients Tab ───────────��────────────────────────────────────

export function ClientsTab({ data }: ClientsTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedTenant, setSelectedTenant] = useState<TenantListItem | null>(null)

  const filteredTenants = useMemo(() => {
    return data.tenantList.filter(t => {
      if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (planFilter !== 'all' && t.plan !== planFilter) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      return true
    })
  }, [data.tenantList, searchQuery, planFilter, statusFilter])

  const totalCost = data.tenantList.reduce((s, t) => s + t.attributedCostUsd, 0)
  const totalItems = data.tenantList.reduce((s, t) => s + t.itemsConsumed, 0)
  const activeTenants = data.tenantList.filter(t => t.status === 'active').length
  const overLimitCount = data.tenantList.filter(t => t.status === 'over_limit').length
  const freeTierCount = data.tenantList.filter(t => t.plan === 'free').length

  const columns: Column<TenantListItem>[] = [
    {
      key: 'name', label: 'Tenant', sortable: true, width: '25%',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'over_limit' && <AlertTriangle className="w-3 h-3 text-sev-high shrink-0" />}
          <span className={cn('text-text-primary', row.status === 'suspended' && 'opacity-60 line-through')}>
            {row.name}
          </span>
        </div>
      ),
    },
    {
      key: 'plan', label: 'Plan', width: '12%',
      render: (row) => <PlanBadge plan={row.plan} />,
    },
    {
      key: 'members', label: 'Members', sortable: true, width: '10%',
      render: (row) => <span className="tabular-nums text-text-muted">{row.members}</span>,
    },
    {
      key: 'itemsConsumed', label: 'Items', sortable: true, width: '14%',
      render: (row) => <span className="tabular-nums">{row.itemsConsumed.toLocaleString()}</span>,
    },
    {
      key: 'attributedCostUsd', label: 'Cost', sortable: true, width: '14%',
      render: (row) => <span className="tabular-nums">${row.attributedCostUsd.toFixed(2)}</span>,
    },
    {
      key: 'usagePercent', label: 'Usage', width: '12%',
      render: (row) => <UsageDots percent={row.usagePercent} />,
    },
    {
      key: 'actions', label: '', width: '8%',
      render: () => <ChevronRight className="w-4 h-4 text-text-muted" />,
    },
  ]

  return (
    <div data-testid="clients-tab" className="space-y-6 max-w-6xl">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="summary-cards">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Platform Cost"
          value={`$${totalCost.toFixed(2)}`}
          sublabel="MTD cost"
          color="text-purple-400"
        />
        <SummaryCard
          icon={<Users className="w-4 h-4" />}
          label="Items Consumed"
          value={totalItems.toLocaleString()}
          sublabel="across tenants"
        />
        <SummaryCard
          icon={<Building2 className="w-4 h-4" />}
          label="Active Tenants"
          value={String(activeTenants)}
          sublabel={`${freeTierCount} free tier`}
          color="text-sev-low"
        />
        <SummaryCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Over Limit"
          value={String(overLimitCount)}
          sublabel={`${data.tenantList.filter(t => t.status === 'suspended').length} suspended`}
          color={overLimitCount > 0 ? 'text-sev-high' : 'text-text-muted'}
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2" data-testid="filter-bar">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            data-testid="tenant-search"
            type="text"
            placeholder="Search tenant..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 bg-bg-elevated border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted"
          />
        </div>
        <select
          data-testid="plan-filter"
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
        >
          <option value="all">All Plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="teams">Teams</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="over_limit">Over Limit</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Tenant Table */}
      <DataTable
        columns={columns}
        data={filteredTenants}
        rowKey={(r) => r.tenantId}
        density="compact"
        onRowClick={(row) => setSelectedTenant(row)}
        emptyMessage="No tenants match your filters"
        severityField={(row) => row.status === 'over_limit' ? 'high' : row.status === 'suspended' ? 'low' : undefined}
      />

      {/* Offboarding Pipeline */}
      <OffboardingPanel />

      {/* Tenant Detail Drawer */}
      {selectedTenant && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedTenant(null)} />
          <TenantDetailDrawer
            tenant={selectedTenant}
            data={data}
            onClose={() => setSelectedTenant(null)}
          />
        </>
      )}
    </div>
  )
}
