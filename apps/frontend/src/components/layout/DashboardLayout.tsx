/**
 * @module components/layout/DashboardLayout
 * Locked components: TopStatsBar (h-9), GlobalSearch (Cmd+K)
 * Data fetching for TopStatsBar and GlobalSearch lives here (not in shared-ui).
 * shared-ui components are pure presentational — no @tanstack/react-query imports.
 */
import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useLogout } from '@/hooks/use-auth'
import { useDashboardStats } from '@/hooks/use-intel-data'
import { cn } from '@/lib/utils'
import { MODULES, getPhaseColor, getPhaseBgColor } from '@/config/modules'
import {
  Search, LogOut, Menu, X, Sun, Moon,
} from 'lucide-react'
import { IconDashboard } from '@/components/brand/ModuleIcons'
import { LogoMark } from '@/components/brand/LogoMark'
import { TopStatsBar }                          from '@etip/shared-ui/components/TopStatsBar'
import { GlobalSearch, useGlobalSearch }         from '@etip/shared-ui/components/GlobalSearch'
import type { SearchResult }                     from '@etip/shared-ui/components/GlobalSearch'
import { ThreatPulseStrip }                      from '@/components/viz/ThreatPulseStrip'

/* ------------------------------------------------------------------ */
/* Floating sidebar collapse toggle — 3D cyber orb                     */
/* ------------------------------------------------------------------ */
function SidebarCollapseToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'hidden lg:flex fixed top-1/2 -translate-y-1/2 z-[60]',
        'w-8 h-8 items-center justify-center',
        'rounded-full',
        'bg-[var(--bg-primary)] border border-accent/40',
        'text-accent',
        'shadow-[0_0_8px_rgba(59,130,246,0.25),inset_0_1px_1px_rgba(255,255,255,0.1)]',
        'hover:shadow-[0_0_20px_rgba(59,130,246,0.5),0_0_40px_rgba(59,130,246,0.15),inset_0_1px_1px_rgba(255,255,255,0.15)]',
        'hover:border-accent/80 hover:scale-110',
        'active:scale-95',
        'transition-all duration-200 group',
        'cyber-orb-pulse',
        collapsed ? 'left-[52px]' : 'left-[228px]',
      )}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {/* Outer glow ring */}
      <div className="absolute inset-[-3px] rounded-full border border-accent/20 cyber-orb-ring" />
      {/* Inner glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/20 via-transparent to-cyan-400/10" />
      {/* Chevron */}
      <svg
        width="12" height="12" viewBox="0 0 12 12" fill="none"
        className={cn(
          'relative z-10 transition-transform duration-300',
          collapsed ? 'rotate-0' : 'rotate-180',
        )}
      >
        <path
          d="M4 2l4 4-4 4"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Derive sidebar nav from modules config + dashboard entry            */
/* ------------------------------------------------------------------ */
const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: IconDashboard, phase: 0, color: 'text-accent' },
  ...MODULES.map(m => ({ label: m.title, path: m.route, icon: m.icon, phase: m.phase, color: m.color })),
]

export function DashboardLayout() {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const user           = useAuthStore(s => s.user)
  const tenant         = useAuthStore(s => s.tenant)
  const { theme, toggleTheme } = useThemeStore()
  const logoutMutation = useLogout()
  const location       = useLocation()

  // ⛔ LOCKED: GlobalSearch Cmd+K / Ctrl+K
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearch()

  // Platform stats for TopStatsBar — uses aggregated hook from use-intel-data
  const { data: stats } = useDashboardStats()

  // Global search results — data fetch lives in app layer, not shared-ui
  const [searchQuery, setSearchQuery] = useState('')
  const { data: searchResults } = useQuery<SearchResult[]>({
    queryKey: ['global-search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) return []
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(searchQuery)}&limit=20`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30_000,
    retry: false,
  })

  return (
    <div className="relative flex h-screen overflow-hidden bg-bg-base transition-colors duration-200">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={()=>setMobileOpen(false)}/>
      )}

      {/* Floating sidebar collapse toggle — positioned on sidebar edge */}
      <SidebarCollapseToggle collapsed={collapsed} onClick={() => setCollapsed(!collapsed)} />

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-bg-primary border-r border-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        {/* Logo + collapse toggle */}
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            <LogoMark size={32} className="shrink-0" />
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-text-primary truncate">IntelWatch</span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider">ETIP v4.0</span>
              </div>
            )}
          </div>
          {/* Mobile close */}
          <button onClick={()=>setMobileOpen(false)} className="lg:hidden p-1 text-text-muted hover:text-text-primary">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Search hint */}
        {!collapsed ? (
          <button onClick={()=>setSearchOpen(true)}
            className="mx-2 mt-2 mb-1 flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-secondary border border-border text-xs text-text-muted hover:text-text-secondary hover:border-border-strong transition-colors">
            <Search className="w-3 h-3 shrink-0"/>
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] border border-border px-1 py-0.5 rounded bg-bg-elevated">⌘K</kbd>
          </button>
        ) : (
          <button onClick={()=>setSearchOpen(true)}
            className="mx-2 mt-2 mb-1 flex items-center justify-center py-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Search (⌘K)">
            <Search className="w-4 h-4"/>
          </button>
        )}

        {/* Nav — all items are clickable, future phases navigate to ComingSoonPage */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV_ITEMS.map(item => {
            const isActive    = location.pathname === item.path
            const isFuture    = item.phase > 0
            const phaseColor  = getPhaseColor(item.phase)
            const phaseBg     = getPhaseBgColor(item.phase)
            const Icon        = item.icon
            return (
              <NavLink key={item.path} to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                )}
                title={isFuture ? `${item.label} — Phase ${item.phase}` : item.label}>
                <span className={cn('shrink-0', isActive ? 'text-accent' : item.color)}>
                  <Icon size={18} />
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && isFuture && (
                  <span className={cn(
                    'ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    phaseBg, phaseColor,
                  )}>
                    P{item.phase}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom controls: theme toggle + user + sign out */}
        <div className="border-t border-border p-2 shrink-0 space-y-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              'flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors',
              collapsed && 'justify-center px-0',
            )}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark'
              ? <Sun className="w-4 h-4 text-yellow-400 shrink-0" />
              : <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
            }
            {!collapsed && (
              <span className="text-xs">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            )}
          </button>

          {/* User info */}
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-3 py-1">
              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent shrink-0">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-text-primary truncate">{user.displayName}</div>
                <div className="text-[10px] text-text-muted truncate">{tenant?.name ?? user.email}</div>
              </div>
            </div>
          )}

          {/* Sign out */}
          <button onClick={()=>logoutMutation.mutate()}
            className={cn(
              'flex items-center gap-2 w-full text-sm text-text-muted hover:text-sev-critical transition-colors rounded-md px-3 py-2',
              collapsed && 'justify-center px-0',
            )}
            title="Sign out">
            <LogOut className="w-4 h-4 shrink-0"/>
            {!collapsed && <span className="text-xs">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden h-10 bg-bg-primary border-b border-border flex items-center px-3 shrink-0">
          <button onClick={()=>setMobileOpen(true)} className="p-1 -ml-1 text-text-muted hover:text-text-primary">
            <Menu className="w-4 h-4"/>
          </button>
          <span className="ml-2 text-sm font-medium text-text-primary">IntelWatch</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggleTheme} className="p-1 text-text-muted hover:text-text-primary" title="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={()=>setSearchOpen(true)} className="p-1 text-text-muted hover:text-text-primary">
              <Search className="w-4 h-4"/>
            </button>
          </div>
        </div>

        {/* ⛔ LOCKED: TopStatsBar — always visible, scrolls on mobile (overflow-x-auto + scrollbar-hide) */}
        <div className="overflow-x-auto shrink-0 scrollbar-hide">
          <TopStatsBar
            totalIOCs={stats?.totalIOCs}
            criticalIOCs={stats?.criticalIOCs}
            activeFeeds={stats?.activeFeeds}
            enrichedToday={stats?.enrichedToday}
            lastIngestTime={stats?.lastIngestTime}
          />
        </div>

        {/* #1: Live Threat Pulse Strip — polls recent IOCs */}
        <ThreatPulseStrip />

        <main className="flex-1 overflow-y-auto">
          <Outlet/>
        </main>
      </div>

      {/* ⛔ LOCKED: GlobalSearch — data owned here, not in shared-ui */}
      <GlobalSearch
        open={searchOpen}
        onClose={()=>setSearchOpen(false)}
        results={searchResults}
        onQueryChange={setSearchQuery}
      />
    </div>
  )
}
