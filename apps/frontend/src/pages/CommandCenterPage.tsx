/**
 * @module pages/CommandCenterPage
 * @description Unified AI processing & platform management page.
 * Super-admin: 7 tabs (Overview, Configuration, Queue, Feeds, Settings, Users & Access, Clients).
 * Tenant-admin: 5 tabs (Overview, Configuration, Feeds, Settings, Users & Access).
 * Extensible tab registry, role-based filtering, KPI strip, date range picker.
 */
import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandCenter, type Period } from '@/hooks/use-command-center'
import { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import { cn } from '@/lib/utils'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  BarChart3, Sliders, ListOrdered, Settings, Users,
  RefreshCw, Download, ChevronDown, DollarSign,
  Activity, Building2, TrendingUp, AlertTriangle,
  Rss, ShieldCheck,
} from 'lucide-react'
import { IconCommandCenter } from '@/components/brand/ModuleIcons'
import { ClientsTab } from '@/components/command-center/ClientsTab'
import { QueueTab } from '@/components/command-center/QueueTab'
import { OverviewTab } from '@/components/command-center/OverviewTab'
import { ConfigurationTab } from '@/components/command-center/ConfigurationTab'
import { SettingsTab } from '@/components/command-center/SettingsTab'
import { FeedsTab } from '@/components/command-center/FeedsTab'
import { UsersAccessTab } from '@/components/command-center/UsersAccessTab'

// ─── Tab Registry ───────────────────────────────────────────────

type TabId = 'overview' | 'configuration' | 'queue' | 'feeds' | 'settings' | 'users-access' | 'clients'
type UserRole = 'super_admin' | 'tenant_admin'

interface CommandCenterTab {
  id: TabId
  label: string
  icon: React.FC<{ className?: string }>
  roles: UserRole[]
}

const TABS: CommandCenterTab[] = [
  { id: 'overview',      label: 'Overview',       icon: BarChart3,   roles: ['super_admin', 'tenant_admin'] },
  { id: 'configuration', label: 'Configuration',  icon: Sliders,     roles: ['super_admin', 'tenant_admin'] },
  { id: 'queue',         label: 'Queue',          icon: ListOrdered, roles: ['super_admin'] },
  { id: 'feeds',         label: 'Feeds',          icon: Rss,         roles: ['super_admin', 'tenant_admin'] },
  { id: 'settings',      label: 'Settings',       icon: Settings,    roles: ['super_admin', 'tenant_admin'] },
  { id: 'users-access',  label: 'Users & Access', icon: ShieldCheck, roles: ['super_admin', 'tenant_admin'] },
  { id: 'clients',       label: 'Clients',        icon: Users,       roles: ['super_admin'] },
]

// ─── Period Picker ──────────────────────────────────────────────

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
]

// Placeholder components removed — OverviewTab and ConfigurationTab are now live.

// ─── Page Component ─────────────────────────────────────────────

export function CommandCenterPage() {
  const user = useAuthStore(s => s.user)
  const userRole = (user?.role ?? 'tenant_admin') as UserRole

  const cc = useCommandCenter()
  const aiConfig = useGlobalAiConfig()

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [mobileTabOpen, setMobileTabOpen] = useState(false)

  const visibleTabs = useMemo(
    () => TABS.filter(t => t.roles.includes(userRole)),
    [userRole],
  )

  // Ensure active tab is visible for current role
  const effectiveTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id ?? 'overview'

  // Badge counts
  const queueBadge = cc.queueStats.pendingItems > 0 ? cc.queueStats.pendingItems : null
  const overLimitCount = cc.tenantList.filter(t => t.status === 'over_limit').length
  const clientsBadge = overLimitCount > 0 ? overLimitCount : null

  function getBadge(tabId: TabId): number | null {
    if (tabId === 'queue') return queueBadge
    if (tabId === 'clients') return clientsBadge
    return null
  }

  // Export CSV
  const handleExportCsv = () => {
    const rows = cc.isSuperAdmin
      ? [
          ['Metric', 'Value'],
          ['Total Cost (USD)', cc.globalStats.totalCostUsd.toFixed(2)],
          ['Total Items Processed', String(cc.globalStats.totalItems)],
          ['Active Tenants', String(cc.tenantList.filter(t => t.status === 'active').length)],
        ]
      : [
          ['Metric', 'Value'],
          ['Items Consumed', String(cc.tenantStats.itemsConsumed)],
          ['Attributed Cost (USD)', cc.tenantStats.attributedCostUsd.toFixed(2)],
          ['Budget Used %', String(cc.tenantStats.budgetUsedPercent)],
        ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `command-center-${cc.period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading state
  if (cc.isLoading) {
    return (
      <div data-testid="command-center-page" className="space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-bg-elevated rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div data-testid="command-center-page" className="flex flex-col h-full">
      {/* Demo banner */}
      {cc.isDemo && (
        <div className="bg-bg-elevated border-b border-border px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium" data-testid="demo-badge">Demo</span>
          <span className="text-xs text-text-muted">Demo data — connect backend for live stats</span>
        </div>
      )}

      {/* KPI Stats Bar */}
      <PageStatsBar>
        {cc.isSuperAdmin ? (
          <>
            <CompactStat icon={<Activity className="w-3 h-3" />} label="Processed" value={cc.globalStats.totalItems.toLocaleString()} />
            <CompactStat icon={<DollarSign className="w-3 h-3" />} label="AI Cost" value={`$${cc.globalStats.totalCostUsd.toFixed(2)}`} color="text-purple-400" />
            <CompactStat icon={<Building2 className="w-3 h-3" />} label="Tenants" value={String(cc.tenantList.filter(t => t.status === 'active').length)} />
            <CompactStat icon={<TrendingUp className="w-3 h-3" />} label="Consumption" value={cc.tenantList.reduce((s, t) => s + t.itemsConsumed, 0).toLocaleString()} color="text-sev-low" />
            <CompactStat icon={<ListOrdered className="w-3 h-3" />} label="Queue" value={`${cc.queueStats.pendingItems} pending`} />
            <CompactStat icon={<AlertTriangle className="w-3 h-3" />} label="Alerts" value={overLimitCount > 0 ? `${overLimitCount} over limit` : 'None'} color={overLimitCount > 0 ? 'text-sev-high' : undefined} />
          </>
        ) : (
          <>
            <CompactStat icon={<Activity className="w-3 h-3" />} label="Consumed" value={cc.tenantStats.itemsConsumed.toLocaleString()} />
            <CompactStat icon={<DollarSign className="w-3 h-3" />} label="AI Cost" value={`$${cc.tenantStats.attributedCostUsd.toFixed(2)}`} color="text-purple-400" />
            <CompactStat icon={<BarChart3 className="w-3 h-3" />} label="Feeds" value="—" />
            <CompactStat icon={<TrendingUp className="w-3 h-3" />} label="Budget" value={`${cc.tenantStats.budgetUsedPercent}%`} color={cc.tenantStats.budgetUsedPercent > 80 ? 'text-sev-high' : 'text-sev-low'} />
          </>
        )}
      </PageStatsBar>

      <div className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="px-4 sm:px-6 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <IconCommandCenter size={24} className="text-purple-400" />
              <div>
                <h1 className="text-xl font-bold text-text-primary">Command Center</h1>
                <p className="text-xs text-text-muted">AI processing & platform management</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Period picker */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    data-testid={`period-${p.value}`}
                    onClick={() => cc.setPeriod(p.value)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors',
                      cc.period === p.value
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-muted hover:text-text-primary hover:bg-bg-hover',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Export CSV */}
              <button
                data-testid="export-csv"
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-border-strong transition-colors"
              >
                <Download className="w-3 h-3" /> CSV
              </button>

              {/* Refresh */}
              <button
                data-testid="refresh-btn"
                onClick={cc.refetchAll}
                disabled={cc.isFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3 h-3', cc.isFetching && 'animate-spin')} />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Bar — desktop */}
        <div className="hidden sm:block px-4 sm:px-6 border-b border-border">
          <div className="flex gap-1" data-testid="tab-bar">
            {visibleTabs.map(tab => {
              const isActive = effectiveTab === tab.id
              const badge = getBadge(tab.id)
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  data-testid={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                    isActive
                      ? 'border-accent text-accent'
                      : 'border-transparent text-text-muted hover:text-text-primary hover:border-border',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {badge != null && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-sev-high/20 text-sev-high font-medium">
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Dropdown — mobile */}
        <div className="sm:hidden px-4 pb-3" data-testid="tab-dropdown-wrapper">
          <div className="relative">
            <button
              data-testid="tab-dropdown"
              onClick={() => setMobileTabOpen(!mobileTabOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
            >
              <span className="flex items-center gap-2">
                {(() => { const t = visibleTabs.find(t => t.id === effectiveTab); const I = t?.icon ?? BarChart3; return <I className="w-4 h-4" /> })()}
                {visibleTabs.find(t => t.id === effectiveTab)?.label ?? 'Overview'}
              </span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', mobileTabOpen && 'rotate-180')} />
            </button>
            {mobileTabOpen && (
              <div className="absolute z-20 mt-1 w-full bg-bg-primary border border-border rounded-lg shadow-lg overflow-hidden">
                {visibleTabs.map(tab => {
                  const Icon = tab.icon
                  const badge = getBadge(tab.id)
                  return (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setMobileTabOpen(false) }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors',
                        effectiveTab === tab.id ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                      {badge != null && (
                        <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded-full bg-sev-high/20 text-sev-high font-medium">{badge}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="px-4 sm:px-6 py-4" data-testid="tab-content">
          {effectiveTab === 'overview' && <OverviewTab data={cc} />}
          {effectiveTab === 'configuration' && <ConfigurationTab data={cc} aiConfig={aiConfig} />}
          {effectiveTab === 'queue' && <QueueTab data={cc} />}
          {effectiveTab === 'feeds' && <FeedsTab data={cc} />}
          {effectiveTab === 'settings' && <SettingsTab data={cc} aiConfig={aiConfig} />}
          {effectiveTab === 'users-access' && <UsersAccessTab data={cc} />}
          {effectiveTab === 'clients' && <ClientsTab data={cc} />}
        </div>
      </div>
    </div>
  )
}
