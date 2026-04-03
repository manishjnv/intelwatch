/**
 * @module components/search/SavedSearches
 * @description Save current search query + filters as named preset.
 * Default presets seeded on first load. Share via URL copy.
 */
import { useState, useEffect, useRef } from 'react'
import { Bookmark, Plus, Trash2, Link2, X } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { buildShareUrl } from '@/utils/search-helpers'
import type { EsSearchFilters } from '@/hooks/use-es-search'

export interface SavedSearch {
  id: string
  name: string
  query: string
  filters: EsSearchFilters
  sortBy: string
  createdAt: number
  isDefault?: boolean
}

const STORAGE_KEY = 'etip-saved-searches'

const DEFAULT_PRESETS: Omit<SavedSearch, 'id' | 'createdAt'>[] = [
  { name: 'Critical IOCs (last 24h)', query: 'seen:24h', filters: { severity: ['critical'] }, sortBy: 'lastSeen_desc', isDefault: true },
  { name: 'Unverified indicators', query: '', filters: { enriched: false as unknown as boolean }, sortBy: 'confidence_desc', isDefault: true },
  { name: 'High-confidence threats', query: '', filters: { confidenceMin: 80, severity: ['critical', 'high'] }, sortBy: 'confidence_desc', isDefault: true },
]

function loadSaved(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
    // Seed defaults on first load
    const defaults = DEFAULT_PRESETS.map((p, i) => ({
      ...p,
      id: `default-${i}`,
      createdAt: Date.now(),
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
    return defaults
  } catch { return [] }
}

function saveSaved(items: SavedSearch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

interface SavedSearchesProps {
  open: boolean
  onClose: () => void
  onSelect: (saved: SavedSearch) => void
  currentQuery: string
  currentFilters: EsSearchFilters
  currentSortBy: string
}

export function SavedSearches({ open, onClose, onSelect, currentQuery, currentFilters, currentSortBy }: SavedSearchesProps) {
  const [items, setItems] = useState<SavedSearch[]>([])
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [name, setName] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) setItems(loadSaved()) }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  if (!open) return null

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const entry: SavedSearch = {
      id: crypto.randomUUID(),
      name: trimmed,
      query: currentQuery,
      filters: currentFilters,
      sortBy: currentSortBy,
      createdAt: Date.now(),
    }
    const next = [entry, ...items]
    saveSaved(next)
    setItems(next)
    setName('')
    setShowSaveForm(false)
    toast('Search saved', 'success')
  }

  const handleDelete = (id: string) => {
    const next = items.filter(i => i.id !== id)
    saveSaved(next)
    setItems(next)
  }

  const handleShare = (saved: SavedSearch) => {
    const params: Record<string, string> = {}
    if (saved.query) params.q = saved.query
    if (saved.filters.type?.length) params.type = saved.filters.type.join(',')
    if (saved.filters.severity?.length) params.severity = saved.filters.severity.join(',')
    if (saved.filters.confidenceMin) params.conf_min = String(saved.filters.confidenceMin)
    if (saved.sortBy !== 'relevance') params.sort = saved.sortBy
    const url = buildShareUrl(params)
    navigator.clipboard.writeText(url)
    toast('Share URL copied to clipboard', 'success')
  }

  return (
    <div ref={panelRef}
      className="absolute top-full right-0 mt-1 w-80 bg-bg-elevated border border-border rounded-lg shadow-xl z-50 max-h-96 flex flex-col"
      data-testid="saved-searches-panel"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium flex items-center gap-1">
          <Bookmark className="w-3 h-3" /> Saved Searches
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSaveForm(!showSaveForm)}
            className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-0.5"
            data-testid="save-search-toggle"
          >
            <Plus className="w-3 h-3" /> Save current
          </button>
          <button onClick={onClose} className="p-0.5 text-text-muted hover:text-text-primary">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Save form */}
      {showSaveForm && (
        <div className="px-3 py-2 border-b border-border flex items-center gap-2" data-testid="save-search-form">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Name this search…"
            className="flex-1 text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            autoFocus
            data-testid="save-search-input"
          />
          <button onClick={handleSave}
            className="text-xs bg-accent text-white px-2.5 py-1.5 rounded hover:bg-accent-hover transition-colors"
            data-testid="save-search-submit"
          >
            Save
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-muted text-center">No saved searches</div>
        )}
        {items.map(s => (
          <div key={s.id}
            className="flex items-center gap-2 px-3 py-2 hover:bg-bg-hover transition-colors group/saved"
            data-testid="saved-search-entry"
          >
            <button onClick={() => { onSelect(s); onClose() }}
              className="flex-1 text-left text-xs text-text-primary truncate"
            >
              <span className="font-medium">{s.name}</span>
              {s.query && <span className="text-text-muted ml-1 font-mono text-[10px]">{s.query}</span>}
            </button>
            <button onClick={() => handleShare(s)}
              className="opacity-0 group-hover/saved:opacity-100 p-0.5 text-text-muted hover:text-accent transition-all"
              title="Copy share URL"
            >
              <Link2 className="w-3 h-3" />
            </button>
            {!s.isDefault && (
              <button onClick={() => handleDelete(s.id)}
                className="opacity-0 group-hover/saved:opacity-100 p-0.5 text-text-muted hover:text-sev-critical transition-all"
                title="Delete"
                data-testid="delete-saved"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
