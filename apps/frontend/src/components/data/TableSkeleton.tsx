/**
 * @module components/data/TableSkeleton
 * @description Reusable loading skeleton matching DataTable layout.
 * Animate-pulse divs sized to approximate column widths.
 */
import { cn } from '@/lib/utils'

interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

export function TableSkeleton({ rows = 10, columns = 6, className }: TableSkeletonProps) {
  const colWidth = `${Math.floor(100 / columns)}%`

  return (
    <div className={cn('w-full', className)} data-testid="table-skeleton">
      {/* Header row */}
      <div className="flex gap-3 px-3 py-2 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="h-3 bg-bg-elevated rounded animate-pulse"
            style={{ width: colWidth }}
          />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex gap-3 px-3 py-2.5 border-b border-border-subtle" data-testid="skeleton-row">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={`c-${r}-${c}`}
              className="h-3 bg-bg-elevated rounded animate-pulse"
              style={{
                width: colWidth,
                animationDelay: `${(r * columns + c) * 50}ms`,
              }}
              data-testid="skeleton-cell"
            />
          ))}
        </div>
      ))}
    </div>
  )
}
