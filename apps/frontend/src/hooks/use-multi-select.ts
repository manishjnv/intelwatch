/**
 * @module hooks/use-multi-select
 * @description Multi-select state hook — supports single toggle, Shift+Click range,
 * select-all-on-page, and clear. Used by IocListPage for bulk actions.
 */
import { useState, useCallback, useRef, useEffect } from 'react'

export interface MultiSelectReturn {
  selectedIds: Set<string>
  toggle: (id: string, idx: number, shiftKey: boolean) => void
  selectAllOnPage: (ids: string[]) => void
  clear: () => void
  isSelected: (id: string) => boolean
  selectAllState: (pageIds: string[]) => boolean | 'indeterminate'
}

/**
 * Multi-select hook with Shift+Click range support.
 * @param allIds — ordered list of IDs corresponding to current data rows
 */
export function useMultiSelect(allIds: string[]): MultiSelectReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdx = useRef<number | null>(null)

  // Clear stale selections when data changes
  useEffect(() => {
    lastClickedIdx.current = null
  }, [allIds])

  const toggle = useCallback((id: string, idx: number, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdx.current !== null) {
        const start = Math.min(lastClickedIdx.current, idx)
        const end = Math.max(lastClickedIdx.current, idx)
        for (let i = start; i <= end; i++) {
          if (allIds[i]) next.add(allIds[i]!)
        }
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      lastClickedIdx.current = idx
      return next
    })
  }, [allIds])

  const selectAllOnPage = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id))
      if (allSelected) return new Set() // deselect all
      return new Set([...prev, ...ids])
    })
  }, [])

  const clear = useCallback(() => {
    setSelectedIds(new Set())
    lastClickedIdx.current = null
  }, [])

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  const selectAllState = useCallback((pageIds: string[]): boolean | 'indeterminate' => {
    if (pageIds.length === 0) return false
    const count = pageIds.filter(id => selectedIds.has(id)).length
    if (count === 0) return false
    if (count === pageIds.length) return true
    return 'indeterminate'
  }, [selectedIds])

  return { selectedIds, toggle, selectAllOnPage, clear, isSelected, selectAllState }
}
