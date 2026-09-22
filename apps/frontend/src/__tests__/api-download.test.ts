/**
 * apiDownload — authenticated file download (S147: API routes require Authorization at nginx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiDownload, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

const blobRes = (status: number, headers: Record<string, string> = {}) =>
  new Response(status === 200 ? 'data' : null, { status, headers })

describe('apiDownload', () => {
  let clicked: { href: string; download: string }[]

  beforeEach(() => {
    clicked = []
    useAuthStore.setState({
      accessToken: 'tok-1',
      refreshToken: 'ref-1',
      user: { id: 'u1', email: 'a@b.c', displayName: 'A', role: 'tenant_admin', tenantId: 't1', avatarUrl: null },
      isAuthenticated: true,
    })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends the bearer token and tenant, and saves with the server filename', async () => {
    const fetchMock = vi.fn(async () => blobRes(200, { 'content-disposition': 'attachment; filename="weekly.pdf"' }))
    vi.stubGlobal('fetch', fetchMock)

    await apiDownload('/reports/r1/download', 'report-r1')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/reports/r1/download')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1')
    expect((init.headers as Record<string, string>)['x-tenant-id']).toBe('t1')
    expect(clicked).toEqual([{ href: 'blob:x', download: 'weekly.pdf' }])
  })

  it('falls back to the given name when there is no Content-Disposition', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => blobRes(200)))
    await apiDownload('/x', 'fallback.json')
    expect(clicked[0]?.download).toBe('fallback.json')
  })

  it('refreshes the token once on 401 and retries with the new token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(blobRes(401))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { accessToken: 'tok-2', refreshToken: 'ref-2' } }), { status: 200 }))
      .mockResolvedValueOnce(blobRes(200))
    vi.stubGlobal('fetch', fetchMock)

    await apiDownload('/x', 'f')

    const last = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit]
    expect(last[0]).toBe('/api/v1/x')
    expect((last[1].headers as Record<string, string>)['Authorization']).toBe('Bearer tok-2')
    expect(clicked).toHaveLength(1)
  })

  it('throws ApiError and saves nothing on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => blobRes(403)))
    await expect(apiDownload('/x', 'f')).rejects.toBeInstanceOf(ApiError)
    expect(clicked).toHaveLength(0)
  })
})
