/**
 * @module utils/search-helpers
 * @description Shared utilities for SearchPage: highlight matches, detect IOC types,
 * parse bulk IOC input, convert EsSearchResult → IOCRecord, build share URLs.
 */
import type { EsSearchResult } from '@/hooks/use-es-search'
import type { IOCRecord } from '@/hooks/use-intel-data'

// ─── Highlight matched terms ────────────────────────────────

/**
 * Wraps matching substrings in <mark> tags for search result highlighting.
 * Returns array of strings and JSX elements.
 */
export function highlightMatches(text: string, query: string): (string | { key: string; match: string })[] {
  if (!query.trim() || !text) return [text]

  // Strip search syntax prefixes to get raw search terms
  const rawTerms = query
    .replace(/\b(type|severity|tag|actor|campaign|confidence|seen):[^\s]*/gi, '')
    .replace(/"([^"]+)"/g, '$1')
    .trim()
    .split(/\s+/)
    .filter(t => t.length >= 2)

  if (!rawTerms.length) return [text]

  const pattern = rawTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const regex = new RegExp(`(${pattern})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) =>
    regex.test(part) ? { key: `hl-${i}`, match: part } : part
  )
}

// ─── IOC type detection ─────────────────────────────────────

const IOC_PATTERNS: [RegExp, string][] = [
  [/^(?:CVE-\d{4}-\d{4,})$/i, 'cve'],
  [/^[a-f0-9]{64}$/i, 'hash_sha256'],
  [/^[a-f0-9]{40}$/i, 'hash_sha1'],
  [/^[a-f0-9]{32}$/i, 'hash_md5'],
  [/^https?:\/\/.+/i, 'url'],
  [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'email'],
  [/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'ip'],
  [/^[a-f0-9:]+:+[a-f0-9:]+$/i, 'ipv6'],
  [/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/, 'domain'],
]

/** Detect IOC type from a raw string value. Returns null if unrecognized. */
export function detectIocType(value: string): string | null {
  const trimmed = value.trim()
  for (const [re, type] of IOC_PATTERNS) {
    if (re.test(trimmed)) return type
  }
  return null
}

// ─── Bulk IOC parsing ───────────────────────────────────────

export interface ParsedIoc {
  value: string
  type: string | null
}

/**
 * Parse multi-line IOC input: split by newline/comma, trim, deduplicate,
 * auto-detect types.
 */
export function parseIocLines(text: string): ParsedIoc[] {
  const lines = text
    .split(/[\n,]/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const seen = new Set<string>()
  const result: ParsedIoc[] = []

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push({ value: line, type: detectIocType(line) })
  }

  return result
}

// ─── EsSearchResult → IOCRecord adapter ─────────────────────

/** Convert ES search result to IOCRecord shape for reusable IOC components. */
export function toIOCRecord(r: EsSearchResult): IOCRecord {
  return {
    id: r.id,
    iocType: r.iocType,
    normalizedValue: r.value,
    severity: r.severity,
    confidence: r.confidence,
    lifecycle: 'active',
    tlp: r.tlp,
    tags: r.tags,
    threatActors: [],
    malwareFamilies: [],
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    feedReliability: 70,
    corroborationCount: 1,
    aiConfidence: r.confidence,
    campaignId: null,
  }
}

// ─── Share URL builder ──────────────────────────────────────

/** Build a shareable URL from current search state. */
export function buildShareUrl(params: Record<string, string>): string {
  const url = new URL(window.location.origin + '/search')
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v)
  }
  return url.toString()
}

// ─── Export not-found IOCs ──────────────────────────────────

export function exportNotFound(values: string[]) {
  const text = values.join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `not-found-iocs-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}
