/**
 * @module primitives/tooltip
 * @description Tooltip primitive built on @floating-ui/react.
 * Provides hover/focus tooltips across the platform.
 * This file is NOT design-locked — it's infrastructure.
 */
import React, { createContext, useContext, useState, useMemo } from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react'

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */
interface TooltipContextValue {
  open: boolean
  refs: ReturnType<typeof useFloating>['refs']
  floatingStyles: React.CSSProperties
  getFloatingProps: ReturnType<typeof useInteractions>['getFloatingProps']
  getReferenceProps: ReturnType<typeof useInteractions>['getReferenceProps']
}

const TooltipContext = createContext<TooltipContextValue | null>(null)

function useTooltipContext(): TooltipContextValue {
  const ctx = useContext(TooltipContext)
  if (!ctx) throw new Error('Tooltip components must be used within <Tooltip>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */
interface TooltipProps {
  children: React.ReactNode
  placement?: Placement
  delayMs?: number
}

export function Tooltip({ children, placement = 'top', delayMs = 300 }: TooltipProps) {
  const [open, setOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  const hover = useHover(context, { delay: { open: delayMs, close: 100 } })
  const focus = useFocus(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'tooltip' })

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role])

  const value = useMemo(
    () => ({ open, refs, floatingStyles, getFloatingProps, getReferenceProps }),
    [open, refs, floatingStyles, getFloatingProps, getReferenceProps],
  )

  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>
}

/* ------------------------------------------------------------------ */
/* Trigger                                                             */
/* ------------------------------------------------------------------ */
interface TooltipTriggerProps {
  children: React.ReactElement
  asChild?: boolean
}

export function TooltipTrigger({ children, asChild }: TooltipTriggerProps) {
  const { refs, getReferenceProps } = useTooltipContext()

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref: refs.setReference,
      ...getReferenceProps(),
    } as Record<string, unknown>)
  }

  return (
    <span ref={refs.setReference} {...getReferenceProps()}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
interface TooltipContentProps {
  children: React.ReactNode
  className?: string
}

export function TooltipContent({ children, className = '' }: TooltipContentProps) {
  const { open, refs, floatingStyles, getFloatingProps } = useTooltipContext()

  if (!open) return null

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className={`z-50 px-2.5 py-1.5 text-xs text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-[var(--shadow-md)] max-w-xs ${className}`}
        {...getFloatingProps()}
      >
        {children}
      </div>
    </FloatingPortal>
  )
}
