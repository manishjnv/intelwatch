/**
 * @module hooks/use-filter-presets
 * @description localStorage-backed saved filter presets for IOC list.
 * Includes 4 default presets (non-deletable) + custom user presets.
 */
import { useState, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'

export interface FilterPreset {
  id: string
  name: string
  isDefault: boolean
  filters: Record<string, string>
  sortBy: string
  sortOrder: 'asc' | 'desc'
  search?: string
}

const DEFAULT_PRESETS: FilterPreset[] = [
  { id: 'default-critical-7d', name: 'Critical Last 7d', isDefault: true,
    filters: { severity: 'critical' }, sortBy: 'lastSeen', sortOrder: 'desc' },
  { id: 'default-unverified-ips', name: 'Unverified IPs', isDefault: true,
    filters: { iocType: 'ip', lifecycle: 'new' }, sortBy: 'firstSeen', sortOrder: 'desc' },
  { id: 'default-high-conf-expired', name: 'High Confidence Expired', isDefault: true,
    filters: { lifecycle: 'expired' }, sortBy: 'confidence', sortOrder: 'desc' },
  { id: 'default-all-domains', name: 'All Domains', isDefault: true,
    filters: { iocType: 'domain' }, sortBy: 'lastSeen', sortOrder: 'desc' },
]

function getStorageKey(tenantId: string) {
  return `etip-ioc-presets-${tenantId}`
}

function loadCustomPresets(tenantId: string): FilterPreset[] {
  try {
    const raw = localStorage.getItem(getStorageKey(tenantId))
    if (!raw) return []
    return JSON.parse(raw) as FilterPreset[]
  } catch {
    return []
  }
}

function saveCustomPresets(tenantId: string, presets: FilterPreset[]) {
  try {
    localStorage.setItem(getStorageKey(tenantId), JSON.stringify(presets))
  } catch { /* quota exceeded — silently fail */ }
}

export function useFilterPresets() {
  const tenantId = useAuthStore(s => s.user?.tenantId) ?? 'default'
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>(() => loadCustomPresets(tenantId))

  // Reload when tenantId changes
  useEffect(() => {
    setCustomPresets(loadCustomPresets(tenantId))
  }, [tenantId])

  const presets = [...DEFAULT_PRESETS, ...customPresets]

  const savePreset = useCallback((name: string, state: Omit<FilterPreset, 'id' | 'name' | 'isDefault'>) => {
    const preset: FilterPreset = { id: crypto.randomUUID(), name, isDefault: false, ...state }
    setCustomPresets(prev => {
      const next = [...prev, preset]
      saveCustomPresets(tenantId, next)
      return next
    })
  }, [tenantId])

  const deletePreset = useCallback((id: string) => {
    setCustomPresets(prev => {
      const next = prev.filter(p => p.id !== id)
      saveCustomPresets(tenantId, next)
      return next
    })
  }, [tenantId])

  return { presets, savePreset, deletePreset }
}
