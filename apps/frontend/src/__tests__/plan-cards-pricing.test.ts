/**
 * Guards public plan prices shown at signup (DECISION S147: ₹9,999 / 18,999 / 49,999 monthly).
 * Must stay in sync with apps/billing-service/src/services/plan-store.ts and
 * prisma/seeds/plan-definitions-seed.mjs (annual = 12 × discounted monthly: 95,988 / 179,988 / 479,988).
 */
import { describe, it, expect } from 'vitest'
import { PLANS } from '@/components/PlanCards'

const EXPECTED = [
  { id: 'free', monthly: 0, annualPerMonth: null },
  { id: 'starter', monthly: 9_999, annualPerMonth: 7_999 },
  { id: 'pro', monthly: 18_999, annualPerMonth: 14_999 },
  { id: 'enterprise', monthly: 49_999, annualPerMonth: 39_999 },
] as const

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

describe('PlanCards pricing', () => {
  it('lists the four public plans in order', () => {
    expect(PLANS.map((p) => p.id)).toEqual(EXPECTED.map((e) => e.id))
  })

  for (const e of EXPECTED) {
    it(`${e.id}: headline is the monthly list price`, () => {
      const plan = PLANS.find((p) => p.id === e.id)!
      expect(plan.price).toBe(e.monthly)
      if (e.monthly > 0) expect(plan.priceLabel).toBe(inr(e.monthly))
    })

    if (e.annualPerMonth !== null) {
      it(`${e.id}: annual option is labelled as billed annually`, () => {
        const plan = PLANS.find((p) => p.id === e.id)!
        expect(plan.saveLabel).toContain(`${inr(e.annualPerMonth)}/mo billed annually`)
        const pct = Math.round((1 - e.annualPerMonth / e.monthly) * 100)
        expect(plan.saveLabel).toContain(`save ${pct}%`)
      })
    }
  }
})
