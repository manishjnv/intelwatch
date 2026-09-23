/**
 * S147: normalizeList — every list envelope the backends return renders the same way.
 */
import { describe, it, expect } from 'vitest'
import { normalizeList } from '@/lib/api-list'

describe('normalizeList', () => {
  it('single envelope (api() already unwrapped to an array)', () => {
    expect(normalizeList([{ id: 1 }, { id: 2 }])).toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2, page: 1, limit: 50 })
  })

  it('double envelope (S139 convention) keeps total/page/limit', () => {
    expect(normalizeList({ data: [{ id: 1 }], total: 40, page: 2, limit: 20 })).toEqual({ data: [{ id: 1 }], total: 40, page: 2, limit: 20 })
  })

  it('items envelope (ioc-intelligence style)', () => {
    expect(normalizeList({ items: [{ id: 'a' }], total: 7 })).toEqual({ data: [{ id: 'a' }], total: 7, page: 1, limit: 50 })
  })

  it('missing total falls back to row count', () => {
    expect(normalizeList({ data: [{}, {}, {}] }).total).toBe(3)
  })

  it('null / unexpected shapes become an empty list', () => {
    for (const r of [null, undefined, 'x', 42, {}, { data: { nested: true } }]) {
      expect(normalizeList(r)).toEqual({ data: [], total: 0, page: 1, limit: 50 })
    }
  })
})
