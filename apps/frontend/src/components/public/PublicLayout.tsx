/**
 * @module components/public/PublicLayout
 * @description Header + footer for public, indexable marketing pages (/pricing, /features/*).
 * Not used by the design-locked LandingPage. Links are real <a> elements so crawlers follow them.
 */
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LogoMark } from '@/components/brand/LogoMark'
import { SALES_EMAIL } from '@/data/plans'
import { cn } from '@/lib/utils'

export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const navLink = cn('inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors', focusRing)

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg-base text-text-primary">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-bg-elevated focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className={cn('flex items-center gap-2 rounded-md text-sm font-semibold', focusRing)}>
            <LogoMark size={28} />
            <span>IntelWatch</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <NavLink
              to="/pricing"
              className={({ isActive }) =>
                cn(navLink, 'hidden sm:inline-flex', isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary')
              }
            >
              Pricing
            </NavLink>
            <Link to="/login" className={cn(navLink, 'text-text-secondary hover:text-text-primary')}>
              Sign in
            </Link>
            <Link to="/register" className={cn(navLink, 'bg-accent font-medium text-white hover:bg-accent-hover')}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>IntelWatch — threat intelligence platform</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link to="/pricing" className={cn('rounded hover:text-text-primary', focusRing)}>Pricing</Link>
            <Link to="/login" className={cn('rounded hover:text-text-primary', focusRing)}>Sign in</Link>
            <a href={`mailto:${SALES_EMAIL}`} className={cn('rounded hover:text-text-primary', focusRing)}>Contact sales</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
