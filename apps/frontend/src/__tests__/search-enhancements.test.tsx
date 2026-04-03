/**
 * Tests for SearchStatsBar, SearchResultCard, ViewToggle, BulkSearchModal, search-helpers.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { SearchStatsBar } from '@/components/search/SearchStatsBar'
import { SearchResultCard } from '@/components/search/SearchResultCard'
import { ViewToggle } from '@/components/search/ViewToggle'
import {
  highlightMatches,
  detectIocType,
  parseIocLines,
  toIOCRecord,
} from '@/utils/search-helpers'
import type { EsSearchResult } from '@/hooks/use-es-search'

// ─── Mock shared-ui ─────────────────────────────────────────

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@/components/ioc/ConfidenceGauge', () => ({
  ConfidenceGauge: ({ value }: { value: number }) => <span data-testid="confidence-gauge">{value}%</span>,
}))

// ─── search-helpers unit tests ──────────────────────────────

describe('highlightMatches', () => {
  it('returns original text when query is empty', () => {
    const result = highlightMatches('hello world', '')
    expect(result).toEqual(['hello world'])
  })

  it('splits text on matching terms', () => {
    const result = highlightMatches('cobalt strike C2 domain', 'cobalt')
    expect(result.length).toBeGreaterThan(1)
    expect(result.some(r => typeof r !== 'string' && r.match === 'cobalt')).toBe(true)
  })

  it('ignores search syntax prefixes', () => {
    const result = highlightMatches('critical payload', 'severity:critical payload')
    expect(result.some(r => typeof r !== 'string' && r.match === 'payload')).toBe(true)
  })

  it('handles case-insensitive matching', () => {
    const result = highlightMatches('APT29 activity', 'apt29')
    expect(result.some(r => typeof r !== 'string' && r.match === 'APT29')).toBe(true)
  })
})

describe('detectIocType', () => {
  it('detects IPv4', () => expect(detectIocType('1.2.3.4')).toBe('ip'))
  it('detects domain', () => expect(detectIocType('evil.com')).toBe('domain'))
  it('detects CVE', () => expect(detectIocType('CVE-2024-3400')).toBe('cve'))
  it('detects SHA-256', () => expect(detectIocType('a'.repeat(64))).toBe('hash_sha256'))
  it('detects MD5', () => expect(detectIocType('d41d8cd98f00b204e9800998ecf8427e')).toBe('hash_md5'))
  it('detects URL', () => expect(detectIocType('https://evil.com/payload')).toBe('url'))
  it('detects email', () => expect(detectIocType('attacker@evil.com')).toBe('email'))
  it('returns null for unknown', () => expect(detectIocType('random text')).toBeNull())
})

describe('parseIocLines', () => {
  it('parses multi-line input', () => {
    const result = parseIocLines('1.2.3.4\nevil.com\nCVE-2024-1234')
    expect(result).toHaveLength(3)
    expect(result[0]!.type).toBe('ip')
    expect(result[1]!.type).toBe('domain')
    expect(result[2]!.type).toBe('cve')
  })

  it('deduplicates entries', () => {
    const result = parseIocLines('1.2.3.4\n1.2.3.4\n1.2.3.4')
    expect(result).toHaveLength(1)
  })

  it('handles comma-separated input', () => {
    const result = parseIocLines('1.2.3.4,evil.com')
    expect(result).toHaveLength(2)
  })

  it('trims whitespace', () => {
    const result = parseIocLines('  1.2.3.4  \n  evil.com  ')
    expect(result[0]!.value).toBe('1.2.3.4')
  })

  it('skips empty lines', () => {
    const result = parseIocLines('1.2.3.4\n\n\nevil.com')
    expect(result).toHaveLength(2)
  })
})

describe('toIOCRecord', () => {
  it('converts EsSearchResult to IOCRecord shape', () => {
    const es: EsSearchResult = {
      id: 'test-1', iocType: 'ip', value: '1.2.3.4', severity: 'high',
      confidence: 80, tags: ['c2'], firstSeen: '2024-01-01', lastSeen: '2024-01-02',
      enriched: true, tlp: 'AMBER',
    }
    const record = toIOCRecord(es)
    expect(record.normalizedValue).toBe('1.2.3.4')
    expect(record.iocType).toBe('ip')
    expect(record.severity).toBe('high')
    expect(record.lifecycle).toBe('active')
    expect(record.tags).toEqual(['c2'])
  })
})

// ─── ViewToggle ─────────────────────────────────────────────

describe('ViewToggle', () => {
  it('renders table and card buttons', () => {
    render(<ViewToggle mode="table" onChange={vi.fn()} />)
    expect(screen.getByTestId('view-table')).toBeInTheDocument()
    expect(screen.getByTestId('view-card')).toBeInTheDocument()
  })

  it('calls onChange when card is clicked', () => {
    const onChange = vi.fn()
    render(<ViewToggle mode="table" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('view-card'))
    expect(onChange).toHaveBeenCalledWith('card')
  })

  it('highlights active mode', () => {
    render(<ViewToggle mode="card" onChange={vi.fn()} />)
    expect(screen.getByTestId('view-card').className).toContain('text-accent')
  })
})

// ─── SearchStatsBar ─────────────────────────────────────────

describe('SearchStatsBar', () => {
  const defaultProps = {
    totalCount: 42,
    searchTimeMs: 12,
    page: 1,
    pageSize: 50,
    facets: {
      byType: [{ key: 'ip', count: 20 }, { key: 'domain', count: 22 }],
      bySeverity: [{ key: 'critical', count: 10 }, { key: 'high', count: 15 }],
      byTlp: [],
    },
    isDemo: false,
  }

  it('shows result count', () => {
    render(<SearchStatsBar {...defaultProps} />)
    expect(screen.getByTestId('result-count')).toHaveTextContent('42')
  })

  it('shows search time', () => {
    render(<SearchStatsBar {...defaultProps} />)
    expect(screen.getByTestId('result-count')).toHaveTextContent('12ms')
  })

  it('shows pagination info', () => {
    render(<SearchStatsBar {...defaultProps} />)
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('1–42')
  })

  it('shows "No results" when count is 0', () => {
    render(<SearchStatsBar {...defaultProps} totalCount={0} />)
    expect(screen.getByTestId('result-count')).toHaveTextContent('No results')
  })

  it('shows demo badge when isDemo', () => {
    render(<SearchStatsBar {...defaultProps} isDemo={true} />)
    expect(screen.getByText('demo')).toBeInTheDocument()
  })
})

// ─── SearchResultCard ───────────────────────────────────────

describe('SearchResultCard', () => {
  const result: EsSearchResult = {
    id: 'c-1', iocType: 'ip', value: '185.220.101.34', severity: 'critical',
    confidence: 92, tags: ['tor-exit', 'c2'], firstSeen: new Date(Date.now() - 86400000).toISOString(),
    lastSeen: new Date().toISOString(), enriched: true, tlp: 'RED',
  }

  it('renders card with IOC value', () => {
    render(<SearchResultCard result={result} query="" selected={false}
      onSelect={vi.fn()} onClick={vi.fn()} onContextMenu={vi.fn()} />)
    expect(screen.getByTestId('search-result-card')).toBeInTheDocument()
    expect(screen.getByText('185.220.101.34')).toBeInTheDocument()
  })

  it('shows checkbox', () => {
    render(<SearchResultCard result={result} query="" selected={false}
      onSelect={vi.fn()} onClick={vi.fn()} onContextMenu={vi.fn()} />)
    expect(screen.getByTestId('card-checkbox')).toBeInTheDocument()
  })

  it('shows selected state', () => {
    render(<SearchResultCard result={result} query="" selected={true}
      onSelect={vi.fn()} onClick={vi.fn()} onContextMenu={vi.fn()} />)
    expect(screen.getByTestId('search-result-card').className).toContain('ring-accent')
  })

  it('highlights matching terms', () => {
    render(<SearchResultCard result={result} query="185.220" selected={false}
      onSelect={vi.fn()} onClick={vi.fn()} onContextMenu={vi.fn()} />)
    expect(screen.getByText('185.220')).toBeInTheDocument()
  })

  it('shows severity badge', () => {
    render(<SearchResultCard result={result} query="" selected={false}
      onSelect={vi.fn()} onClick={vi.fn()} onContextMenu={vi.fn()} />)
    expect(screen.getByTestId('severity-badge')).toBeInTheDocument()
  })

  it('shows tags', () => {
    render(<SearchResultCard result={result} query="" selected={false}
      onSelect={vi.fn()} onClick={vi.fn()} onContextMenu={vi.fn()} />)
    expect(screen.getByText('tor-exit')).toBeInTheDocument()
    expect(screen.getByText('c2')).toBeInTheDocument()
  })

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn()
    render(<SearchResultCard result={result} query="" selected={false}
      onSelect={vi.fn()} onClick={onClick} onContextMenu={vi.fn()} />)
    fireEvent.click(screen.getByTestId('search-result-card'))
    expect(onClick).toHaveBeenCalledWith('c-1')
  })
})
