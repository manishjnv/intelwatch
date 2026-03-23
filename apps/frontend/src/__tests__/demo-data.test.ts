/**
 * Tests for demo data shape, completeness, and realism.
 * These are pure unit tests — no DOM, no hooks, no rendering.
 */
import { describe, it, expect } from 'vitest'
import {
  DEMO_IOC_RECORDS,
  DEMO_IOC_STATS,
  DEMO_IOCS_RESPONSE,
  DEMO_DASHBOARD_STATS,
  DEMO_FEEDS_RESPONSE,
} from '@/hooks/demo-data'

/* ================================================================ */
/* Record count & uniqueness                                         */
/* ================================================================ */
describe('DEMO_IOC_RECORDS', () => {
  it('contains exactly 25 records', () => {
    expect(DEMO_IOC_RECORDS).toHaveLength(25)
  })

  it('all IDs are unique', () => {
    const ids = DEMO_IOC_RECORDS.map(r => r.id)
    expect(new Set(ids).size).toBe(25)
  })

  it('all IDs follow demo-N pattern', () => {
    for (const r of DEMO_IOC_RECORDS) {
      expect(r.id).toMatch(/^demo-\d+$/)
    }
  })

  /* ────────────────────────────────────────────────────────────── */
  /* Type distribution                                              */
  /* ────────────────────────────────────────────────────────────── */
  it('has 5 IP records', () => {
    expect(DEMO_IOC_RECORDS.filter(r => r.iocType === 'ip')).toHaveLength(5)
  })

  it('has 5 domain records', () => {
    expect(DEMO_IOC_RECORDS.filter(r => r.iocType === 'domain')).toHaveLength(5)
  })

  it('has 3 URL records', () => {
    expect(DEMO_IOC_RECORDS.filter(r => r.iocType === 'url')).toHaveLength(3)
  })

  it('has 5 hash_sha256 records', () => {
    expect(DEMO_IOC_RECORDS.filter(r => r.iocType === 'hash_sha256')).toHaveLength(5)
  })

  it('has 4 CVE records', () => {
    expect(DEMO_IOC_RECORDS.filter(r => r.iocType === 'cve')).toHaveLength(4)
  })

  it('has 3 email records', () => {
    expect(DEMO_IOC_RECORDS.filter(r => r.iocType === 'email')).toHaveLength(3)
  })

  /* ────────────────────────────────────────────────────────────── */
  /* Severity distribution                                          */
  /* ────────────────────────────────────────────────────────────── */
  it('all 5 severity levels are present', () => {
    const sevs = new Set(DEMO_IOC_RECORDS.map(r => r.severity))
    expect(sevs).toEqual(new Set(['critical', 'high', 'medium', 'low', 'info']))
  })

  it('has at least 3 critical records for heatmap visibility', () => {
    expect(DEMO_IOC_RECORDS.filter(r => r.severity === 'critical').length).toBeGreaterThanOrEqual(3)
  })

  /* ────────────────────────────────────────────────────────────── */
  /* Lifecycle distribution                                         */
  /* ────────────────────────────────────────────────────────────── */
  it('has new, active, and aging lifecycle states', () => {
    const states = new Set(DEMO_IOC_RECORDS.map(r => r.lifecycle))
    expect(states).toContain('new')
    expect(states).toContain('active')
    expect(states).toContain('aging')
  })

  /* ────────────────────────────────────────────────────────────── */
  /* Relationship data for FlipCard + RelationshipGraph              */
  /* ────────────────────────────────────────────────────────────── */
  it('at least 8 records have threatActors for graph rendering', () => {
    const withActors = DEMO_IOC_RECORDS.filter(r => r.threatActors.length > 0)
    expect(withActors.length).toBeGreaterThanOrEqual(8)
  })

  it('at least 7 records have malwareFamilies for graph rendering', () => {
    const withMalware = DEMO_IOC_RECORDS.filter(r => r.malwareFamilies.length > 0)
    expect(withMalware.length).toBeGreaterThanOrEqual(7)
  })

  it('every record has at least 1 tag', () => {
    for (const r of DEMO_IOC_RECORDS) {
      expect(r.tags.length).toBeGreaterThanOrEqual(1)
    }
  })

  /* ────────────────────────────────────────────────────────────── */
  /* Field completeness — every IOCRecord field is populated         */
  /* ────────────────────────────────────────────────────────────── */
  it('every record has all required IOCRecord fields', () => {
    const requiredKeys = [
      'id', 'iocType', 'normalizedValue', 'severity', 'confidence',
      'lifecycle', 'tlp', 'tags', 'threatActors', 'malwareFamilies',
      'firstSeen', 'lastSeen',
    ]
    for (const r of DEMO_IOC_RECORDS) {
      for (const key of requiredKeys) {
        expect(r).toHaveProperty(key)
      }
    }
  })

  it('all timestamps are valid ISO strings', () => {
    for (const r of DEMO_IOC_RECORDS) {
      expect(new Date(r.firstSeen).toISOString()).toBe(r.firstSeen)
      expect(new Date(r.lastSeen).toISOString()).toBe(r.lastSeen)
    }
  })

  it('firstSeen is always before or equal to lastSeen', () => {
    for (const r of DEMO_IOC_RECORDS) {
      expect(new Date(r.firstSeen).getTime()).toBeLessThanOrEqual(
        new Date(r.lastSeen).getTime(),
      )
    }
  })

  /* ────────────────────────────────────────────────────────────── */
  /* Value realism                                                   */
  /* ────────────────────────────────────────────────────────────── */
  it('IP values contain dots', () => {
    for (const r of DEMO_IOC_RECORDS.filter(r => r.iocType === 'ip')) {
      expect(r.normalizedValue).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    }
  })

  it('domain values contain dots', () => {
    for (const r of DEMO_IOC_RECORDS.filter(r => r.iocType === 'domain')) {
      expect(r.normalizedValue).toContain('.')
    }
  })

  it('hash_sha256 values are 64 hex chars', () => {
    for (const r of DEMO_IOC_RECORDS.filter(r => r.iocType === 'hash_sha256')) {
      expect(r.normalizedValue).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('CVE values match CVE-YYYY-NNNNN pattern', () => {
    for (const r of DEMO_IOC_RECORDS.filter(r => r.iocType === 'cve')) {
      expect(r.normalizedValue).toMatch(/^CVE-\d{4}-\d+$/)
    }
  })

  it('email values contain @', () => {
    for (const r of DEMO_IOC_RECORDS.filter(r => r.iocType === 'email')) {
      expect(r.normalizedValue).toContain('@')
    }
  })

  it('URL values start with http', () => {
    for (const r of DEMO_IOC_RECORDS.filter(r => r.iocType === 'url')) {
      expect(r.normalizedValue).toMatch(/^https?:\/\//)
    }
  })

  it('confidence values are between 0 and 100', () => {
    for (const r of DEMO_IOC_RECORDS) {
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(100)
    }
  })

  it('TLP values are valid', () => {
    const validTlp = new Set(['red', 'amber', 'green', 'white'])
    for (const r of DEMO_IOC_RECORDS) {
      expect(validTlp).toContain(r.tlp)
    }
  })
})

/* ================================================================ */
/* Feed records                                                       */
/* ================================================================ */
describe('DEMO_FEEDS_RESPONSE', () => {
  it('contains exactly 5 feed records', () => {
    expect(DEMO_FEEDS_RESPONSE.data).toHaveLength(5)
  })

  it('has page=1, limit=50, total=5', () => {
    expect(DEMO_FEEDS_RESPONSE.page).toBe(1)
    expect(DEMO_FEEDS_RESPONSE.limit).toBe(50)
    expect(DEMO_FEEDS_RESPONSE.total).toBe(5)
  })

  it('all IDs are unique', () => {
    const ids = DEMO_FEEDS_RESPONSE.data.map(f => f.id)
    expect(new Set(ids).size).toBe(5)
  })

  it('has active, error, and disabled statuses', () => {
    const statuses = new Set(DEMO_FEEDS_RESPONSE.data.map(f => f.status))
    expect(statuses).toContain('active')
    expect(statuses).toContain('error')
    expect(statuses).toContain('disabled')
  })

  it('has both rss and rest_api feed types', () => {
    const types = new Set(DEMO_FEEDS_RESPONSE.data.map(f => f.feedType))
    expect(types).toContain('rss')
    expect(types).toContain('rest_api')
  })

  it('disabled feed has enabled=false', () => {
    const disabled = DEMO_FEEDS_RESPONSE.data.filter(f => f.status === 'disabled')
    expect(disabled.length).toBeGreaterThan(0)
    for (const f of disabled) expect(f.enabled).toBe(false)
  })

  it('active feeds have enabled=true', () => {
    const active = DEMO_FEEDS_RESPONSE.data.filter(f => f.status === 'active')
    expect(active.length).toBeGreaterThan(0)
    for (const f of active) expect(f.enabled).toBe(true)
  })

  it('error feed has consecutiveFailures > 0 and lastErrorMessage', () => {
    const errored = DEMO_FEEDS_RESPONSE.data.filter(f => f.status === 'error')
    expect(errored.length).toBeGreaterThan(0)
    for (const f of errored) {
      expect(f.consecutiveFailures).toBeGreaterThan(0)
      expect(f.lastErrorMessage).toBeTruthy()
      expect(f.lastErrorAt).toBeTruthy()
    }
  })

  it('all totalItemsIngested are positive', () => {
    for (const f of DEMO_FEEDS_RESPONSE.data) {
      expect(f.totalItemsIngested).toBeGreaterThan(0)
    }
  })

  it('feedReliability is between 0 and 1', () => {
    for (const f of DEMO_FEEDS_RESPONSE.data) {
      expect(f.feedReliability).toBeGreaterThanOrEqual(0)
      expect(f.feedReliability).toBeLessThanOrEqual(1)
    }
  })

  it('active feeds have lastFetchAt within 24 hours', () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const active = DEMO_FEEDS_RESPONSE.data.filter(f => f.status === 'active')
    for (const f of active) {
      expect(f.lastFetchAt).toBeTruthy()
      expect(new Date(f.lastFetchAt!).getTime()).toBeGreaterThan(cutoff)
    }
  })

  it('all createdAt and updatedAt are valid ISO strings', () => {
    for (const f of DEMO_FEEDS_RESPONSE.data) {
      expect(new Date(f.createdAt).toISOString()).toBe(f.createdAt)
      expect(new Date(f.updatedAt).toISOString()).toBe(f.updatedAt)
    }
  })

  it('every record has all required FeedRecord fields', () => {
    const requiredKeys = [
      'id', 'name', 'description', 'feedType', 'url', 'schedule', 'status',
      'enabled', 'lastFetchAt', 'lastErrorAt', 'lastErrorMessage',
      'consecutiveFailures', 'totalItemsIngested', 'feedReliability',
      'createdAt', 'updatedAt',
    ]
    for (const f of DEMO_FEEDS_RESPONSE.data) {
      for (const key of requiredKeys) {
        expect(f).toHaveProperty(key)
      }
    }
  })
})

/* ================================================================ */
/* Aggregated stats                                                   */
/* ================================================================ */
describe('DEMO_IOC_STATS', () => {
  it('total matches record count', () => {
    expect(DEMO_IOC_STATS.total).toBe(25)
  })

  it('byType counts sum to total', () => {
    const sum = Object.values(DEMO_IOC_STATS.byType).reduce((a, b) => a + b, 0)
    expect(sum).toBe(25)
  })

  it('bySeverity counts sum to total', () => {
    const sum = Object.values(DEMO_IOC_STATS.bySeverity).reduce((a, b) => a + b, 0)
    expect(sum).toBe(25)
  })

  it('byLifecycle counts sum to total', () => {
    const sum = Object.values(DEMO_IOC_STATS.byLifecycle).reduce((a, b) => a + b, 0)
    expect(sum).toBe(25)
  })

  it('byType keys match IOC type values in records', () => {
    const typesInRecords = new Set(DEMO_IOC_RECORDS.map(r => r.iocType))
    const typesInStats = new Set(Object.keys(DEMO_IOC_STATS.byType))
    expect(typesInStats).toEqual(typesInRecords)
  })
})

/* ================================================================ */
/* Response wrapper                                                   */
/* ================================================================ */
describe('DEMO_IOCS_RESPONSE', () => {
  it('data property references DEMO_IOC_RECORDS', () => {
    expect(DEMO_IOCS_RESPONSE.data).toBe(DEMO_IOC_RECORDS)
  })

  it('total matches record count', () => {
    expect(DEMO_IOCS_RESPONSE.total).toBe(25)
  })

  it('has page=1 and limit=50', () => {
    expect(DEMO_IOCS_RESPONSE.page).toBe(1)
    expect(DEMO_IOCS_RESPONSE.limit).toBe(50)
  })
})

/* ================================================================ */
/* Dashboard stats                                                    */
/* ================================================================ */
describe('DEMO_DASHBOARD_STATS', () => {
  it('totalIOCs matches record count', () => {
    expect(DEMO_DASHBOARD_STATS.totalIOCs).toBe(25)
  })

  it('criticalIOCs matches bySeverity.critical', () => {
    expect(DEMO_DASHBOARD_STATS.criticalIOCs).toBe(DEMO_IOC_STATS.bySeverity['critical'])
  })

  it('activeFeeds is a positive number', () => {
    expect(DEMO_DASHBOARD_STATS.activeFeeds).toBeGreaterThan(0)
  })

  it('lastIngestTime is "Demo"', () => {
    expect(DEMO_DASHBOARD_STATS.lastIngestTime).toBe('Demo')
  })

  it('has all required dashboard stat fields', () => {
    expect(DEMO_DASHBOARD_STATS).toHaveProperty('totalIOCs')
    expect(DEMO_DASHBOARD_STATS).toHaveProperty('criticalIOCs')
    expect(DEMO_DASHBOARD_STATS).toHaveProperty('activeFeeds')
    expect(DEMO_DASHBOARD_STATS).toHaveProperty('enrichedToday')
    expect(DEMO_DASHBOARD_STATS).toHaveProperty('lastIngestTime')
  })
})
