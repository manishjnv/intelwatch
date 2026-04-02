/**
 * @module components/viz/QuickActionToolbar
 * @description Floating bottom toolbar — appears on row selection with
 * bulk actions. Framer Motion slide-up. P1-9. Tier 2: lifecycle, tag, export format, re-enrich.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Tag, RefreshCw, Archive, X, ChevronDown, Columns } from 'lucide-react'
import { LIFECYCLE_STATES } from '@/components/ioc/ioc-constants'

interface QuickActionToolbarProps {
  selectedCount: number
  onExport?: () => void
  onBulkExport?: (format: 'csv' | 'json' | 'stix') => void
  onTag?: () => void
  onBulkTag?: (tag: string) => void
  onCompare?: () => void
  onArchive?: () => void
  onLifecycleChange?: (state: string) => void
  onReEnrich?: () => void
  onClear?: () => void
}

export function QuickActionToolbar({
  selectedCount,
  onExport,
  onBulkExport,
  onBulkTag,
  onCompare,
  onArchive,
  onLifecycleChange,
  onReEnrich,
  onClear,
}: QuickActionToolbarProps) {
  const [tagInput, setTagInput] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showLifecycleMenu, setShowLifecycleMenu] = useState(false)

  const handleTagSubmit = () => {
    const trimmed = tagInput.trim()
    if (trimmed && onBulkTag) { onBulkTag(trimmed); setTagInput('') }
  }

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          className="fixed bottom-6 left-1/2 z-50 flex items-center gap-1 px-3 py-2 rounded-xl
            bg-bg-elevated border border-border-strong shadow-lg backdrop-blur-sm"
          style={{ transform: 'translateX(-50%)' }}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          data-testid="quick-action-toolbar"
        >
          {/* Selection count badge */}
          <span className="text-xs font-medium text-accent tabular-nums mr-2" data-testid="selection-count">
            {selectedCount} selected
          </span>

          {/* Compare (2-3 selected) */}
          {selectedCount >= 2 && selectedCount <= 3 && onCompare && (
            <button
              onClick={onCompare}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-accent hover:bg-accent/10 transition-colors font-medium"
              title="Compare selected IOCs" data-testid="action-compare"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Compare</span>
            </button>
          )}

          <div className="w-px h-5 bg-border mx-1" />

          {/* Lifecycle dropdown */}
          {selectedCount >= 2 && onLifecycleChange && (
            <div className="relative">
              <button
                onClick={() => { setShowLifecycleMenu(s => !s); setShowExportMenu(false) }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                title="Change lifecycle" data-testid="action-lifecycle"
              >
                <ChevronDown className="w-3 h-3" />
                <span className="hidden sm:inline">Lifecycle</span>
              </button>
              {showLifecycleMenu && (
                <div className="absolute bottom-full mb-1 left-0 bg-bg-secondary border border-border rounded-lg shadow-lg z-20 py-1 w-28" data-testid="lifecycle-menu">
                  {LIFECYCLE_STATES.map(s => (
                    <button key={s} onClick={() => { onLifecycleChange(s); setShowLifecycleMenu(false) }}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover capitalize">{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tag input */}
          {selectedCount >= 2 && onBulkTag && (
            <div className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTagSubmit()}
                placeholder="Add tag…"
                className="w-20 sm:w-24 px-1.5 py-1 text-[10px] rounded bg-bg-secondary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                data-testid="bulk-tag-input"
              />
            </div>
          )}

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => { if (onBulkExport) { setShowExportMenu(s => !s); setShowLifecycleMenu(false) } else { onExport?.() } }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Export" data-testid="action-export"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            {showExportMenu && onBulkExport && (
              <div className="absolute bottom-full mb-1 left-0 bg-bg-secondary border border-border rounded-lg shadow-lg z-20 py-1 w-28" data-testid="export-format-menu">
                {(['csv', 'json', 'stix'] as const).map(fmt => (
                  <button key={fmt} onClick={() => { onBulkExport(fmt); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover uppercase">{fmt}</button>
                ))}
              </div>
            )}
          </div>

          {/* Re-enrich */}
          {selectedCount >= 2 && onReEnrich && (
            <button
              onClick={onReEnrich}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Re-enrich selected" data-testid="action-re-enrich"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Re-enrich</span>
            </button>
          )}

          {/* Archive */}
          {onArchive && (
            <button
              onClick={onArchive}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Archive" data-testid="action-archive"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Archive</span>
            </button>
          )}

          <div className="w-px h-5 bg-border mx-1" />

          {/* Clear selection */}
          <button
            onClick={onClear}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Clear selection" data-testid="action-clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
