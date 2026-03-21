/**
 * @module components/data/DataTable
 * @description Reusable sortable data table with density modes, severity row tinting,
 * 3D row lift on select, and keyboard navigation (j/k/Enter/Esc).
 * P0-4: Density-adaptive. P2-12: Keyboard-first navigation.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkeletonBlock } from '@etip/shared-ui/components/SkeletonBlock'

export type Density = 'comfortable' | 'compact' | 'ultra-dense'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  width?: string
  render: (row: T, density: Density) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRowClick?: (row: T) => void
  rowKey: (row: T) => string
  density?: Density
  onDensityChange?: (d: Density) => void
  severityField?: (row: T) => string | undefined
  emptyMessage?: string
  selectedId?: string | null
}

const DENSITY_HEIGHT: Record<Density, string> = {
  comfortable: 'h-12',
  compact: 'h-9',
  'ultra-dense': 'h-7',
}

const DENSITY_TEXT: Record<Density, string> = {
  comfortable: 'text-sm',
  compact: 'text-xs',
  'ultra-dense': 'text-[11px] font-mono',
}

const SEV_TINT: Record<string, string> = {
  critical: 'bg-sev-critical/[0.04]',
  high: 'bg-sev-high/[0.03]',
  medium: 'bg-sev-medium/[0.02]',
  low: 'bg-sev-low/[0.02]',
}

export function DataTable<T>({
  columns, data, loading, sortBy, sortOrder, onSort,
  onRowClick, rowKey, density = 'compact', severityField,
  emptyMessage = 'No data found', selectedId,
}: DataTableProps<T>) {
  const [focusIdx, setFocusIdx] = useState(-1)
  const tableRef = useRef<HTMLDivElement>(null)

  // P2-12: Keyboard navigation (j/k/Enter/Esc)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!tableRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return
      if (e.key === 'j' && data.length > 0) {
        e.preventDefault()
        setFocusIdx(i => Math.min(i + 1, data.length - 1))
      } else if (e.key === 'k' && data.length > 0) {
        e.preventDefault()
        setFocusIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && focusIdx >= 0 && focusIdx < data.length) {
        e.preventDefault()
        onRowClick?.(data[focusIdx]!)
      } else if (e.key === 'Escape') {
        setFocusIdx(-1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [data, focusIdx, onRowClick])

  const renderSortIcon = useCallback((col: Column<T>) => {
    if (!col.sortable) return null
    if (sortBy !== col.key) return <ChevronsUpDown className="w-3 h-3 opacity-30" />
    return sortOrder === 'asc'
      ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />
  }, [sortBy, sortOrder])

  if (loading) {
    return <div className="p-4"><SkeletonBlock rows={8} /></div>
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div ref={tableRef} className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-bg-secondary/50">
            {columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-3 py-2 text-left text-[11px] font-medium text-text-muted uppercase tracking-wider whitespace-nowrap',
                  col.sortable && 'cursor-pointer hover:text-text-primary select-none',
                )}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {renderSortIcon(col)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const id = rowKey(row)
            const sev = severityField?.(row)
            const tint = sev ? SEV_TINT[sev] ?? '' : ''
            const isSelected = selectedId === id
            const isFocused = focusIdx === idx

            return (
              <tr
                key={id}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  DENSITY_HEIGHT[density],
                  DENSITY_TEXT[density],
                  'border-b border-border/50 transition-all duration-150',
                  tint,
                  onRowClick && 'cursor-pointer hover:bg-bg-hover',
                  isSelected && 'bg-accent/10 border-accent/30 -translate-y-px shadow-sm',
                  isFocused && 'ring-1 ring-accent/40 ring-inset',
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-3 whitespace-nowrap text-text-primary">
                    {col.render(row, density)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
