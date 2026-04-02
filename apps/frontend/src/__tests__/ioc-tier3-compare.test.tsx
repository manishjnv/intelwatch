/**
 * @module __tests__/ioc-tier3-compare.test
 * @description Tests for F4: IOC Quick Compare panel.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { IocComparePanel } from '@/components/ioc/IocComparePanel'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@/components/ioc/ConfidenceGauge', () => ({
  ConfidenceGauge: ({ value }: { value: number }) => <span data-testid="confidence-gauge">{value}%</span>,
}))

const IOC_A = {
  id: 'a', iocType: 'ip', normalizedValue: '1.2.3.4', severity: 'critical',
  confidence: 92, lifecycle: 'active', tlp: 'red', tags: ['apt', 'c2'],
  threatActors: ['APT28'], malwareFamilies: ['Sofacy'],
  firstSeen: '2026-04-01T10:00:00Z', lastSeen: '2026-04-02T08:00:00Z',
  corroborationCount: 5, campaignId: 'camp-1',
}

const IOC_B = {
  id: 'b', iocType: 'ip', normalizedValue: '5.6.7.8', severity: 'high',
  confidence: 68, lifecycle: 'aging', tlp: 'amber', tags: ['apt'],
  threatActors: ['APT28', 'Lazarus'], malwareFamilies: [],
  firstSeen: '2026-03-28T10:00:00Z', lastSeen: '2026-04-01T12:00:00Z',
  corroborationCount: 2, campaignId: null,
}

const IOC_C = {
  id: 'c', iocType: 'domain', normalizedValue: 'evil.example.com', severity: 'medium',
  confidence: 45, lifecycle: 'new', tlp: 'green', tags: ['phishing'],
  threatActors: [], malwareFamilies: [],
  firstSeen: '2026-04-02T00:00:00Z', lastSeen: '2026-04-02T06:00:00Z',
  corroborationCount: 1,
}

describe('IocComparePanel', () => {
  it('renders panel with 2 IOC columns', () => {
    const onClose = vi.fn()
    render(<IocComparePanel records={[IOC_A as any, IOC_B as any]} onClose={onClose} />)
    expect(screen.getByTestId('ioc-compare-panel')).toBeInTheDocument()
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
    expect(screen.getByText('5.6.7.8')).toBeInTheDocument()
  })

  it('renders panel with 3 IOC columns', () => {
    render(<IocComparePanel records={[IOC_A as any, IOC_B as any, IOC_C as any]} onClose={vi.fn()} />)
    expect(screen.getByText('evil.example.com')).toBeInTheDocument()
  })

  it('shows comparison rows for all fields', () => {
    render(<IocComparePanel records={[IOC_A as any, IOC_B as any]} onClose={vi.fn()} />)
    const rows = screen.getAllByTestId('compare-row')
    // Type, Severity, Confidence, Lifecycle, TLP, First Seen, Last Seen, Corroboration, Tags, Threat Actors, Malware, Campaign
    expect(rows.length).toBe(12)
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<IocComparePanel records={[IOC_A as any, IOC_B as any]} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('close-compare'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('marks same severity as matching (same type row)', () => {
    const sameTypeA = { ...IOC_A, severity: 'critical' }
    const sameTypeB = { ...IOC_B, severity: 'critical' }
    render(<IocComparePanel records={[sameTypeA as any, sameTypeB as any]} onClose={vi.fn()} />)
    // The "Severity" row should have green tint when values match
    const rows = screen.getAllByTestId('compare-row')
    // Row 1 = Type (both ip → same), find it
    expect(rows[0]!.className).toContain('bg-sev-low')
  })

  it('marks different severity as differing', () => {
    render(<IocComparePanel records={[IOC_A as any, IOC_B as any]} onClose={vi.fn()} />)
    // Severity row — different (critical vs high)
    const rows = screen.getAllByTestId('compare-row')
    // Row index 1 = Severity
    expect(rows[1]!.className).toContain('bg-sev-critical')
  })
})
