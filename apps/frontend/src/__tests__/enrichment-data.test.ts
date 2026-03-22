/**
 * Tests for enrichment demo data shape and completeness.
 * Pure unit tests — no DOM, no hooks, no rendering.
 */
import { describe, it, expect } from 'vitest'
import {
  DEMO_ENRICHMENT_STATS,
  DEMO_COST_STATS,
  DEMO_BUDGET,
  DEMO_ENRICHMENT_RESULT,
  DEMO_IOC_COST,
} from '@/hooks/demo-data'

/* ================================================================ */
/* Enrichment stats                                                   */
/* ================================================================ */
describe('DEMO_ENRICHMENT_STATS', () => {
  it('has all required fields', () => {
    expect(DEMO_ENRICHMENT_STATS).toHaveProperty('total')
    expect(DEMO_ENRICHMENT_STATS).toHaveProperty('enriched')
    expect(DEMO_ENRICHMENT_STATS).toHaveProperty('pending')
    expect(DEMO_ENRICHMENT_STATS).toHaveProperty('failed')
    expect(DEMO_ENRICHMENT_STATS).toHaveProperty('enrichedToday')
    expect(DEMO_ENRICHMENT_STATS).toHaveProperty('avgQualityScore')
    expect(DEMO_ENRICHMENT_STATS).toHaveProperty('cacheHitRate')
  })

  it('enriched + pending + failed <= total', () => {
    const { enriched, pending, failed, total } = DEMO_ENRICHMENT_STATS
    expect(enriched + pending + failed).toBeLessThanOrEqual(total)
  })

  it('avgQualityScore is between 0 and 100', () => {
    expect(DEMO_ENRICHMENT_STATS.avgQualityScore).toBeGreaterThanOrEqual(0)
    expect(DEMO_ENRICHMENT_STATS.avgQualityScore).toBeLessThanOrEqual(100)
  })

  it('cacheHitRate is between 0 and 1', () => {
    expect(DEMO_ENRICHMENT_STATS.cacheHitRate).toBeGreaterThanOrEqual(0)
    expect(DEMO_ENRICHMENT_STATS.cacheHitRate).toBeLessThanOrEqual(1)
  })

  it('enrichedToday is a positive number', () => {
    expect(DEMO_ENRICHMENT_STATS.enrichedToday).toBeGreaterThan(0)
  })
})

/* ================================================================ */
/* Cost stats                                                         */
/* ================================================================ */
describe('DEMO_COST_STATS', () => {
  it('has all required fields', () => {
    expect(DEMO_COST_STATS).toHaveProperty('headline')
    expect(DEMO_COST_STATS).toHaveProperty('totalIOCsEnriched')
    expect(DEMO_COST_STATS).toHaveProperty('totalCostUsd')
    expect(DEMO_COST_STATS).toHaveProperty('totalTokens')
    expect(DEMO_COST_STATS).toHaveProperty('byProvider')
    expect(DEMO_COST_STATS).toHaveProperty('byIOCType')
    expect(DEMO_COST_STATS).toHaveProperty('since')
  })

  it('headline contains cost information', () => {
    expect(DEMO_COST_STATS.headline).toContain('$')
    expect(DEMO_COST_STATS.headline).toContain('enriched')
  })

  it('byProvider has at least VT, AbuseIPDB, and Haiku', () => {
    expect(DEMO_COST_STATS.byProvider).toHaveProperty('virustotal')
    expect(DEMO_COST_STATS.byProvider).toHaveProperty('abuseipdb')
    expect(DEMO_COST_STATS.byProvider).toHaveProperty('haiku_triage')
  })

  it('provider entries have count and costUsd', () => {
    for (const [, val] of Object.entries(DEMO_COST_STATS.byProvider)) {
      expect(val).toHaveProperty('count')
      expect(val).toHaveProperty('costUsd')
      expect(val.count).toBeGreaterThanOrEqual(0)
      expect(val.costUsd).toBeGreaterThanOrEqual(0)
    }
  })

  it('byIOCType entries have count and costUsd', () => {
    for (const [, val] of Object.entries(DEMO_COST_STATS.byIOCType)) {
      expect(val).toHaveProperty('count')
      expect(val).toHaveProperty('costUsd')
    }
  })

  it('since is a valid ISO timestamp', () => {
    expect(new Date(DEMO_COST_STATS.since).toISOString()).toBe(DEMO_COST_STATS.since)
  })
})

/* ================================================================ */
/* Budget                                                             */
/* ================================================================ */
describe('DEMO_BUDGET', () => {
  it('has all required fields', () => {
    expect(DEMO_BUDGET).toHaveProperty('tenantId')
    expect(DEMO_BUDGET).toHaveProperty('currentSpendUsd')
    expect(DEMO_BUDGET).toHaveProperty('dailyLimitUsd')
    expect(DEMO_BUDGET).toHaveProperty('percentUsed')
    expect(DEMO_BUDGET).toHaveProperty('isOverBudget')
  })

  it('percentUsed is consistent with spend/limit', () => {
    const expected = (DEMO_BUDGET.currentSpendUsd / DEMO_BUDGET.dailyLimitUsd) * 100
    expect(DEMO_BUDGET.percentUsed).toBeCloseTo(expected, 1)
  })

  it('isOverBudget is false when under budget', () => {
    expect(DEMO_BUDGET.currentSpendUsd).toBeLessThan(DEMO_BUDGET.dailyLimitUsd)
    expect(DEMO_BUDGET.isOverBudget).toBe(false)
  })
})

/* ================================================================ */
/* Enrichment result                                                  */
/* ================================================================ */
describe('DEMO_ENRICHMENT_RESULT', () => {
  it('has enrichmentStatus = enriched', () => {
    expect(DEMO_ENRICHMENT_RESULT.enrichmentStatus).toBe('enriched')
  })

  it('has a valid enrichedAt timestamp', () => {
    expect(DEMO_ENRICHMENT_RESULT.enrichedAt).not.toBeNull()
    expect(new Date(DEMO_ENRICHMENT_RESULT.enrichedAt!).toISOString()).toBe(DEMO_ENRICHMENT_RESULT.enrichedAt)
  })

  it('externalRiskScore is between 0 and 100', () => {
    expect(DEMO_ENRICHMENT_RESULT.externalRiskScore).toBeGreaterThanOrEqual(0)
    expect(DEMO_ENRICHMENT_RESULT.externalRiskScore).toBeLessThanOrEqual(100)
  })

  it('enrichmentQuality is between 0 and 100', () => {
    expect(DEMO_ENRICHMENT_RESULT.enrichmentQuality).toBeGreaterThanOrEqual(0)
    expect(DEMO_ENRICHMENT_RESULT.enrichmentQuality).toBeLessThanOrEqual(100)
  })

  // Haiku result
  describe('haikuResult', () => {
    const h = DEMO_ENRICHMENT_RESULT.haikuResult!

    it('has riskScore between 0 and 100', () => {
      expect(h.riskScore).toBeGreaterThanOrEqual(0)
      expect(h.riskScore).toBeLessThanOrEqual(100)
    })

    it('has evidenceSources with provider, dataPoint, interpretation', () => {
      expect(h.evidenceSources.length).toBeGreaterThan(0)
      for (const ev of h.evidenceSources) {
        expect(ev).toHaveProperty('provider')
        expect(ev).toHaveProperty('dataPoint')
        expect(ev).toHaveProperty('interpretation')
        expect(ev.provider.length).toBeGreaterThan(0)
      }
    })

    it('has mitreTechniques with valid T-code format', () => {
      expect(h.mitreTechniques.length).toBeGreaterThan(0)
      for (const t of h.mitreTechniques) {
        expect(t.techniqueId).toMatch(/^T\d{4}(\.\d{3})?$/)
        expect(t.name.length).toBeGreaterThan(0)
        expect(t.tactic.length).toBeGreaterThan(0)
      }
    })

    it('has recommendedActions with valid priorities', () => {
      expect(h.recommendedActions.length).toBeGreaterThan(0)
      const validPriorities = new Set(['immediate', 'short_term', 'long_term'])
      for (const a of h.recommendedActions) {
        expect(validPriorities).toContain(a.priority)
        expect(a.action.length).toBeGreaterThan(0)
      }
    })

    it('has stixLabels', () => {
      expect(h.stixLabels.length).toBeGreaterThan(0)
    })

    it('has malwareFamilies and attributedActors', () => {
      expect(h.malwareFamilies.length).toBeGreaterThan(0)
      expect(h.attributedActors.length).toBeGreaterThan(0)
    })

    it('has token usage fields', () => {
      expect(h.inputTokens).toBeGreaterThan(0)
      expect(h.outputTokens).toBeGreaterThan(0)
      expect(h.costUsd).toBeGreaterThan(0)
      expect(h.durationMs).toBeGreaterThan(0)
    })
  })

  // VT result
  describe('vtResult', () => {
    const vt = DEMO_ENRICHMENT_RESULT.vtResult!

    it('has detection rate between 0 and 100', () => {
      expect(vt.detectionRate).toBeGreaterThanOrEqual(0)
      expect(vt.detectionRate).toBeLessThanOrEqual(100)
    })

    it('engine counts sum to totalEngines', () => {
      const sum = vt.malicious + vt.suspicious + vt.harmless + vt.undetected
      expect(sum).toBe(vt.totalEngines)
    })
  })

  // AbuseIPDB result
  describe('abuseipdbResult', () => {
    const abuse = DEMO_ENRICHMENT_RESULT.abuseipdbResult!

    it('has abuseConfidenceScore between 0 and 100', () => {
      expect(abuse.abuseConfidenceScore).toBeGreaterThanOrEqual(0)
      expect(abuse.abuseConfidenceScore).toBeLessThanOrEqual(100)
    })

    it('has countryCode with 2 chars', () => {
      expect(abuse.countryCode).toHaveLength(2)
    })
  })

  // Geolocation
  describe('geolocation', () => {
    const geo = DEMO_ENRICHMENT_RESULT.geolocation!

    it('has countryCode with 2 chars', () => {
      expect(geo.countryCode).toHaveLength(2)
    })

    it('has isp string', () => {
      expect(geo.isp.length).toBeGreaterThan(0)
    })
  })
})

/* ================================================================ */
/* Per-IOC cost breakdown                                             */
/* ================================================================ */
describe('DEMO_IOC_COST', () => {
  it('has iocId and providers array', () => {
    expect(DEMO_IOC_COST.iocId).toBeTruthy()
    expect(DEMO_IOC_COST.providers.length).toBeGreaterThan(0)
  })

  it('each provider has required fields', () => {
    for (const p of DEMO_IOC_COST.providers) {
      expect(p).toHaveProperty('provider')
      expect(p).toHaveProperty('costUsd')
      expect(p).toHaveProperty('durationMs')
      expect(p).toHaveProperty('timestamp')
    }
  })

  it('totalCostUsd matches sum of provider costs', () => {
    const sum = DEMO_IOC_COST.providers.reduce((a, p) => a + p.costUsd, 0)
    expect(DEMO_IOC_COST.totalCostUsd).toBeCloseTo(sum, 4)
  })

  it('totalTokens matches sum of provider tokens', () => {
    const sum = DEMO_IOC_COST.providers.reduce((a, p) => a + p.inputTokens + p.outputTokens, 0)
    expect(DEMO_IOC_COST.totalTokens).toBe(sum)
  })

  it('providerCount matches providers array length', () => {
    expect(DEMO_IOC_COST.providerCount).toBe(DEMO_IOC_COST.providers.length)
  })
})
