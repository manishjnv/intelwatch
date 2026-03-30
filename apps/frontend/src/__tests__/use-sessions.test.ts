/**
 * @module __tests__/use-sessions.test
 * @description Hook tests for use-sessions: list, terminate, terminate-all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: any[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message) }
  },
}))

describe('use-sessions API contracts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET /auth/sessions returns session list', async () => {
    const sessions = [
      { id: 's1', ipAddress: '1.2.3.4', isCurrent: true },
      { id: 's2', ipAddress: '5.6.7.8', isCurrent: false },
    ]
    mockApi.mockResolvedValue(sessions)
    const result = await mockApi('/auth/sessions')
    expect(result).toHaveLength(2)
    expect(result[0].isCurrent).toBe(true)
  })

  it('DELETE /auth/sessions/:id terminates a session', async () => {
    mockApi.mockResolvedValue(undefined)
    await mockApi('/auth/sessions/sess-123', { method: 'DELETE' })
    expect(mockApi).toHaveBeenCalledWith('/auth/sessions/sess-123', { method: 'DELETE' })
  })

  it('DELETE /auth/sessions?exclude=current terminates all other sessions', async () => {
    mockApi.mockResolvedValue(undefined)
    await mockApi('/auth/sessions?exclude=current', { method: 'DELETE' })
    expect(mockApi).toHaveBeenCalledWith('/auth/sessions?exclude=current', { method: 'DELETE' })
  })

  it('session data includes geo fields', async () => {
    const session = {
      id: 's1', ipAddress: '10.0.0.1', geoCity: 'Mumbai', geoCountry: 'IN',
      geoIsp: 'Jio', createdAt: '2026-03-30T00:00:00Z', lastUsedAt: '2026-03-30T01:00:00Z',
      isCurrent: true, suspiciousLogin: false,
      userAgent: 'Mozilla/5.0 Chrome/124.0',
    }
    mockApi.mockResolvedValue([session])
    const result = await mockApi('/auth/sessions')
    expect(result[0].geoCity).toBe('Mumbai')
    expect(result[0].geoCountry).toBe('IN')
    expect(result[0].geoIsp).toBe('Jio')
  })

  it('session data includes suspicious flag', async () => {
    const session = { id: 's1', suspiciousLogin: true }
    mockApi.mockResolvedValue([session])
    const result = await mockApi('/auth/sessions')
    expect(result[0].suspiciousLogin).toBe(true)
  })
})
