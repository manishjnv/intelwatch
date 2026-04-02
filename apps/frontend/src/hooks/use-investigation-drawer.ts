/**
 * @module hooks/use-investigation-drawer
 * Lightweight global state for the IOC investigation drawer.
 * Uses React context + useState — no extra deps.
 */
import { createContext, useContext, useState, useCallback, createElement, type ReactNode } from 'react'

export interface DrawerPayload {
  value: string
  type: string
  severity?: string
  confidence?: number
  corroboration?: number
  lastSeen?: string
  createdAt?: string
}

interface DrawerState {
  isOpen: boolean
  payload: DrawerPayload | null
  open: (p: DrawerPayload) => void
  close: () => void
}

const DrawerContext = createContext<DrawerState | null>(null)

export function InvestigationDrawerProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<DrawerPayload | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback((p: DrawerPayload) => {
    setPayload(p)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Delay clearing payload so exit animation completes
    setTimeout(() => setPayload(null), 300)
  }, [])

  return createElement(DrawerContext.Provider, { value: { isOpen, payload, open, close } }, children)
}

// Re-export createElement call for JSX-less usage
InvestigationDrawerProvider.displayName = 'InvestigationDrawerProvider'

const NOOP_STATE: DrawerState = {
  isOpen: false,
  payload: null,
  open: () => {},
  close: () => {},
}

export function useInvestigationDrawer(): DrawerState {
  const ctx = useContext(DrawerContext)
  return ctx ?? NOOP_STATE
}
