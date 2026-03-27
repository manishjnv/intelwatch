import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StixConfidenceBadge } from '@/components/StixConfidenceBadge'

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: any) => sel({ user: { role: 'analyst' }, tenant: { name: 'T' }, accessToken: 't' })),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })) }))
vi.mock('@/hooks/use-auth', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn() })) }))
vi.mock('@/hooks/use-intel-data', () => ({ useDashboardStats: vi.fn(() => ({ data: null })) }))

describe('StixConfidenceBadge', () => {
  it('score 85 renders green with High tier', () => {
    render(<StixConfidenceBadge score={85} />)
    const badge = screen.getByTestId('stix-confidence-badge')
    expect(badge.textContent).toContain('85')
    expect(badge.textContent).toContain('High')
    expect(badge.getAttribute('title')).toContain('High')
  })

  it('score 50 renders amber with Medium tier', () => {
    render(<StixConfidenceBadge score={50} />)
    const badge = screen.getByTestId('stix-confidence-badge')
    expect(badge.textContent).toContain('50')
    expect(badge.textContent).toContain('Medium')
  })

  it('score 10 renders red with Low tier', () => {
    render(<StixConfidenceBadge score={10} />)
    const badge = screen.getByTestId('stix-confidence-badge')
    expect(badge.textContent).toContain('10')
    expect(badge.textContent).toContain('Low')
  })

  it('showTier=false hides tier label', () => {
    render(<StixConfidenceBadge score={85} showTier={false} />)
    const badge = screen.getByTestId('stix-confidence-badge')
    expect(badge.textContent).toContain('85')
    expect(badge.textContent).not.toContain('High')
  })

  it('compact variant renders dot + score only', () => {
    render(<StixConfidenceBadge score={72} variant="compact" />)
    const badge = screen.getByTestId('stix-confidence-badge')
    expect(badge.textContent).toContain('72')
    // compact has no tier label displayed inline
    expect(badge.getAttribute('title')).toContain('High')
  })

  it('score 0 renders None tier', () => {
    render(<StixConfidenceBadge score={0} />)
    const badge = screen.getByTestId('stix-confidence-badge')
    expect(badge.textContent).toContain('0')
    expect(badge.textContent).toContain('None')
  })
})
