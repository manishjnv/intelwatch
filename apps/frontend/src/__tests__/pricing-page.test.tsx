/**
 * Tests for public /pricing (SEO plan 2.2, DECISION-030).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PricingPage } from '@/pages/PricingPage'
import { findRouteMeta } from '@/seo/public-routes'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pricing']}>
      <PricingPage />
    </MemoryRouter>,
  )
}

const card = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('li')!

describe('PricingPage', () => {
  it('has one h1 and defaults to monthly list prices', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^Monthly/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(card('Starter')).getByText('₹9,999')).toBeInTheDocument()
    expect(within(card('Teams')).getByText('₹18,999')).toBeInTheDocument()
    expect(within(card('Enterprise')).getByText('₹49,999')).toBeInTheDocument()
    expect(within(card('Free')).getByText('₹0')).toBeInTheDocument()
    expect(within(card('Starter')).getByText(/Billed monthly · \+ 18% GST/)).toBeInTheDocument()
  })

  it('self-serve plans link to signup, Enterprise to sales', () => {
    renderPage()
    for (const name of ['Free', 'Starter', 'Teams']) {
      expect(within(card(name)).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register')
    }
    const sales = within(card('Enterprise')).getByRole('link', { name: 'Contact sales' })
    expect(sales.getAttribute('href')).toMatch(/^mailto:sales@intelwatch\.in\?subject=Enterprise%20plan$/)
  })

  it('annual toggle shows discounted per-month price, yearly total and routes to sales', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^Annual/ }))
    expect(screen.getByRole('button', { name: /^Annual/ })).toHaveAttribute('aria-pressed', 'true')

    const starter = card('Starter')
    expect(within(starter).getByText('₹7,999')).toBeInTheDocument()
    expect(within(starter).getByText(/₹95,988 billed yearly/)).toBeInTheDocument()
    expect(within(starter).getByText('Save 20%')).toBeInTheDocument()
    expect(within(card('Teams')).getByText(/₹1,79,988 billed yearly/)).toBeInTheDocument()
    expect(within(card('Enterprise')).getByText(/₹4,79,988 billed yearly/)).toBeInTheDocument()

    // Checkout only bills monthly — annual must never send users to self-serve signup
    const cta = within(starter).getByRole('link', { name: 'Contact sales' })
    expect(cta.getAttribute('href')).toContain(encodeURIComponent('Starter plan — annual billing'))
    // Free stays self-serve and unpriced
    expect(within(card('Free')).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register')
    expect(screen.getByText(/Annual plans are invoiced by our team/)).toBeInTheDocument()
  })

  it('answers billing questions with verified facts', () => {
    renderPage()
    for (const q of ['Do prices include GST?', 'Is there a free trial?', 'How do I pay?', 'How does annual billing work?', 'Can I upgrade later?']) {
      expect(screen.getByText(q)).toBeInTheDocument()
    }
    expect(screen.getByText(/7-day trial when you sign up/)).toBeInTheDocument()
    expect(screen.getByText(/Razorpay: credit or debit card, UPI/)).toBeInTheDocument()
  })

  it('header and footer expose crawlable links', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'IntelWatch' })).toHaveAttribute('href', '/')
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })
})

describe('/pricing route meta', () => {
  it('has title, description within snippet length and priced JSON-LD offers', () => {
    const meta = findRouteMeta('/pricing')!
    expect(meta.title).toContain('Pricing')
    expect(meta.description).toContain('Starter ₹9,999/mo')
    expect(meta.description).toContain('Enterprise ₹49,999/mo')
    const offers = (meta.jsonLd as { offers: { name: string; price: string; priceCurrency: string }[] }).offers
    expect(offers.map((o) => [o.name, o.price])).toEqual([
      ['Free', '0'], ['Starter', '9999'], ['Teams', '18999'], ['Enterprise', '49999'],
    ])
    expect(offers.every((o) => o.priceCurrency === 'INR')).toBe(true)
  })
})
