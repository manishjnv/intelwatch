// ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
// py-2 padding, bg-bg-elevated/50, and CompactStat pattern are FROZEN.
// Do NOT modify without [DESIGN-APPROVED] in your Claude prompt.

import React from 'react'

export interface CompactStatProps {
  label: string
  value?: number | string
  color?: string
  icon?: React.ReactNode
  highlight?: boolean
}

// ⛔ FROZEN — compact stat pair pattern (UI_DESIGN_LOCK.md)
export function CompactStat({ label, value, color, icon }: CompactStatProps) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      <span className="text-[var(--text-muted)]">{label}</span>
      <span
        className="font-medium"
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

export interface PageStatsBarProps {
  children: React.ReactNode
  className?: string
  title?: string
  isDemo?: boolean
}

// ⛔ FROZEN — py-2 padding, bg-bg-elevated/50, border-b, text-xs (UI_DESIGN_LOCK.md)
export function PageStatsBar({ children, className = '' }: PageStatsBarProps) {
  return (
    <div
      className={`flex items-center gap-4 px-6 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border)] text-xs ${className}`}
      style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
    >
      {children}
    </div>
  )
}
