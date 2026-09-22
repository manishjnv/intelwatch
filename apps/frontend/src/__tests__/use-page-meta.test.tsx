/**
 * Tests for usePageMeta / public route table (SEO plan 2.1).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { applyPageMeta, usePageMeta } from '@/hooks/use-page-meta'
import { HOME_META, PUBLIC_ROUTES, canonicalUrl, findRouteMeta, normalizePath } from '@/seo/public-routes'

const meta = (sel: string) => document.head.querySelector(sel)?.getAttribute('content')
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')

describe('public-routes', () => {
  it('normalizes trailing slashes but keeps root', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('/pricing/')).toBe('/pricing')
    expect(normalizePath('')).toBe('/')
  })

  it('builds canonical URLs on the apex https host', () => {
    expect(canonicalUrl('/')).toBe('https://intelwatch.in/')
    expect(canonicalUrl('/pricing')).toBe('https://intelwatch.in/pricing')
  })

  it('lists only unique, lowercase, indexable paths', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of paths) expect(p).toMatch(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/)
    for (const privatePrefix of ['/login', '/register', '/dashboard', '/auth', '/command-center']) {
      expect(paths.some((p) => p.startsWith(privatePrefix))).toBe(false)
    }
  })

  it('keeps descriptions within search-snippet length', () => {
    for (const r of PUBLIC_ROUTES) {
      expect(r.title.length).toBeLessThanOrEqual(70)
      expect(r.description.length).toBeGreaterThanOrEqual(50)
      expect(r.description.length).toBeLessThanOrEqual(170)
    }
  })

  it('finds home meta for "/"', () => {
    expect(findRouteMeta('/')).toBe(HOME_META)
    expect(findRouteMeta('/dashboard')).toBeUndefined()
  })
})

describe('applyPageMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.title = ''
  })

  it('creates missing tags and sets title, description, canonical, OG and twitter', () => {
    applyPageMeta({ path: '/pricing', title: 'Pricing', description: 'Plans' }, '/pricing')
    expect(document.title).toBe('Pricing')
    expect(meta('meta[name="description"]')).toBe('Plans')
    expect(canonical()).toBe('https://intelwatch.in/pricing')
    expect(meta('meta[property="og:title"]')).toBe('Pricing')
    expect(meta('meta[property="og:url"]')).toBe('https://intelwatch.in/pricing')
    expect(meta('meta[name="twitter:description"]')).toBe('Plans')
  })

  it('updates existing tags in place without duplicating them', () => {
    applyPageMeta({ path: '/a', title: 'A', description: 'a' }, '/a')
    applyPageMeta({ path: '/b', title: 'B', description: 'b', socialTitle: 'SB' }, '/b')
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(meta('meta[property="og:title"]')).toBe('SB')
    expect(canonical()).toBe('https://intelwatch.in/b')
  })
})

describe('usePageMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('applies route meta for public routes and site defaults for app routes', () => {
    const { rerender } = renderHook(({ path }) => usePageMeta(path), { initialProps: { path: '/' } })
    expect(document.title).toBe(HOME_META.title)
    expect(canonical()).toBe('https://intelwatch.in/')

    rerender({ path: '/dashboard' })
    expect(document.title).toBe(HOME_META.title)
    expect(canonical()).toBe('https://intelwatch.in/dashboard')
  })
})
