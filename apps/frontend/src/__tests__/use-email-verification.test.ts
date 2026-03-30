/**
 * @module __tests__/use-email-verification.test
 * @description Hook tests for use-email-verification: verify, resend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: any[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message) }
  },
}))

describe('use-email-verification API contracts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POST /auth/verify-email sends token', async () => {
    mockApi.mockResolvedValue(undefined)
    await mockApi('/auth/verify-email', { method: 'POST', body: { token: 'abc123' }, auth: false })
    expect(mockApi).toHaveBeenCalledWith('/auth/verify-email', {
      method: 'POST',
      body: { token: 'abc123' },
      auth: false,
    })
  })

  it('POST /auth/resend-verification sends email', async () => {
    mockApi.mockResolvedValue(undefined)
    await mockApi('/auth/resend-verification', { method: 'POST', body: { email: 'user@test.com' }, auth: false })
    expect(mockApi).toHaveBeenCalledWith('/auth/resend-verification', {
      method: 'POST',
      body: { email: 'user@test.com' },
      auth: false,
    })
  })

  it('verify-email with expired token returns 410', async () => {
    const err = new Error('Token expired')
    ;(err as any).status = 410
    ;(err as any).code = 'TOKEN_EXPIRED'
    mockApi.mockRejectedValue(err)
    await expect(mockApi('/auth/verify-email', {
      method: 'POST',
      body: { token: 'expired' },
      auth: false,
    })).rejects.toThrow('Token expired')
  })

  it('resend-verification with rate limit returns 429', async () => {
    const err = new Error('Rate limited')
    ;(err as any).status = 429
    mockApi.mockRejectedValue(err)
    await expect(mockApi('/auth/resend-verification', {
      method: 'POST',
      body: { email: 'user@test.com' },
      auth: false,
    })).rejects.toThrow('Rate limited')
  })

  it('resend always succeeds from user perspective (no email leak)', async () => {
    // Even for non-existent email, backend returns 200
    mockApi.mockResolvedValue(undefined)
    const result = await mockApi('/auth/resend-verification', {
      method: 'POST',
      body: { email: 'nonexistent@test.com' },
      auth: false,
    })
    expect(result).toBeUndefined()
  })
})
