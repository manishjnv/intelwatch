/**
 * @module pages/CommandCenterPage
 * @description Unified AI processing & platform management page.
 * Super-admin: 8 tabs (Overview, Configuration, Settings, Users & Access, Clients, Billing & Plans, Alerts & Reports, System).
 * Tenant-admin: 6 tabs (Overview, Configuration, Settings, Users & Access, Billing & Plans, Alerts & Reports).
 * Session 123e: Feeds tab absorbed into System tab → #feeds redirects to #system.
 * Hash-based tab navigation (/command-center#tab → opens tab).
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useCommandCenter } from '@/hooks/use-command-center'
import { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import { cn } from '@/lib/utils'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  BarChart3, Sliders, ListOrdered, Settings, Users,
  RefreshCw, ChevronDown, DollarSign,
  Activity, Building2, TrendingUp, AlertTriangle,
  ShieldCheck, CreditCard, Bell, Server,
} from 'lucide-react'
import { IconCommandCenter } from '@/components/brand/ModuleIcons'
import { ClientsTab } from '@/components/command-center/ClientsTab'
import { OverviewTab } from '@/components/command-center/OverviewTab'
import { ConfigurationTab } from '@/components/command-center/ConfigurationTab'
import { SettingsTab } from '@/components/command-center/SettingsTab'
import { UsersAccessTab } from '@/components/command-center/UsersAccessTab'
import { BillingPlansTab } from '@/components/command-center/BillingPlansTab'
import { AlertsReportsTab } from '@/components/command-center/AlertsReportsTab'
import { SystemTab } from '@/components/command-center/SystemTab'

// ─── Tab Registry ───────────────────────────────────────────────

type TabId = 'overview' | 'configuration' | 'settings' | 'users-access' | 'clients' | 'billing-plans' | 'alerts-reports' | 'system'
type UserRole = 'super_admin' | 'tenant_admin'

interface CommandCenterTab {
  id: TabId
  label: string
  icon: React.FC<{ className?: string }>
  roles: UserRole[]
}

const TABS: CommandCenterTab[] = [
  { id: 'overview',       label: 'Overview',        icon: BarChart3,   roles: ['super_admin', 'tenant_admin'] },
  { id: 'configuration',  label: 'Configuration',   icon: Sliders,     roles: ['super_admin', 'tenant_admin'] },
  { id: 'settings',       label: 'Settings',        icon: Settings,    roles: ['super_admin', 'tenant_admin'] },
  { id: 'users-access',   label: 'Users & Access',  icon: ShieldCheck, roles: ['super_admin', 'tenant_admin'] },
  { id: 'clients',        label: 'Clients',         icon: Users,       roles: ['super_admin'] },
  { id: 'billing-plans',  label: 'Billing & Plans',  icon: CreditCard,  roles: ['super_admin', 'tenant_admin'] },
  { id: 'alerts-reports', label: 'Alerts & Reports', icon: Bell,        roles: ['super_admin', 'tenant_admin'] },
  { id: 'system',         label: 'System',           icon: Server,      roles: ['super_admin'] },
]

// Placeholder components removed — OverviewTab and ConfigurationTab are now live.

// ─── Page Component ─────────────────────────────────────────────

/** Absorbed tab hashes → redirect to new location */
const HASH_REDIRECTS: Record<string, TabId> = {
  feeds: 'system',
}

/** Parse URL hash to a valid TabId, or return null. Handles absorbed tab redirects. */
function hashToTabId(hash: string): TabId | null {
  const raw = hash.replace('#', '')
  const redirected = HASH_REDIRECTS[raw] ?? raw
  const id = redirected as TabId
  return TABS.some(t => t.id === id) ? id : null
}

export function CommandCenterPage() {
  const user = useAuthStore(s => s.user)
  const userRole = (user?.role ?? 'tenant_admin') as UserRole
  const location = useLocation()
  const navigate = useNavigate()

  const cc = useCommandCenter()
  const aiConfig = useGlobalAiConfig()

  // Derive initial tab from URL hash
  const initialTab = hashToTabId(location.hash) ?? 'overview'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [mobileTabOpen, setMobileTabOpen] = useState(false)

  const visibleTabs = useMemo(
    () => TABS.filter(t => t.roles.includes(userRole)),
    [userRole],
  )

  // Sync hash → tab on popstate (browser back/forward)
  useEffect(() => {
    const tabFromHash = hashToTabId(location.hash)
    if (tabFromHash && tabFromHash !== activeTab) {
      setActiveTab(tabFromHash)
    }
  }, [location.hash, activeTab])

  // Tab click handler — updates both state and URL hash
  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId)
    navigate(`/command-center#${tabId}`, { replace: true })
  }, [navigate])

  // Ensure active tab is visible for current role
  const effectiveTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id ?? 'overview'

  // Badge counts
  const overLimitCount = cc.tenantList.filter(t => t.status === 'over_limit').length
  const clientsBadge = overLimitCount > 0 ? overLimitCount : null

  function getBadge(tabId: TabId): number | null {
    if (tabId === 'clients') return clientsBadge
    return null
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
        <button
          data-testid="refresh-btn"
          onClick={cc.refetchAll}
          disabled={cc.isFetching}
          className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
          title="Refresh data"
        >
          <RefreshCw className={cn('w-3 h-3', cc.isFetching && 'animate-spin')} />
        </button>
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
                  onClick={() => handleTabChange(tab.id)}
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
                      onClick={() => { handleTabChange(tab.id); setMobileTabOpen(false) }}
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
          {effectiveTab === 'settings' && <SettingsTab data={cc} aiConfig={aiConfig} />}
          {effectiveTab === 'users-access' && <UsersAccessTab data={cc} />}
          {effectiveTab === 'clients' && <ClientsTab data={cc} />}
          {effectiveTab === 'billing-plans' && <BillingPlansTab data={cc} />}
          {effectiveTab === 'alerts-reports' && <AlertsReportsTab data={cc} />}
          {effectiveTab === 'system' && <SystemTab />}
        </div>
      </div>
    </div>
  )
}
