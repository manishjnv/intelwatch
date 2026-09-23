/**
 * S147: adapters from ioc-intelligence pivot/timeline responses to the IOC detail UI shapes.
 */
import { describe, it, expect } from 'vitest'
import { toPivotResult, toTimelineEvents } from '@/hooks/use-intel-data'

describe('toPivotResult', () => {
  it('flattens grouped related IOCs into one tagged, de-duplicated list', () => {
    const r = toPivotResult({
      byThreatActor: [{ id: 'a', iocType: 'ip', normalizedValue: '1.2.3.4', severity: 'high' }],
      byMalware: [{ id: 'a', iocType: 'ip', normalizedValue: '1.2.3.4' }, { id: 'b', iocType: 'domain', normalizedValue: 'x.test' }],
      byFeed: [{ id: 'c' }],
      bySubnet: [],
    })
    expect(r.relatedIOCs.map((x) => [x.id, x.relationship])).toEqual([
      ['a', 'shared threat actor'], ['b', 'shared malware'], ['c', 'same feed'],
    ])
    expect(r.relatedIOCs[2]).toMatchObject({ iocType: 'unknown', normalizedValue: '', severity: 'info' })
    expect(r.actors).toEqual([])
  })

  it('handles null / empty responses', () => {
    expect(toPivotResult(null).relatedIOCs).toEqual([])
    expect(toPivotResult({}).relatedIOCs).toEqual([])
  })
})

describe('toTimelineEvents', () => {
  it('maps {type, details} events to {eventType, summary}', () => {
    const out = toTimelineEvents({
      events: [
        { timestamp: '2026-09-01T00:00:00Z', type: 'first_seen', details: { severity: 'high' } },
        { timestamp: '2026-09-02T00:00:00Z', type: 'confidence_change', details: { score: 80, source: 'vt' } },
        { timestamp: '2026-09-03T00:00:00Z', type: 'enriched', details: { status: 'enriched' } },
        { timestamp: '2026-09-04T00:00:00Z', type: 'last_seen', details: { lifecycle: 'active' } },
      ],
    })
    expect(out.map((e) => e.eventType)).toEqual(['first_seen', 'severity_change', 'enrichment', 'sighting'])
    expect(out.map((e) => e.summary)).toEqual([
      'First seen · high', 'Confidence 80 (vt)', 'Enriched (enriched)', 'Last seen · active',
    ])
    expect(out[1]?.source).toBe('vt')
  })

  it('returns [] for missing events', () => {
    expect(toTimelineEvents(null)).toEqual([])
    expect(toTimelineEvents({})).toEqual([])
  })
})
