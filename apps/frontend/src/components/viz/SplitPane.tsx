/**
 * @module components/viz/SplitPane
 * @description Resizable split-pane layout — draggable divider between
 * table (left) and detail panel (right). P1-7.
 * Mobile (<768px): right panel becomes a full-screen overlay.
 */
import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { GripVertical, X } from 'lucide-react'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode | null
  showRight: boolean
  onCloseRight?: () => void
  defaultSplit?: number
  minLeft?: number
  maxLeft?: number
  className?: string
}

export function SplitPane({
  left,
  right,
  showRight,
  onCloseRight,
  defaultSplit = 60,
  minLeft = 35,
  maxLeft = 80,
  className,
}: SplitPaneProps) {
  const [split, setSplit] = useState(defaultSplit)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setSplit(Math.min(Math.max(pct, minLeft), maxLeft))
    }

    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [minLeft, maxLeft])

  if (!showRight) {
    return (
      <div className={cn('flex-1 overflow-hidden', className)} data-testid="split-pane">
        {left}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('flex-1 overflow-hidden relative', className)} data-testid="split-pane">
      {/* ─── Desktop: side-by-side split (≥768px) ─── */}
      <div className="hidden md:flex h-full">
        {/* Left pane */}
        <div className="overflow-auto" style={{ width: `${split}%` }} data-testid="split-left">
          {left}
        </div>

        {/* Draggable divider */}
        <div
          className="w-1.5 bg-border hover:bg-accent/40 cursor-col-resize flex items-center justify-center shrink-0 transition-colors group"
          onMouseDown={handleMouseDown}
          data-testid="split-divider"
        >
          <GripVertical className="w-3 h-3 text-text-muted group-hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Right pane */}
        <AnimatePresence>
          <motion.div
            className="overflow-auto bg-bg-elevated/50"
            style={{ width: `${100 - split}%` }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            data-testid="split-right"
          >
            {right}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Mobile: table full-width + overlay panel (<768px) ─── */}
      <div className="md:hidden h-full">
        <div className="h-full overflow-auto" data-testid="split-left">
          {left}
        </div>

        {/* Full-screen overlay */}
        <AnimatePresence>
          {showRight && (
            <motion.div
              className="absolute inset-0 z-40 bg-bg-primary flex flex-col"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              data-testid="split-right"
            >
              {/* Close bar */}
              {onCloseRight && (
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary">
                  <span className="text-xs font-medium text-text-secondary">IOC Detail</span>
                  <button
                    onClick={onCloseRight}
                    className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-auto">
                {right}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
