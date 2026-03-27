import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { AdmiraltyBadge } from '@/components/AdmiraltyBadge'

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: any) => sel({ user: { role: 'analyst' }, tenant: { name: 'T' }, accessToken: 't' })),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })) }))
vi.mock('@/hooks/use-auth', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn() })) }))
vi.mock('@/hooks/use-intel-data', () => ({ useDashboardStats: vi.fn(() => ({ data: null })) }))

describe('AdmiraltyBadge', () => {
  it('renders A1 with green styling', () => {
    render(<AdmiraltyBadge source="A" cred={1} />)
    const badge = screen.getByTestId('admiralty-badge')
    expect(badge.textContent).toBe('A1')
    expect(badge.className).toContain('sev-low')
  })

  it('renders C3 with amber styling', () => {
    render(<AdmiraltyBadge source="C" cred={3} />)
    const badge = screen.getByTestId('admiralty-badge')
    expect(badge.textContent).toBe('C3')
    expect(badge.className).toContain('amber')
  })

  it('renders F6 with red/critical styling', () => {
    render(<AdmiraltyBadge source="F" cred={6} />)
    const badge = screen.getByTestId('admiralty-badge')
    expect(badge.textContent).toBe('F6')
    expect(badge.className).toContain('critical')
  })

  it('shows full labels in tooltip on hover', () => {
    render(<AdmiraltyBadge source="B" cred={2} />)
    const badge = screen.getByTestId('admiralty-badge')
    expect(badge.getAttribute('title')).toBe('Usually reliable — Probably true')
  })

  it('size md renders larger padding', () => {
    render(<AdmiraltyBadge source="A" cred={1} size="md" />)
    const badge = screen.getByTestId('admiralty-badge')
    expect(badge.className).toContain('text-sm')
  })

  it('invalid source/cred renders fallback', () => {
    render(<AdmiraltyBadge source="" cred={0} />)
    const badge = screen.getByTestId('admiralty-badge')
    expect(badge.textContent).toBe('??')
    expect(badge.className).toContain('text-muted')
  })
})
