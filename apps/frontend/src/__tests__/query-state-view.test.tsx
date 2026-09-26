/**
 * @module __tests__/query-state-view.test
 * @description Tests for the shared QueryStateView honest-UI pattern.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { QueryStateView, type QueryLike } from '@/components/ui/QueryStateView'
import { ApiError } from '@/lib/api'

function makeQuery<T>(overrides: Partial<QueryLike<T>>): QueryLike<T> {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('QueryStateView', () => {
  it('renders the loading skeleton', () => {
    render(
      <QueryStateView query={makeQuery<string[]>({ isLoading: true })} resource="widgets">
        {() => <div>data</div>}
      </QueryStateView>
    )
    expect(screen.getByTestId('query-loading')).toBeInTheDocument()
  })

  it('shows an error card with the resource name and Server error. for a 500', () => {
    const query = makeQuery<string[]>({ isError: true, error: new ApiError(500, 'ERR', 'boom') })
    render(
      <QueryStateView query={query} resource="active sessions">
        {() => <div>data</div>}
      </QueryStateView>
    )
    const card = screen.getByTestId('query-error')
    expect(card).toHaveAttribute('role', 'alert')
    expect(card).toHaveTextContent("Couldn't load active sessions")
    expect(card).toHaveTextContent('Server error.')
  })

  it('shows Access denied. for a 403', () => {
    const query = makeQuery<string[]>({ isError: true, error: new ApiError(403, 'ERR', 'no') })
    render(
      <QueryStateView query={query} resource="widgets">
        {() => <div>data</div>}
      </QueryStateView>
    )
    expect(screen.getByTestId('query-error')).toHaveTextContent('Access denied.')
  })

  it('shows Not available yet. for a 404', () => {
    const query = makeQuery<string[]>({ isError: true, error: new ApiError(404, 'ERR', 'no') })
    render(
      <QueryStateView query={query} resource="widgets">
        {() => <div>data</div>}
      </QueryStateView>
    )
    expect(screen.getByTestId('query-error')).toHaveTextContent('Not available yet.')
  })

  it('calls refetch exactly once when Retry is clicked', () => {
    const refetch = vi.fn()
    const query = makeQuery<string[]>({ isError: true, error: new ApiError(500, 'ERR', 'boom'), refetch })
    render(
      <QueryStateView query={query} resource="widgets">
        {() => <div>data</div>}
      </QueryStateView>
    )
    fireEvent.click(screen.getByTestId('query-retry'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the empty node when isEmpty(data) is true', () => {
    const query = makeQuery<string[]>({ data: [] })
    render(
      <QueryStateView query={query} resource="widgets" isEmpty={d => d.length === 0}>
        {() => <div>data</div>}
      </QueryStateView>
    )
    expect(screen.getByTestId('query-empty')).toHaveTextContent('Nothing here yet.')
  })

  it('renders children with the data when present and not empty', () => {
    const query = makeQuery<string[]>({ data: ['a', 'b'] })
    render(
      <QueryStateView query={query} resource="widgets" isEmpty={d => d.length === 0}>
        {data => <div data-testid="content">{data.join(',')}</div>}
      </QueryStateView>
    )
    expect(screen.getByTestId('content')).toHaveTextContent('a,b')
  })
})
