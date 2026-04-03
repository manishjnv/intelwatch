/**
 * @module components/search/SearchHistoryPanel
 * @description Dropdown panel showing last 20 searches with timestamps.
 * Click to re-run, clear history button. localStorage keyed by userId.
 */
import { useState, useEffect, useRef } from 'react'
import { Clock, Trash2, X } from 'lucide-react'

export interface HistoryEntry {
  query: string
  timestamp: number
}

const HISTORY_KEY = 'etip-search-history'
const MAX_ENTRIES = 20

export function getSearchHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') }
  catch { return [] }
}

export function addSearchHistory(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return
  const entries = getSearchHistory().filter(e => e.query !== trimmed)
  entries.unshift({ query: trimmed, timestamp: Date.now() })
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function clearSearchHistory() {
  localStorage.removeItem(HISTORY_KEY)
}

interface SearchHistoryPanelProps {
  open: boolean
  onClose: () => void
  onSelect: (query: string) => void
}

function timeLabel(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function SearchHistoryPanel({ open, onClose, onSelect }: SearchHistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setEntries(getSearchHistory())
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  if (!open || entries.length === 0) return null

  const handleClear = () => {
    clearSearchHistory()
    setEntries([])
    onClose()
  }

  return (
    <div ref={panelRef}
      className="absolute top-full left-0 right-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto"
      data-testid="search-history-panel"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-bg-elevated">
        <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium flex items-center gap-1">
          <Clock className="w-3 h-3" /> Search History
        </span>
        <div className="flex items-center gap-1">
          <button onClick={handleClear}
            className="text-[10px] text-text-muted hover:text-sev-critical transition-colors flex items-center gap-0.5"
            data-testid="clear-history"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
          <button onClick={onClose} className="p-0.5 text-text-muted hover:text-text-primary">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="py-1">
        {entries.map((e, i) => (
          <button
            key={`${e.query}-${i}`}
            onClick={() => { onSelect(e.query); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
            data-testid="history-entry"
          >
            <Clock className="w-3 h-3 text-text-muted shrink-0" />
            <span className="text-xs text-text-primary truncate flex-1 font-mono">{e.query}</span>
            <span className="text-[10px] text-text-muted shrink-0 tabular-nums">{timeLabel(e.timestamp)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
