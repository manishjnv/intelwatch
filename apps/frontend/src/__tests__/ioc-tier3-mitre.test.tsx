/**
 * @module __tests__/ioc-tier3-mitre.test
 * @description Tests for F2: MITRE ATT&CK TTP Badges — MitreBadgeCell + MitreDetailSection.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { MitreBadgeCell } from '@/components/ioc/MitreBadgeCell'
import { MitreDetailSection } from '@/components/ioc/MitreDetailSection'

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}))

// ─── MitreBadgeCell ──────────────────────────────────────────────
describe('MitreBadgeCell', () => {
  it('renders null for empty techniques', () => {
    render(<MitreBadgeCell techniques={[]} />)
    expect(screen.queryByTestId('mitre-badges')).toBeNull()
    expect(screen.queryByTestId('mitre-count')).toBeNull()
  })

  it('renders 1 badge for 1 technique', () => {
    render(<MitreBadgeCell techniques={['T1071']} />)
    const badges = screen.getAllByTestId('mitre-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('T1071')
  })

  it('renders max 2 badges with overflow for 5 techniques', () => {
    render(<MitreBadgeCell techniques={['T1071', 'T1059', 'T1190', 'T1566', 'T1027']} />)
    const badges = screen.getAllByTestId('mitre-badge')
    expect(badges).toHaveLength(2)
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('shows count only in ultra-dense mode', () => {
    render(<MitreBadgeCell techniques={['T1071', 'T1059']} density="ultra-dense" />)
    expect(screen.getByTestId('mitre-count')).toHaveTextContent('2 TTPs')
    expect(screen.queryByTestId('mitre-badge')).toBeNull()
  })

  it('includes technique name in tooltip', () => {
    render(<MitreBadgeCell techniques={['T1071']} />)
    const badge = screen.getByTestId('mitre-badge')
    expect(badge).toHaveAttribute('title', expect.stringContaining('Application Layer Protocol'))
  })
})

// ─── MitreDetailSection ──────────────────────────────────────────
describe('MitreDetailSection', () => {
  it('renders null for empty techniques', () => {
    render(<MitreDetailSection techniques={[]} />)
    expect(screen.queryByTestId('mitre-detail-section')).toBeNull()
  })

  it('renders section with technique count', () => {
    render(<MitreDetailSection techniques={['T1071', 'T1059']} />)
    expect(screen.getByTestId('mitre-detail-section')).toBeInTheDocument()
    expect(screen.getByText(/2 techniques/)).toBeInTheDocument()
  })

  it('groups techniques by tactic', () => {
    render(<MitreDetailSection techniques={['T1071', 'T1105', 'T1059']} />)
    // T1071 + T1105 = command-and-control, T1059 = execution
    const links = screen.getAllByTestId('mitre-technique-link')
    expect(links.length).toBe(3)
  })

  it('links to MITRE ATT&CK site', () => {
    render(<MitreDetailSection techniques={['T1071.001']} />)
    const link = screen.getByTestId('mitre-technique-link')
    expect(link).toHaveAttribute('href', 'https://attack.mitre.org/techniques/T1071/001/')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('collapses and expands on click', () => {
    render(<MitreDetailSection techniques={['T1071']} />)
    const toggleBtn = screen.getByRole('button', { name: /MITRE/i })
    // Initially open
    expect(screen.getByTestId('mitre-technique-link')).toBeInTheDocument()
    // Click to collapse
    fireEvent.click(toggleBtn)
    // After collapse animation the content should be gone
    expect(screen.queryByTestId('mitre-technique-link')).toBeNull()
  })
})
