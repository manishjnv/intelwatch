/**
 * @module components/viz/EntityPreview
 * @description Inline entity hover preview — wraps EntityChip (design-locked)
 * with a floating detail card on hover via Floating UI. P0-3.
 */
import { useState, useRef } from 'react'
import {
  useFloating,
  useHover,
  useInteractions,
  useDismiss,
  offset,
  shift,
  flip,
  FloatingPortal,
  safePolygon,
} from '@floating-ui/react'
import { cn } from '@/lib/utils'
import { SkeletonBlock } from '@etip/shared-ui/components/SkeletonBlock'

interface EntityPreviewProps {
  type: string
  value: string
  severity?: string
  confidence?: number
  firstSeen?: string | null
  lastSeen?: string | null
  tags?: string[]
  children: React.ReactNode
}

export function EntityPreview({
  type,
  value,
  severity,
  confidence,
  firstSeen,
  lastSeen,
  tags = [],
  children,
}: EntityPreviewProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  })

  const hover = useHover(context, {
    delay: { open: 400, close: 150 },
    handleClose: safePolygon(),
  })
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, dismiss])

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} data-testid="entity-preview-trigger">
        {children}
      </span>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50"
            data-testid="entity-preview-card"
          >
            <div className="w-64 rounded-lg border border-border bg-bg-elevated shadow-lg p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-medium text-text-muted">{type}</span>
                {severity && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    severity === 'critical' && 'bg-red-500/20 text-red-300',
                    severity === 'high' && 'bg-orange-500/20 text-orange-300',
                    severity === 'medium' && 'bg-yellow-500/20 text-yellow-300',
                    severity === 'low' && 'bg-green-500/20 text-green-300',
                  )}>
                    {severity}
                  </span>
                )}
              </div>

              {/* Value */}
              <p className="text-xs text-text-primary font-mono break-all">{value}</p>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-[10px] text-text-secondary">
                {confidence !== undefined && (
                  <span>Conf: <span className="text-text-primary tabular-nums">{confidence}%</span></span>
                )}
                {firstSeen && <span>First: {firstSeen.slice(0, 10)}</span>}
                {lastSeen && <span>Last: {lastSeen.slice(0, 10)}</span>}
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.slice(0, 4).map(t => (
                    <span key={t} className="text-[10px] px-1 py-0.5 rounded bg-bg-secondary text-text-muted">{t}</span>
                  ))}
                  {tags.length > 4 && <span className="text-[10px] text-text-muted">+{tags.length - 4}</span>}
                </div>
              )}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
