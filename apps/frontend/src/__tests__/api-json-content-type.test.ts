/**
 * api() must only send Content-Type: application/json when there is a body.
 * Fastify rejects an empty body declared as JSON (FST_ERR_CTP_EMPTY_JSON_BODY), which broke
 * bodyless POST/DELETE calls such as "Test connection" (POST /integrations/:id/test).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

const jsonRes = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('api() Content-Type header', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok-1',
      refreshToken: 'ref-1',
      user: { id: 'u1', email: 'a@b.c', displayName: 'A', role: 'tenant_admin', tenantId: 't1', avatarUrl: null },
      isAuthenticated: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('omits Content-Type on a bodyless POST', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    await api('/integrations/i1/test', { method: 'POST' })

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('omits Content-Type on a bodyless DELETE', async () => {
    const fetchMock = vi.fn(async () => jsonRes(null))
    vi.stubGlobal('fetch', fetchMock)

    await api('/users/api-keys/k1', { method: 'DELETE' })

    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('sends Content-Type: application/json when a body is present', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ id: 'x' }))
    vi.stubGlobal('fetch', fetchMock)

    await api('/integrations', { method: 'POST', body: { name: 'n' } })

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ name: 'n' }))
  })

  // 16 hooks pass body: JSON.stringify(x); re-stringifying sent a JSON *string* and every
  // backend Zod object schema rejected it (reporting, admin tenant/plan, onboarding writes).
  it('sends an already-serialized string body as-is, not double-encoded', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ id: 'r1' }))
    vi.stubGlobal('fetch', fetchMock)

    await api('/reports', { method: 'POST', body: JSON.stringify({ title: 't' }) })

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.body).toBe('{"title":"t"}')
    expect(JSON.parse(init.body as string)).toEqual({ title: 't' })
  })
})
