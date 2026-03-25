// ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
// Severity → colour mapping is FROZEN. Analysts make instant triage decisions
// based on these colours. Do NOT modify without [DESIGN-APPROVED].

import type { Severity } from './EntityChip'

// ⛔ FROZEN colour map (UI_DESIGN_LOCK.md)
const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; border: string; dot: string }> = {
  CRITICAL: { bg: 'bg-red-500/20',    text: 'text-red-300',    border: 'border-red-500/30',    dot: 'bg-red-500'    },
  HIGH:     { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
  LOW:      { bg: 'bg-green-500/20',  text: 'text-green-300',  border: 'border-green-500/30',  dot: 'bg-green-500'  },
  INFO:     { bg: 'bg-slate-500/20',  text: 'text-slate-300',  border: 'border-slate-500/30',  dot: 'bg-slate-500'  },
}

interface SeverityBadgeProps {
  severity: Severity
  showDot?: boolean
  size?: 'sm' | 'md'
}

export function SeverityBadge({ severity, showDot = true, size = 'sm' }: SeverityBadgeProps) {
  const key = severity?.toUpperCase() as Severity
  const s = SEVERITY_STYLES[key] ?? SEVERITY_STYLES.INFO
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border} ${textSize} font-medium`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0`} />}
      {severity}
    </span>
  )
}

// Standalone dot — used in tables and inline text
export function SeverityDot({ severity }: { severity: Severity }) {
  const key = severity?.toUpperCase() as Severity
  const style = SEVERITY_STYLES[key] ?? SEVERITY_STYLES.INFO
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`}
      title={severity}
    />
  )
}
