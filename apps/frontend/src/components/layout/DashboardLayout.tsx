import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const NAV = [
  { label: 'Dashboard', path: '/dashboard', phase: '' },
  { label: 'IOC Intelligence', path: '/iocs', phase: 'Phase 3' },
  { label: 'Threat Actors', path: '/actors', phase: 'Phase 3' },
  { label: 'Malware', path: '/malware', phase: 'Phase 3' },
  { label: 'Vulnerabilities', path: '/vulns', phase: 'Phase 3' },
  { label: 'Threat Graph', path: '/graph', phase: 'Phase 4' },
  { label: 'Threat Hunting', path: '/hunting', phase: 'Phase 4' },
  { label: 'Feeds', path: '/feeds', phase: 'Phase 2' },
  { label: 'Integrations', path: '/integrations', phase: 'Phase 5' },
  { label: 'Settings', path: '/settings', phase: 'Phase 5' },
];

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const logoutMutation = useLogout();
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base">
      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn('fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-bg-primary border-r border-border transition-all duration-200', collapsed ? 'w-16' : 'w-56', mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0 gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          {!collapsed && <div className="flex flex-col min-w-0"><span className="text-sm font-semibold text-text-primary truncate">IntelWatch</span><span className="text-[10px] text-text-muted uppercase tracking-wider">ETIP v4.0</span></div>}
          <button onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden p-1 text-text-muted">&times;</button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV.map((item) => {
            const active = location.pathname === item.path;
            const disabled = !!item.phase;
            return (
              <NavLink key={item.path} to={disabled ? '#' : item.path} onClick={(e) => { if (disabled) e.preventDefault(); setMobileOpen(false); }}
                className={cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm mb-0.5 transition-colors',
                  active && !disabled ? 'bg-accent/10 text-accent' : disabled ? 'text-text-muted/40 cursor-not-allowed' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                )} title={disabled ? `Coming in ${item.phase}` : item.label}>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && disabled && <span className="ml-auto text-[10px] text-text-muted/50 bg-bg-elevated px-1.5 py-0.5 rounded">{item.phase}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-border p-3 shrink-0">
          {!collapsed && user && (
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent shrink-0">{user.displayName.charAt(0).toUpperCase()}</div>
              <div className="min-w-0"><div className="text-xs font-medium text-text-primary truncate">{user.displayName}</div><div className="text-[10px] text-text-muted truncate">{tenant?.name ?? user.email}</div></div>
            </div>
          )}
          <button onClick={() => logoutMutation.mutate()} className={cn('flex items-center gap-2 w-full text-sm text-text-muted hover:text-sev-critical rounded-md px-2 py-1.5', collapsed && 'justify-center')} title="Sign out">
            {!collapsed && <span>Sign out</span>}
            {collapsed && <span className="text-xs">Out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center h-8 border-t border-border text-text-muted hover:text-text-primary">
          {collapsed ? '→' : '←'}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top stats bar */}
        <div className="h-9 bg-bg-secondary border-b border-border flex items-center px-4 gap-6 text-xs shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1 -ml-1 text-text-muted">☰</button>
          <span className="text-text-muted">IOCs: <span className="text-text-primary font-medium">—</span></span>
          <span className="w-px h-4 bg-border" />
          <span className="text-text-muted">Critical: <span className="text-sev-critical font-medium">—</span></span>
          <span className="w-px h-4 bg-border hidden sm:block" />
          <span className="text-text-muted hidden sm:inline">Feeds: <span className="text-text-primary font-medium">—</span></span>
          <span className="w-px h-4 bg-border hidden md:block" />
          <span className="text-text-muted hidden md:inline">Enriched: <span className="text-text-primary font-medium">—</span></span>
        </div>
        <main className="flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  );
}
