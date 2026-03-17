// DESIGN LOCKED — see UI_DESIGN_LOCK.md: py-2, bg-bg-elevated/50, CompactStat pattern
import React from 'react'
interface CompactStatProps { label: string; value?: number|string; color?: string }
export function CompactStat({ label, value, color }: CompactStatProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-medium" style={{ color: color ?? 'var(--text-primary)' }}>{value ?? '—'}</span>
    </div>
  )
}
interface PageStatsBarProps { children: React.ReactNode; className?: string }
export function PageStatsBar({ children, className='' }: PageStatsBarProps) {
  return (
    <div className={`flex items-center gap-4 px-6 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border)] text-xs ${className}`}
      style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
      {children}
    </div>
  )
}
