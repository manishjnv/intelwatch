/**
 * @module primitives/popover
 * @description Popover primitive built on @floating-ui/react.
 * Used by EntityChip and other shared-ui components.
 * This file is NOT design-locked — it's infrastructure, not visual.
 */
import React, { createContext, useContext, useState, useMemo } from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  type Placement,
} from '@floating-ui/react'

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */
interface PopoverContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  refs: ReturnType<typeof useFloating>['refs']
  floatingStyles: React.CSSProperties
  getFloatingProps: ReturnType<typeof useInteractions>['getFloatingProps']
  getReferenceProps: ReturnType<typeof useInteractions>['getReferenceProps']
  context: ReturnType<typeof useFloating>['context']
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

function usePopoverContext(): PopoverContextValue {
  const ctx = useContext(PopoverContext)
  if (!ctx) throw new Error('Popover components must be used within <Popover>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */
interface PopoverProps {
  children: React.ReactNode
  placement?: Placement
  offsetPx?: number
}

export function Popover({ children, placement = 'bottom', offsetPx = 8 }: PopoverProps) {
  const [open, setOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(offsetPx), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context)

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  const value = useMemo(
    () => ({ open, setOpen, refs, floatingStyles, getFloatingProps, getReferenceProps, context }),
    [open, setOpen, refs, floatingStyles, getFloatingProps, getReferenceProps, context],
  )

  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
}

/* ------------------------------------------------------------------ */
/* Trigger                                                             */
/* ------------------------------------------------------------------ */
interface PopoverTriggerProps {
  children: React.ReactElement
  asChild?: boolean
}

export function PopoverTrigger({ children, asChild }: PopoverTriggerProps) {
  const { refs, getReferenceProps } = usePopoverContext()

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref: refs.setReference,
      ...getReferenceProps(),
    } as Record<string, unknown>)
  }

  return (
    <button ref={refs.setReference} {...getReferenceProps()} type="button">
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
interface PopoverContentProps {
  children: React.ReactNode
  className?: string
}

export function PopoverContent({ children, className = '' }: PopoverContentProps) {
  const { open, refs, floatingStyles, getFloatingProps, context } = usePopoverContext()

  if (!open) return null

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false}>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className={className}
          {...getFloatingProps()}
        >
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  )
}
