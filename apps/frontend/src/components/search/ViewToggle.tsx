/**
 * @module components/search/ViewToggle
 * @description Table / Card view toggle for search results.
 */
import { LayoutGrid, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'table' | 'card'

interface ViewToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center bg-bg-elevated border border-border rounded-lg p-0.5" data-testid="view-toggle">
      <button
        onClick={() => onChange('table')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors',
          mode === 'table' ? 'bg-accent/15 text-accent font-medium' : 'text-text-muted hover:text-text-secondary',
        )}
        title="Table view"
        data-testid="view-table"
      >
        <Table2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Table</span>
      </button>
      <button
        onClick={() => onChange('card')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors',
          mode === 'card' ? 'bg-accent/15 text-accent font-medium' : 'text-text-muted hover:text-text-secondary',
        )}
        title="Card view"
        data-testid="view-card"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Cards</span>
      </button>
    </div>
  )
}
