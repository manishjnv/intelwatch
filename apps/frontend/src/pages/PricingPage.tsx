/**
 * @module pages/PricingPage
 * @description Public /pricing (SEO plan 2.2, DECISION-030). Prerendered by scripts/prerender.mjs.
 * Monthly/annual toggle. DECISION-031: Free is the only self-serve plan and there is no trial;
 * every paid plan (monthly or annual) is set up and invoiced by sales. Every FAQ answer is backed by code (see docs/S147_P2B_PRICING_PAGE.md).
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { PublicLayout, focusRing } from '@/components/public/PublicLayout'
import { GST_RATE_PERCENT, PLANS, SALES_EMAIL, annualSavingsPercent, formatInr, salesMailto, type PlanDef } from '@/data/plans'
import { cn } from '@/lib/utils'

type Cycle = 'monthly' | 'annual'

const MAX_SAVINGS = Math.max(...PLANS.map(annualSavingsPercent))

const ctaBase = cn(
  'inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium transition-colors',
  focusRing,
)

function PlanCard({ plan, cycle }: { plan: PlanDef; cycle: Cycle }) {
  const isFree = plan.price === 0
  const annual = cycle === 'annual' && !isFree && plan.priceAnnual !== undefined
  const perMonth = annual ? plan.priceAnnual! : plan.price
  const savings = annual ? annualSavingsPercent(plan) : 0
  const viaSales = plan.cta === 'contact' || annual
  const primary = Boolean(plan.popular)

  const billedLine = isFree
    ? 'No time limit'
    : annual
      ? `${formatInr(plan.priceAnnual! * 12)} billed yearly · + ${GST_RATE_PERCENT}% GST`
      : `Billed monthly · + ${GST_RATE_PERCENT}% GST`

  return (
    <li
      className={cn(
        'flex flex-col rounded-xl border bg-bg-primary p-5',
        primary ? 'border-accent ring-1 ring-accent/30' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{plan.name}</h2>
        {primary && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">Recommended</span>}
      </div>

      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums">{formatInr(perMonth)}</span>
        {!isFree && <span className="text-sm text-text-muted">/mo</span>}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {billedLine}
        {savings > 0 && <span className="ml-1.5 font-medium text-sev-low">Save {savings}%</span>}
      </p>

      <div className="mt-5">
        {viaSales ? (
          <a
            href={salesMailto(`${plan.name} plan${annual ? ' — annual billing' : ''}`)}
            className={cn(ctaBase, primary ? 'bg-accent text-white hover:bg-accent-hover' : 'border border-border hover:bg-bg-elevated')}
          >
            Contact sales
          </a>
        ) : (
          <Link
            to="/register"
            className={cn(ctaBase, primary ? 'bg-accent text-white hover:bg-accent-hover' : 'border border-border hover:bg-bg-elevated')}
          >
            Get started
          </Link>
        )}
      </div>

      <ul className="mt-5 space-y-2 text-sm text-text-secondary">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sev-low" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Do prices include GST?',
    a: `No. ${GST_RATE_PERCENT}% GST is added to each invoice, and every paid invoice comes with a GST receipt.`,
  },
  {
    q: 'How do I get a paid plan?',
    a: `Start on the Free plan, then email ${SALES_EMAIL}. We set up Starter, Teams or Enterprise and invoice you.`,
  },
  {
    q: 'How do I pay?',
    a: 'Payments go through Razorpay: credit or debit card, UPI, net banking, wallets and card EMI.',
  },
  {
    q: 'How does annual billing work?',
    a: `Annual plans cost up to ${MAX_SAVINGS}% less than monthly and are invoiced by our team. Email ${SALES_EMAIL} to switch.`,
  },
  {
    q: 'Can I change plans later?',
    a: `Yes. Email ${SALES_EMAIL} and we will move your workspace to the new plan.`,
  },
]

export function PricingPage() {
  const [cycle, setCycle] = useState<Cycle>('monthly')

  return (
    <PublicLayout>
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-12 text-center sm:px-6 sm:pt-16">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Threat intelligence pricing in INR</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-text-secondary">
          Start free. Paid plans are set up by our team. Prices exclude {GST_RATE_PERCENT}% GST.
        </p>

        <div role="group" aria-label="Billing period" className="mt-6 inline-flex rounded-lg border border-border bg-bg-primary p-1">
          {(['monthly', 'annual'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cycle === c}
              onClick={() => setCycle(c)}
              className={cn(
                'inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors',
                focusRing,
                cycle === c ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-primary',
              )}
            >
              {c === 'monthly' ? 'Monthly' : 'Annual'}
              {c === 'annual' && <span className="ml-1.5 text-xs text-sev-low">Save up to {MAX_SAVINGS}%</span>}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Plans" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} cycle={cycle} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h2 id="faq-heading" className="text-lg font-semibold">Billing questions</h2>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group py-3">
              <summary className={cn('flex cursor-pointer list-none items-center justify-between gap-4 rounded text-sm font-medium', focusRing)}>
                {q}
                <span aria-hidden="true" className="text-text-muted transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="mt-2 text-sm text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </PublicLayout>
  )
}
