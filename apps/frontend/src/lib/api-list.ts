/**
 * @module lib/api-list
 * @description List endpoints return different envelopes depending on the service:
 *   { data: T[], total, page, limit }          → api() unwraps to T[] (total lost)
 *   { data: { data: T[], total, page, limit } } → api() unwraps to { data, total, ... } (S139 convention)
 *   { data: { items: T[], total } }             → api() unwraps to { items, total }
 * List hooks typed the result as ListResponse and read `.data`, so single-envelope services
 * silently rendered empty ("No vulnerabilities found") or fell back to demo data (S147).
 * apiList() normalises every shape. It is built on api() so auth, refresh, 429 handling and
 * existing test mocks of '@/lib/api' keep working.
 */
import { api } from './api'

export interface ListEnvelope<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

/** Project default page size (CLAUDE.md: default page limit 50). */
const DEFAULT_LIMIT = 50

export function normalizeList<T>(r: unknown): ListEnvelope<T> {
  if (Array.isArray(r)) return { data: r as T[], total: r.length, page: 1, limit: DEFAULT_LIMIT }
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>
    const rows = Array.isArray(o['data']) ? o['data'] : Array.isArray(o['items']) ? o['items'] : null
    if (rows) {
      return {
        data: rows as T[],
        total: typeof o['total'] === 'number' ? o['total'] : rows.length,
        page: typeof o['page'] === 'number' ? o['page'] : 1,
        limit: typeof o['limit'] === 'number' ? o['limit'] : DEFAULT_LIMIT,
      }
    }
  }
  return { data: [], total: 0, page: 1, limit: DEFAULT_LIMIT }
}

/** GET a list endpoint and return { data, total, page, limit } whatever the envelope. */
export async function apiList<T>(path: string): Promise<ListEnvelope<T>> {
  return normalizeList<T>(await api<unknown>(path))
}
