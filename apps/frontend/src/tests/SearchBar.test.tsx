/**
 * Tests for SearchBar component — input, clear, syntax help, saved searches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { SearchBar } from '@/components/search/SearchBar'

// ─── Mocks ──────────────────────────────────────────────────

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => null),
}))

const defaultProps = {
  query: '',
  onQueryChange: vi.fn(),
  onSearch: vi.fn(),
  isLoading: false,
}

// ─── Tests ──────────────────────────────────────────────────

describe('SearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders input with placeholder', () => {
    render(<SearchBar {...defaultProps} />)
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search IOCs/)).toBeInTheDocument()
  })

  it('calls onQueryChange when typing', () => {
    render(<SearchBar {...defaultProps} />)
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'malware' } })
    expect(defaultProps.onQueryChange).toHaveBeenCalledWith('malware')
  })

  it('Enter key triggers onSearch', () => {
    render(<SearchBar {...defaultProps} query="test" />)
    fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' })
    expect(defaultProps.onSearch).toHaveBeenCalled()
  })

  it('clear button resets query', () => {
    render(<SearchBar {...defaultProps} query="test" />)
    const clearBtn = screen.getByTestId('search-clear')
    fireEvent.click(clearBtn)
    expect(defaultProps.onQueryChange).toHaveBeenCalledWith('')
  })

  it('shows loading spinner when isLoading', () => {
    render(<SearchBar {...defaultProps} isLoading={true} />)
    expect(screen.getByTestId('search-loading')).toBeInTheDocument()
  })

  it('does not show clear button when query is empty', () => {
    render(<SearchBar {...defaultProps} query="" />)
    expect(screen.queryByTestId('search-clear')).not.toBeInTheDocument()
  })

  it('shows syntax guide on help click', () => {
    render(<SearchBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('search-syntax-help'))
    expect(screen.getByTestId('syntax-guide')).toBeInTheDocument()
    expect(screen.getByText('Search syntax')).toBeInTheDocument()
  })

  it('shows type hints when typing "type:"', () => {
    render(<SearchBar {...defaultProps} query="type:" />)
    fireEvent.focus(screen.getByTestId('search-input'))
    expect(screen.getByTestId('search-dropdown')).toBeInTheDocument()
  })

  it('does not show save button (saved search removed)', () => {
    render(<SearchBar {...defaultProps} query="test query" />)
    expect(screen.queryByTestId('search-save-btn')).not.toBeInTheDocument()
  })
})
