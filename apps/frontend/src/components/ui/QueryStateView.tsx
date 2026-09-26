/**
 * @module components/ui/QueryStateView
 * @description Shared honest-UI pattern for a react-query result: loading skeleton,
 * error card with Retry, empty state, or the data. Never invents data on failure.
 */
import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { classifyError } from '@/hooks/useApiError'

export interface QueryLike<T> {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

interface QueryStateViewProps<T> {
  query: QueryLike<T>
  /** e.g. "active sessions" — used in "Couldn't load {resource}" */
  resource: string
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}

const DEFAULT_SKELETON = (
  <div className="space-y-2" data-testid="query-loading">
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="h-10 rounded-lg bg-bg-elevated animate-pulse" />
    ))}
  </div>
)

export function QueryStateView<T>({
  query, resource, isEmpty, empty, skeleton, children,
}: QueryStateViewProps<T>) {
  if (query.isLoading) {
    return <>{skeleton ?? DEFAULT_SKELETON}</>
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="w-full min-w-0 border border-border rounded-xl p-5 bg-bg-primary"
        data-testid="query-error"
      >
        <div className="flex items-start flex-wrap gap-3">
          <AlertTriangle className="w-4 h-4 text-sev-high shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary break-words">
              Couldn&apos;t load {resource}
            </p>
            <p className="text-xs text-text-muted mt-0.5 break-words">
              {classifyError(query.error)}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-9 text-xs font-medium border border-border text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
            data-testid="query-retry"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (query.data !== undefined) {
    if (isEmpty?.(query.data)) {
      return <>{empty ?? <div data-testid="query-empty" className="text-xs text-text-muted">Nothing here yet.</div>}</>
    }
    return <>{children(query.data)}</>
  }

  return null
}
