/**
 * @module data/plans
 * @description Public plan catalogue shown at signup (PlanCards) and on /pricing.
 * DECISION-030: monthly list prices ₹9,999 / 18,999 / 49,999 must match billing-service
 * plan-store and prisma plan seeds. `priceAnnual` is the per-month rate when billed yearly
 * (seed priceAnnualInr = 12 × priceAnnual). Data only — no component imports here, so the
 * route meta table can use it without pulling UI code into the landing bundle.
 */

export interface PlanDef {
  id: string
  name: string
  /** Monthly list price in INR (excl. GST). */
  price: number
  /** Per-month price in INR when billed annually (excl. GST). */
  priceAnnual?: number
  priceLabel: string
  saveLabel?: string
  popular?: boolean
  stats: { seats: string; iocLimit: string; apiCalls: string; storage: string }
  features: string[]
  cta: 'select' | 'contact'
}

export const SALES_EMAIL = 'sales@intelwatch.in'
export const GST_RATE_PERCENT = 18

/** ₹ with Indian digit grouping (₹1,79,988). Deterministic on server and client. */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

export function annualSavingsPercent(plan: Pick<PlanDef, 'price' | 'priceAnnual'>): number {
  if (!plan.price || !plan.priceAnnual) return 0
  return Math.round((1 - plan.priceAnnual / plan.price) * 100)
}

export const PLANS: PlanDef[] = [
  {
    id: 'free', name: 'Free', price: 0, priceLabel: 'Free',
    stats: { seats: '2', iocLimit: '10K', apiCalls: '10K/mo', storage: '1 GB' },
    features: [
      'Up to 2 users', '10K API calls / month', '10K IOC limit',
      '1 GB storage', 'RSS + STIX feeds', 'Basic IOC search', 'Community support',
    ],
    cta: 'select',
  },
  {
    id: 'starter', name: 'Starter', price: 9999, priceAnnual: 7999, priceLabel: '₹9,999',
    saveLabel: '₹7,999/mo billed annually · save 20%',
    stats: { seats: '10', iocLimit: '50K', apiCalls: '100K/mo', storage: '10 GB' },
    features: [
      'Up to 10 users', '100K API calls / month', '50K IOC limit',
      '10 GB storage', 'All feed types', 'AI enrichment (Haiku)',
      'SIEM integration (1)', 'Email support',
    ],
    cta: 'select',
  },
  {
    id: 'pro', name: 'Teams', price: 18999, priceAnnual: 14999, priceLabel: '₹18,999',
    saveLabel: '₹14,999/mo billed annually · save 21%', popular: true,
    stats: { seats: '25', iocLimit: '250K', apiCalls: '250K/mo', storage: '50 GB' },
    features: [
      'Up to 25 users', '250K API calls / month', '250K IOC limit',
      '50 GB storage', 'All feed types', 'AI enrichment (Haiku)',
      'Threat Graph (read-only)', 'SIEM integrations (3)', 'Priority email support',
    ],
    cta: 'select',
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 49999, priceAnnual: 39999, priceLabel: '₹49,999',
    saveLabel: '₹39,999/mo billed annually · save 20%',
    stats: { seats: 'Unlimited', iocLimit: '∞', apiCalls: '∞/mo', storage: 'Custom' },
    features: [
      'Unlimited users', 'Unlimited API calls', 'Unlimited IOCs',
      'Custom storage', 'AI enrichment (Opus)', 'Full platform access',
      'Custom integrations', 'Dedicated SLA', 'On-prem option', '24/7 dedicated support',
    ],
    cta: 'contact',
  },
]
