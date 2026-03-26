/**
 * @module hooks/useApiError
 * @description Error notification for API failures.
 * Shows toast, logs to console.warn, returns fallback data.
 * Distinguishes network errors vs 401 vs 500.
 * Debounces: max 1 toast per resource per 10 seconds.
 */
import { toast } from '@/components/ui/Toast'
import { ApiError } from '@/lib/api'

// ─── Debounce: prevent toast spam on retries ─────────────────
const lastNotified = new Map<string, number>()
const DEBOUNCE_MS = 10_000

function classifyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Session expired'
    if (err.status === 403) return 'Access denied'
    if (err.status >= 500) return 'Server error'
    return err.message
  }
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return 'Network error'
  }
  return 'Unexpected error'
}

/**
 * Show toast + console.warn for API failures.
 * Returns `fallback` so it can be chained in .catch():
 *   .catch(err => notifyApiError(err, 'feeds', empty))
 */
export function notifyApiError<T>(err: unknown, resource: string, fallback: T): T {
  const now = Date.now()
  const last = lastNotified.get(resource) ?? 0
  if (now - last > DEBOUNCE_MS) {
    lastNotified.set(resource, now)
    const detail = classifyError(err)
    toast(`Failed to load ${resource}. ${detail}`, 'error')
  }
  console.warn(`[API] ${resource}:`, err)
  return fallback
}

/** Reset debounce state (for testing) */
export function _resetNotifyState() {
  lastNotified.clear()
}
