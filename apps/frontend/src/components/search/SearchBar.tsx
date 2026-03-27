/**
 * @module components/search/SearchBar
 * @description Full-featured search input with recent searches, syntax hints, and saved searches.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, HelpCircle, Bookmark, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────

interface SavedSearch {
  name: string
  query: string
  createdAt: string
}

interface SearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  onSearch: () => void
  isLoading?: boolean
}

// ─── LocalStorage helpers ────────────────────────────────────

const RECENT_KEY = 'etip-search-recent'
const SAVED_KEY = 'etip-search-saved'
const MAX_RECENT = 10

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') }
  catch { return [] }
}

function addRecent(q: string) {
  const recent = getRecent().filter(r => r !== q)
  recent.unshift(q)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

function getSaved(): SavedSearch[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') }
  catch { return [] }
}

function addSaved(name: string, query: string) {
  const saved = getSaved().filter(s => s.name !== name)
  saved.unshift({ name, query, createdAt: new Date().toISOString() })
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved))
}

function removeSaved(name: string) {
  const saved = getSaved().filter(s => s.name !== name)
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved))
}

// ─── Search syntax hints ─────────────────────────────────────

const SYNTAX_HINTS = [
  { prefix: 'type:', example: 'type:ip', desc: 'Filter by IOC type' },
  { prefix: 'severity:', example: 'severity:critical', desc: 'Filter by severity' },
  { prefix: 'tag:', example: 'tag:malware', desc: 'Filter by tag' },
  { prefix: '"…"', example: '"exact phrase"', desc: 'Exact phrase match' },
]

const TYPE_HINTS = ['ip', 'domain', 'url', 'hash_sha256', 'hash_md5', 'cve', 'email']
const SEVERITY_HINTS = ['critical', 'high', 'medium', 'low']

// ─── Component ───────────────────────────────────────────────

export function SearchBar({ query, onQueryChange, onSearch, isLoading }: SearchBarProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showSyntax, setShowSyntax] = useState(false)
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saveName, setSaveName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const recentSearches = getRecent()
  const savedSearches = getSaved()

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard: / focuses search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onQueryChange('')
        inputRef.current?.blur()
        setShowDropdown(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onQueryChange])

  const handleSubmit = useCallback(() => {
    if (query.trim()) addRecent(query.trim())
    setShowDropdown(false)
    onSearch()
  }, [query, onSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }, [handleSubmit])

  // Compute suggestions based on current input
  const suggestions = (() => {
    const q = query.toLowerCase()
    if (q.endsWith('type:')) return TYPE_HINTS.map(t => `type:${t}`)
    if (q.endsWith('severity:')) return SEVERITY_HINTS.map(s => `severity:${s}`)
    return []
  })()

  const handleSave = () => {
    if (saveName.trim() && query.trim()) {
      addSaved(saveName.trim(), query.trim())
      setSaveName('')
      setShowSaveInput(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { onQueryChange(e.target.value); setShowDropdown(true) }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search IOCs — IP, domain, hash, CVE, URL, email…"
          autoFocus
          className={cn(
            'w-full pl-11 pr-24 py-3.5 rounded-xl text-sm text-text-primary placeholder:text-text-muted',
            'bg-bg-elevated border-2 transition-all focus:outline-none',
            query ? 'border-accent shadow-[0_0_0_2px_rgba(59,130,246,0.15)]' : 'border-border focus:border-accent',
          )}
          data-testid="search-input"
        />

        {/* Right-side buttons */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && <Loader2 className="w-4 h-4 text-accent animate-spin" data-testid="search-loading" />}
          {query && (
            <button
              onClick={() => { onQueryChange(''); inputRef.current?.focus() }}
              className="p-1.5 text-text-muted hover:text-text-primary transition-colors rounded-md hover:bg-bg-hover"
              title="Clear search"
              data-testid="search-clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowSyntax(!showSyntax)}
            className={cn('p-1.5 rounded-md transition-colors', showSyntax ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover')}
            title="Search syntax help"
            data-testid="search-syntax-help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          {query.trim() && (
            <button
              onClick={() => setShowSaveInput(!showSaveInput)}
              className="p-1.5 text-text-muted hover:text-text-primary transition-colors rounded-md hover:bg-bg-hover"
              title="Save search"
              data-testid="search-save-btn"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="absolute right-2 -bottom-5 text-[10px] text-text-muted hidden sm:block">
        Press <kbd className="px-1 py-0.5 rounded bg-bg-elevated border border-border text-[9px]">/</kbd> to focus
      </div>

      {/* Syntax help tooltip */}
      {showSyntax && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-bg-elevated border border-border rounded-lg p-3 shadow-lg z-50" data-testid="syntax-guide">
          <p className="text-xs font-medium text-text-primary mb-2">Search syntax</p>
          <div className="space-y-1.5">
            {SYNTAX_HINTS.map(h => (
              <div key={h.prefix} className="flex items-center gap-3 text-xs">
                <code className="text-accent font-mono bg-bg-base px-1.5 py-0.5 rounded border border-border-subtle">{h.example}</code>
                <span className="text-text-muted">{h.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save input */}
      {showSaveInput && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-bg-elevated border border-border rounded-lg p-3 shadow-lg z-50 flex gap-2" data-testid="save-search-input">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Name this search…"
            className="flex-1 text-xs bg-bg-base border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-accent"
            autoFocus
          />
          <button onClick={handleSave} className="text-xs bg-accent text-white px-3 py-1.5 rounded-md hover:bg-accent/90">Save</button>
        </div>
      )}

      {/* Dropdown: recent + saved + suggestions */}
      {showDropdown && !showSyntax && !showSaveInput && (recentSearches.length > 0 || savedSearches.length > 0 || suggestions.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto" data-testid="search-dropdown">
          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="p-2 border-b border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider px-2 pb-1">Suggestions</p>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => { onQueryChange(s); setShowDropdown(false) }}
                  className="w-full text-left text-xs text-text-primary px-2 py-1.5 rounded hover:bg-bg-hover transition-colors font-mono"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Recent */}
          {recentSearches.length > 0 && suggestions.length === 0 && (
            <div className="p-2 border-b border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider px-2 pb-1">Recent</p>
              {recentSearches.slice(0, 5).map(r => (
                <button
                  key={r}
                  onClick={() => { onQueryChange(r); handleSubmit(); setShowDropdown(false) }}
                  className="w-full text-left text-xs text-text-primary px-2 py-1.5 rounded hover:bg-bg-hover transition-colors flex items-center gap-2"
                >
                  <Clock className="w-3 h-3 text-text-muted shrink-0" />
                  <span className="truncate">{r}</span>
                </button>
              ))}
            </div>
          )}

          {/* Saved */}
          {savedSearches.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] text-text-muted uppercase tracking-wider px-2 pb-1">Saved</p>
              {savedSearches.map(s => (
                <div key={s.name} className="flex items-center gap-1">
                  <button
                    onClick={() => { onQueryChange(s.query); setShowDropdown(false) }}
                    className="flex-1 text-left text-xs text-text-primary px-2 py-1.5 rounded hover:bg-bg-hover transition-colors flex items-center gap-2"
                  >
                    <Bookmark className="w-3 h-3 text-accent shrink-0" />
                    <span className="truncate">{s.name}</span>
                    <span className="text-text-muted ml-auto text-[10px] shrink-0">{s.query}</span>
                  </button>
                  <button
                    onClick={() => { removeSaved(s.name); setShowDropdown(false) }}
                    className="p-1 text-text-muted hover:text-sev-critical transition-colors"
                    title="Delete saved search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
