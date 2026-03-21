/**
 * @module components/viz/QuickActionToolbar
 * @description Floating bottom toolbar — appears on row selection with
 * bulk actions. Framer Motion slide-up. P1-9.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Tag, GitCompare, Archive, X } from 'lucide-react'

interface QuickActionToolbarProps {
  selectedCount: number
  onExport?: () => void
  onTag?: () => void
  onCompare?: () => void
  onArchive?: () => void
  onClear?: () => void
}

interface ActionButton {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}

export function QuickActionToolbar({
  selectedCount,
  onExport,
  onTag,
  onCompare,
  onArchive,
  onClear,
}: QuickActionToolbarProps) {
  const actions: ActionButton[] = [
    { icon: <Download className="w-3.5 h-3.5" />, label: 'Export', onClick: onExport },
    { icon: <Tag className="w-3.5 h-3.5" />, label: 'Tag', onClick: onTag },
    { icon: <GitCompare className="w-3.5 h-3.5" />, label: 'Compare', onClick: onCompare },
    { icon: <Archive className="w-3.5 h-3.5" />, label: 'Archive', onClick: onArchive },
  ]

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

          <div className="w-px h-5 bg-border mx-1" />

          {/* Action buttons */}
          {actions.map(action => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary
                hover:text-text-primary hover:bg-bg-hover transition-colors"
              title={action.label}
              data-testid={`action-${action.label.toLowerCase()}`}
            >
              {action.icon}
              <span className="hidden sm:inline">{action.label}</span>
            </button>
          ))}

          <div className="w-px h-5 bg-border mx-1" />

          {/* Clear selection */}
          <button
            onClick={onClear}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-text-muted
              hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Clear selection"
            data-testid="action-clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
