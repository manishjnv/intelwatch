/**
 * Prerender → hydrate round trip (SEO plan 2.1). Guards against hydration mismatches that
 * would make React discard the prerendered markup (and flash) on every public page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { act } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from '@/App'
import { render as prerender } from '@/entry-server'
import { PUBLIC_ROUTES } from '@/seo/public-routes'
import { decodeStyleBlocks } from '../../scripts/prerender-lib.mjs'
import { renderToPipeableStream } from 'react-dom/server'
import { Writable } from 'node:stream'

/**
 * Test-realm only: after a server render that suspended (lazy routes), React 18's streaming
 * server renderer leaves the last context values on shared context objects until its next
 * render switches back to the root. The client renderer in this same JS realm then reads a
 * stale Router context ("You cannot render a <Router> inside another <Router>"). Browsers
 * never run the server renderer, and prerender.mjs only chains server renders (verified
 * fine), so a trivial server render here restores the defaults before hydrating.
 */
function resetServerContext(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sink = new Writable({ write(_c, _e, cb) { cb() }, final(cb) { resolve(); cb() } })
    const { pipe } = renderToPipeableStream(<></>, { onAllReady() { pipe(sink) }, onShellError: reject })
  })
}

async function serverRender(path: string): Promise<string> {
  const html = await prerender(path)
  await resetServerContext()
  return html
}

async function hydrate(path: string, markup: string) {
  const container = document.createElement('div')
  container.id = 'root'
  // innerHTML runs the HTML parser, like a browser loading the static file
  container.innerHTML = markup
  document.body.appendChild(container)

  const recoverable: unknown[] = []
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root: Root | undefined
  await act(async () => {
    root = hydrateRoot(
      container,
      <React.StrictMode>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </QueryClientProvider>
      </React.StrictMode>,
      { onRecoverableError: (e) => recoverable.push(e) },
    )
  })
  const errors = consoleError.mock.calls.map((c) => String(c[0]))
  consoleError.mockRestore()
  return { container, recoverable, errors, unmount: () => act(() => root?.unmount()) }
}

describe('prerender hydration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const route of PUBLIC_ROUTES) {
    it(`hydrates ${route.path} without mismatches`, async () => {
      const markup = decodeStyleBlocks(await serverRender(route.path))
      expect(markup.length).toBeGreaterThan(0)

      const { container, recoverable, errors, unmount } = await hydrate(route.path, markup)
      expect(recoverable).toEqual([])
      expect(errors.filter((e) => /hydrat|did not match/i.test(e))).toEqual([])
      expect(container.querySelector('h1')).not.toBeNull()
      await unmount()
    })
  }

  it('prerendered home contains the crawlable landing content', async () => {
    const markup = decodeStyleBlocks(await serverRender('/'))
    expect(markup).toContain('<h1 class="lp-title">IntelWatch</h1>')
    expect(markup).toContain('Infrastructure Online')
    expect(markup).toContain("font-family: 'SF Pro Display'")
  })

  it('detects the mismatch when <style> entities are left encoded (guards decodeStyleBlocks)', async () => {
    const raw = await serverRender('/')
    expect(raw).toContain('&#x27;SF Pro Display&#x27;')
    const { recoverable, errors, unmount } = await hydrate('/', raw)
    const mismatches = recoverable.length + errors.filter((e) => /hydrat|did not match/i.test(e)).length
    expect(mismatches).toBeGreaterThan(0)
    await unmount()
  })
})
