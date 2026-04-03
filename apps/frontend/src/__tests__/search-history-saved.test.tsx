/**
 * Tests for SearchHistoryPanel and SavedSearches components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import {
  SearchHistoryPanel,
  addSearchHistory,
  getSearchHistory,
} from '@/components/search/SearchHistoryPanel'
import { SavedSearches } from '@/components/search/SavedSearches'

// Mock toast
vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
}))

// ─── SearchHistoryPanel ─────────────────────────────────────

describe('SearchHistoryPanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not render when closed', () => {
    render(<SearchHistoryPanel open={false} onClose={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('search-history-panel')).not.toBeInTheDocument()
  })

  it('does not render when no history', () => {
    render(<SearchHistoryPanel open={true} onClose={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('search-history-panel')).not.toBeInTheDocument()
  })

  it('renders history entries', () => {
    addSearchHistory('test query 1')
    addSearchHistory('test query 2')
    render(<SearchHistoryPanel open={true} onClose={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByTestId('search-history-panel')).toBeInTheDocument()
    expect(screen.getAllByTestId('history-entry')).toHaveLength(2)
  })

  it('calls onSelect when entry is clicked', () => {
    addSearchHistory('my search')
    const onSelect = vi.fn()
    render(<SearchHistoryPanel open={true} onClose={vi.fn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('history-entry'))
    expect(onSelect).toHaveBeenCalledWith('my search')
  })

  it('clears history on button click', () => {
    addSearchHistory('search to clear')
    render(<SearchHistoryPanel open={true} onClose={vi.fn()} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByTestId('clear-history'))
    expect(getSearchHistory()).toHaveLength(0)
  })
})

describe('addSearchHistory', () => {
  beforeEach(() => localStorage.clear())

  it('adds entry to history', () => {
    addSearchHistory('test')
    expect(getSearchHistory()).toHaveLength(1)
    expect(getSearchHistory()[0]!.query).toBe('test')
  })

  it('deduplicates entries', () => {
    addSearchHistory('test')
    addSearchHistory('test')
    expect(getSearchHistory()).toHaveLength(1)
  })

  it('moves duplicate to top', () => {
    addSearchHistory('first')
    addSearchHistory('second')
    addSearchHistory('first')
    expect(getSearchHistory()[0]!.query).toBe('first')
    expect(getSearchHistory()).toHaveLength(2)
  })

  it('caps at 20 entries', () => {
    for (let i = 0; i < 25; i++) addSearchHistory(`query-${i}`)
    expect(getSearchHistory()).toHaveLength(20)
  })

  it('ignores empty strings', () => {
    addSearchHistory('')
    addSearchHistory('  ')
    expect(getSearchHistory()).toHaveLength(0)
  })
})

// ─── SavedSearches ──────────────────────────────────────────

describe('SavedSearches', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    currentQuery: 'test',
    currentFilters: {},
    currentSortBy: 'relevance',
  }

  it('does not render when closed', () => {
    render(<SavedSearches {...defaultProps} open={false} />)
    expect(screen.queryByTestId('saved-searches-panel')).not.toBeInTheDocument()
  })

  it('renders panel with default presets', () => {
    render(<SavedSearches {...defaultProps} />)
    expect(screen.getByTestId('saved-searches-panel')).toBeInTheDocument()
    expect(screen.getAllByTestId('saved-search-entry').length).toBeGreaterThanOrEqual(3)
  })

  it('shows save form on toggle', () => {
    render(<SavedSearches {...defaultProps} />)
    fireEvent.click(screen.getByTestId('save-search-toggle'))
    expect(screen.getByTestId('save-search-form')).toBeInTheDocument()
  })

  it('saves new search', () => {
    render(<SavedSearches {...defaultProps} />)
    fireEvent.click(screen.getByTestId('save-search-toggle'))
    const input = screen.getByTestId('save-search-input')
    fireEvent.change(input, { target: { value: 'My custom search' } })
    fireEvent.click(screen.getByTestId('save-search-submit'))
    expect(screen.getByText('My custom search')).toBeInTheDocument()
  })

  it('calls onSelect when clicking a saved search', () => {
    const onSelect = vi.fn()
    render(<SavedSearches {...defaultProps} onSelect={onSelect} />)
    const entries = screen.getAllByTestId('saved-search-entry')
    fireEvent.click(entries[0]!.querySelector('button')!)
    expect(onSelect).toHaveBeenCalled()
  })

  it('deletes non-default saved search', () => {
    render(<SavedSearches {...defaultProps} />)
    // Save a custom search first
    fireEvent.click(screen.getByTestId('save-search-toggle'))
    fireEvent.change(screen.getByTestId('save-search-input'), { target: { value: 'To delete' } })
    fireEvent.click(screen.getByTestId('save-search-submit'))
    // Now hover to find delete button
    const deleteBtn = screen.getAllByTestId('delete-saved')
    expect(deleteBtn.length).toBeGreaterThan(0)
    fireEvent.click(deleteBtn[0]!)
    expect(screen.queryByText('To delete')).not.toBeInTheDocument()
  })
})
