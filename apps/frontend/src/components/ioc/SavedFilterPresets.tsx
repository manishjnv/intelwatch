/**
 * @module components/ioc/SavedFilterPresets
 * @description Dropdown for loading/saving IOC filter presets.
 * Default presets (locked) + custom presets with save/delete.
 */
import { useState, useRef, useEffect } from 'react'
import { Bookmark, Lock, Trash2, Plus } from 'lucide-react'
import { useFilterPresets, type FilterPreset } from '@/hooks/use-filter-presets'
import { toast } from '@/components/ui/Toast'

interface SavedFilterPresetsProps {
  currentFilters: Record<string, string>
  currentSortBy: string
  currentSortOrder: 'asc' | 'desc'
  currentSearch: string
  onLoadPreset: (preset: FilterPreset) => void
}

export function SavedFilterPresets({
  currentFilters, currentSortBy, currentSortOrder, currentSearch, onLoadPreset,
}: SavedFilterPresetsProps) {
  const { presets, savePreset, deletePreset } = useFilterPresets()
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false); setIsSaving(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Focus input when entering save mode
  useEffect(() => {
    if (isSaving) inputRef.current?.focus()
  }, [isSaving])

  const handleSave = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    savePreset(trimmed, {
      filters: currentFilters,
      sortBy: currentSortBy,
      sortOrder: currentSortOrder,
      search: currentSearch,
    })
    toast(`Saved view "${trimmed}"`, 'success')
    setNewName('')
    setIsSaving(false)
  }

  const handleLoad = (preset: FilterPreset) => {
    onLoadPreset(preset)
    setIsOpen(false)
    toast(`Loaded "${preset.name}"`, 'info')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border text-text-muted hover:text-accent hover:border-accent/30 transition-colors"
        data-testid="saved-views-btn"
      >
        <Bookmark className="w-3 h-3" />
        <span className="hidden sm:inline">Saved Views</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-bg-secondary border border-border rounded-lg shadow-lg z-20 w-56 py-1"
          data-testid="saved-views-dropdown">
          {/* Preset list */}
          {presets.map(p => (
            <div key={p.id} className="flex items-center group">
              <button
                onClick={() => handleLoad(p)}
                className="flex-1 flex items-center gap-2 px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover text-left transition-colors"
                data-testid={`preset-${p.id}`}
              >
                {p.isDefault ? <Lock className="w-3 h-3 text-text-muted shrink-0" /> : <Bookmark className="w-3 h-3 text-accent shrink-0" />}
                <span className="truncate">{p.name}</span>
              </button>
              {!p.isDefault && (
                <button
                  onClick={(e) => { e.stopPropagation(); deletePreset(p.id); toast('View deleted', 'info') }}
                  className="px-2 py-1.5 text-text-muted hover:text-sev-critical opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`delete-preset-${p.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {/* Separator */}
          <div className="my-1 border-t border-border" />

          {/* Save current view */}
          {isSaving ? (
            <div className="flex items-center gap-1 px-3 py-1.5">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsSaving(false) }}
                placeholder="View name…"
                className="flex-1 px-2 py-1 text-[10px] rounded bg-bg-primary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                data-testid="save-preset-input"
              />
              <button onClick={handleSave}
                className="px-2 py-1 text-[10px] rounded bg-accent text-white hover:bg-accent-hover transition-colors"
                data-testid="save-preset-confirm">Save</button>
            </div>
          ) : (
            <button
              onClick={() => setIsSaving(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-accent hover:bg-bg-hover transition-colors"
              data-testid="save-current-view-btn"
            >
              <Plus className="w-3 h-3" />Save Current View
            </button>
          )}
        </div>
      )}
    </div>
  )
}
