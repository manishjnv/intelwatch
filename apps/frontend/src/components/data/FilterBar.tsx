/**
 * @module components/data/FilterBar
 * @description Search input + filter dropdowns + export button.
 * P0-1: Live threat pulse strip integrated at bottom.
 */
import { useState } from 'react'
import { Search, X, Download, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterOption {
  key: string
  label: string
  options: { value: string; label: string }[]
}

interface FilterBarProps {
  searchValue: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  filters?: FilterOption[]
  filterValues?: Record<string, string>
  onFilterChange?: (key: string, value: string) => void
  onExport?: (format: 'json' | 'csv') => void
  children?: React.ReactNode
}

export function FilterBar({
  searchValue, onSearchChange, searchPlaceholder = 'Search…',
  filters, filterValues, onFilterChange, onExport, children,
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false)

  return (
    <div className="border-b border-border bg-bg-primary/50">
      {/* Search row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              'w-full pl-8 pr-8 py-1.5 text-xs rounded-md',
              'bg-bg-secondary border border-border text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50',
              'transition-colors',
            )}
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {filters && filters.length > 0 && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-1.5 rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors',
              showFilters && 'bg-accent/10 text-accent border-accent/30',
            )}
            title="Toggle filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        )}

        {onExport && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onExport('csv')}
              className="px-2 py-1.5 text-[11px] rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              <Download className="w-3 h-3 inline mr-1" />CSV
            </button>
            <button
              onClick={() => onExport('json')}
              className="px-2 py-1.5 text-[11px] rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              JSON
            </button>
          </div>
        )}

        {children}
      </div>

      {/* Filter dropdowns */}
      {showFilters && filters && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
          {filters.map(f => (
            <select
              key={f.key}
              value={filterValues?.[f.key] ?? ''}
              onChange={(e) => onFilterChange?.(f.key, e.target.value)}
              className={cn(
                'text-[11px] px-2 py-1 rounded-md',
                'bg-bg-secondary border border-border text-text-secondary',
                'focus:outline-none focus:ring-1 focus:ring-accent/50',
              )}
            >
              <option value="">{f.label}: All</option>
              {f.options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
          <button
            onClick={() => {
              filters.forEach(f => onFilterChange?.(f.key, ''))
            }}
            className="text-[11px] text-text-muted hover:text-accent transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
