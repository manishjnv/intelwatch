/**
 * @module components/ioc/MitreBadgeCell
 * @description Compact MITRE ATT&CK technique badges for table column.
 * Shows top 1-2 technique IDs, color-coded by tactic. Tooltip with full name.
 */
import { TECHNIQUE_CATALOG, TACTIC_COLORS } from '@/components/ioc/ioc-constants'
import type { Density } from '@/components/data/DataTable'

interface MitreBadgeCellProps {
  techniques: string[]
  density?: Density
}

export function MitreBadgeCell({ techniques, density }: MitreBadgeCellProps) {
  if (!techniques.length) return null

  if (density === 'ultra-dense') {
    return <span className="text-[10px] text-text-muted" data-testid="mitre-count">{techniques.length} TTPs</span>
  }

  const show = techniques.slice(0, 2)
  const overflow = techniques.length - show.length

  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="mitre-badges">
      {show.map(tid => {
        const info = TECHNIQUE_CATALOG[tid]
        const tactic = info?.tactic ?? 'discovery'
        const colorClass = TACTIC_COLORS[tactic] ?? TACTIC_COLORS['discovery']!
        const tooltip = info ? `${tid} — ${info.name}` : tid
        return (
          <span
            key={tid}
            className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-mono border ${colorClass}`}
            title={tooltip}
            data-testid="mitre-badge"
          >
            {tid}
          </span>
        )
      })}
      {overflow > 0 && (
        <span className="text-[9px] text-text-muted" title={techniques.slice(2).join(', ')}>+{overflow}</span>
      )}
    </div>
  )
}
