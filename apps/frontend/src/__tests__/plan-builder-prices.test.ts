/**
 * @module __tests__/plan-builder-prices.test
 * @description DECISION-030/031: DEMO_PLANS annual prices must match the public
 * catalogue in data/plans.ts (PLANS). priceAnnualInr is the annual TOTAL;
 * PLANS.priceAnnual is the per-month rate billed yearly, so priceAnnualInr = 12 * priceAnnual.
 */
import { describe, it, expect } from 'vitest'
import { DEMO_PLANS } from '@/hooks/use-plan-builder'
import { PLANS } from '@/data/plans'

describe('DEMO_PLANS pricing matches the public catalogue', () => {
  it('has no planId "teams" (the marketing Teams plan is id "pro")', () => {
    expect(DEMO_PLANS.some(p => p.planId === 'teams')).toBe(false)
  })

  it.each(DEMO_PLANS.filter(p => p.priceMonthlyInr > 0))(
    '$planId annual price is 12x the public monthly-billed-annually rate',
    (plan) => {
      const pub = PLANS.find(p => p.id === plan.planId)
      expect(pub).toBeDefined()
      expect(plan.priceAnnualInr).toBe((pub!.priceAnnual ?? 0) * 12)
    }
  )
})
