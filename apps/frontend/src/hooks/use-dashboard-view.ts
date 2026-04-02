/**
 * @module hooks/use-dashboard-view
 * @description Persisted dashboard view toggle — Analyst (default) or Executive.
 */
import { useState, useCallback } from 'react'

export type DashboardView = 'analyst' | 'executive'

const STORAGE_KEY = 'etip-dashboard-view'

function getStoredView(): DashboardView {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'executive' ? 'executive' : 'analyst'
  } catch { return 'analyst' }
}

export function useDashboardView() {
  const [view, setView] = useState<DashboardView>(getStoredView)

  const toggleView = useCallback(() => {
    setView(prev => {
      const next = prev === 'analyst' ? 'executive' : 'analyst'
      try { localStorage.setItem(STORAGE_KEY, next) } catch { /* noop */ }
      return next
    })
  }, [])

  return { view, toggleView } as const
}
