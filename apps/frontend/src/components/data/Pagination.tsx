/**
 * @module components/data/Pagination
 * @description Pagination controls with page info and density toggle.
 */
import { ChevronLeft, ChevronRight, Rows3, Rows4, AlignJustify } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Density } from './DataTable'

interface PaginationProps {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
  density?: Density
  onDensityChange?: (d: Density) => void
}

const DENSITY_OPTIONS: { value: Density; icon: React.ReactNode; label: string }[] = [
  { value: 'comfortable', icon: <Rows3 className="w-3.5 h-3.5" />, label: 'Comfortable' },
  { value: 'compact', icon: <Rows4 className="w-3.5 h-3.5" />, label: 'Compact' },
  { value: 'ultra-dense', icon: <AlignJustify className="w-3.5 h-3.5" />, label: 'Dense' },
]

export function Pagination({ page, limit, total, onPageChange, density, onDensityChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit) || 1
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-bg-secondary/30 text-xs text-text-muted">
      <span>
        {total > 0 ? `${from}–${to} of ${total.toLocaleString()}` : 'No results'}
      </span>

      <div className="flex items-center gap-3">
        {/* P0-4: Density toggle */}
        {onDensityChange && (
          <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5">
            {DENSITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onDensityChange(opt.value)}
                className={cn(
                  'p-1 rounded transition-colors',
                  density === opt.value
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-muted hover:text-text-primary',
                )}
                title={opt.label}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        )}

        {/* Page nav */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
