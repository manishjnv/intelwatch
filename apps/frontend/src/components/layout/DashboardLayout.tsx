/**
 * @module components/layout/DashboardLayout
 * Locked components: TopStatsBar (h-9), GlobalSearch (Cmd+K)
 */
import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useLogout } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Shield, Activity, Search, Users, Settings,
  LogOut, ChevronLeft, ChevronRight, Menu, X, AlertTriangle, Bug, Network,
} from 'lucide-react'
import { TopStatsBar } from '@etip/shared-ui/components/TopStatsBar'
import { GlobalSearch, useGlobalSearch } from '@etip/shared-ui/components/GlobalSearch'

const NAV_ITEMS = [
  { label:'Dashboard',       path:'/dashboard',     icon:<LayoutDashboard className="w-4 h-4"/> },
  { label:'IOC Intelligence',path:'/iocs',          icon:<Shield className="w-4 h-4"/>,         phase:'Phase 3' },
  { label:'Threat Actors',   path:'/threat-actors', icon:<Users className="w-4 h-4"/>,          phase:'Phase 3' },
  { label:'Malware',         path:'/malware',       icon:<Bug className="w-4 h-4"/>,            phase:'Phase 3' },
  { label:'Vulnerabilities', path:'/vulnerabilities',icon:<AlertTriangle className="w-4 h-4"/>, phase:'Phase 3' },
  { label:'Threat Graph',    path:'/graph',         icon:<Network className="w-4 h-4"/>,        phase:'Phase 4' },
  { label:'Threat Hunting',  path:'/hunting',       icon:<Search className="w-4 h-4"/>,         phase:'Phase 4' },
  { label:'Feed Management', path:'/feeds',         icon:<Activity className="w-4 h-4"/>,       phase:'Phase 2' },
  { label:'Integrations',    path:'/integrations',  icon:<Settings className="w-4 h-4"/>,       phase:'Phase 5' },
  { label:'Settings',        path:'/settings',      icon:<Settings className="w-4 h-4"/>,       phase:'Phase 5' },
]

export function DashboardLayout() {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const user    = useAuthStore(s => s.user)
  const tenant  = useAuthStore(s => s.tenant)
  const logoutMutation = useLogout()
  const location = useLocation()
  // LOCKED: GlobalSearch Cmd+K / Ctrl+K
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearch()

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={()=>setMobileOpen(false)}/>
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-bg-primary border-r border-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-white"/>
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-text-primary truncate">IntelWatch</span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider">ETIP v4.0</span>
              </div>
            )}
          </div>
          <button onClick={()=>setMobileOpen(false)} className="ml-auto lg:hidden p-1 text-text-muted hover:text-text-primary">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Search hint */}
        {!collapsed && (
          <button onClick={()=>setSearchOpen(true)}
            className="mx-2 mt-2 mb-1 flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-secondary border border-border text-xs text-text-muted hover:text-text-secondary hover:border-border-strong transition-colors">
            <Search className="w-3 h-3 shrink-0"/>
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] border border-border px-1 py-0.5 rounded bg-bg-elevated">⌘K</kbd>
          </button>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV_ITEMS.map(item => {
            const isActive   = location.pathname === item.path
            const isDisabled = !!item.phase
            return (
              <NavLink key={item.path} to={isDisabled ? '#' : item.path}
                onClick={e => { if (isDisabled) e.preventDefault(); setMobileOpen(false) }}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5',
                  isActive && !isDisabled ? 'bg-accent/10 text-accent'
                    : isDisabled           ? 'text-text-muted/40 cursor-not-allowed'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                )}
                title={isDisabled ? `Coming in ${item.phase}` : item.label}>
                <span className={cn('shrink-0', isActive && !isDisabled && 'text-accent')}>{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && isDisabled && (
                  <span className="ml-auto text-[10px] text-text-muted/50 bg-bg-elevated px-1.5 py-0.5 rounded">{item.phase}</span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User */}
        <div className="border-t border-border p-3 shrink-0">
          {!collapsed && user && (
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent shrink-0">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-text-primary truncate">{user.displayName}</div>
                <div className="text-[10px] text-text-muted truncate">{tenant?.name ?? user.email}</div>
              </div>
            </div>
          )}
          <button onClick={()=>logoutMutation.mutate()}
            className={cn('flex items-center gap-2 w-full text-sm text-text-muted hover:text-sev-critical transition-colors rounded-md px-2 py-1.5', collapsed && 'justify-center')}
            title="Sign out">
            <LogOut className="w-4 h-4 shrink-0"/>
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button onClick={()=>setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center h-8 border-t border-border text-text-muted hover:text-text-primary transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="w-4 h-4"/> : <ChevronLeft className="w-4 h-4"/>}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden h-10 bg-bg-primary border-b border-border flex items-center px-3 shrink-0">
          <button onClick={()=>setMobileOpen(true)} className="p-1 -ml-1 text-text-muted hover:text-text-primary">
            <Menu className="w-4 h-4"/>
          </button>
          <span className="ml-2 text-sm font-medium text-text-primary">IntelWatch</span>
          <button onClick={()=>setSearchOpen(true)} className="ml-auto p-1 text-text-muted hover:text-text-primary">
            <Search className="w-4 h-4"/>
          </button>
        </div>

        {/* LOCKED: TopStatsBar — always visible, scrolls on mobile (overflow-x-auto) */}
        <div className="overflow-x-auto shrink-0 scrollbar-hide">
          <TopStatsBar />
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet/>
        </main>
      </div>

      {/* LOCKED: GlobalSearch */}
      <GlobalSearch open={searchOpen} onClose={()=>setSearchOpen(false)}/>
    </div>
  )
}
