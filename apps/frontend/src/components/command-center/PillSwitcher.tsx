/**
 * @module components/command-center/PillSwitcher
 * @description Compact internal sub-tab navigation for Command Center tabs
 * that have multiple sections. Horizontal scroll on overflow (mobile).
 */
import { cn } from '@/lib/utils'

export interface PillItem {
  id: string
  label: string
  badge?: number | null
}

interface PillSwitcherProps {
  items: PillItem[]
  activeId: string
  onChange: (id: string) => void
  className?: string
}

export function PillSwitcher({ items, activeId, onChange, className }: PillSwitcherProps) {
  return (
    <div
      data-testid="pill-switcher"
      className={cn(
        'flex gap-1 overflow-x-auto scrollbar-hide p-1 bg-bg-elevated rounded-lg border border-border',
        className,
      )}
    >
      {items.map(item => {
        const isActive = item.id === activeId
        return (
          <button
            key={item.id}
            data-testid={`pill-${item.id}`}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors',
              isActive
                ? 'bg-accent/15 text-accent shadow-sm'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover',
            )}
          >
            {item.label}
            {item.badge != null && item.badge > 0 && (
              <span className={cn(
                'px-1.5 py-0.5 text-[10px] rounded-full font-medium',
                isActive ? 'bg-accent/20 text-accent' : 'bg-bg-hover text-text-muted',
              )}>
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
