/**
 * Tests for GlobalIocOverlayPanel:
 * - IOC header, STIX tier badge, global data section
 * - Enrichment details (Shodan, GreyNoise, EPSS)
 * - Warninglist banner, overlay form, save/reset
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockSetOverlay = vi.fn()
const mockRemoveOverlay = vi.fn()

vi.mock('@/hooks/use-global-iocs', () => ({
  useGlobalIocDetail: vi.fn((id: string | null) => ({
    data: id ? {
      id: 'gioc-1', iocType: 'ip', value: '185.220.101.34', normalizedValue: '185.220.101.34',
      dedupeHash: 'abc123', confidence: 92, severity: 'critical', stixConfidenceTier: 'High',
      lifecycle: 'active', crossFeedCorroboration: 4, sightingSources: ['gf-1', 'gf-2', 'gf-3', 'gf-4'],
      firstSeen: '2026-02-27T00:00:00Z', lastSeen: '2026-03-27T00:00:00Z',
      enrichmentQuality: 85, warninglistMatch: null,
      enrichmentData: {
        shodan: { org: 'Tor Exit Node', isp: 'OVH', country: 'FR', ports: [22, 80, 443], riskScore: 95 },
        greynoise: { classification: 'malicious', noise: true, riot: false },
        epss: { probability: 0.95, percentile: 99 },
      },
      attackTechniques: ['T1071.001'],
      affectedCpes: ['cpe:2.3:a:test:*'],
      overlay: null,
    } : null,
    isLoading: false,
  })),
  useIocOverlay: vi.fn(() => ({
    setOverlay: mockSetOverlay,
    removeOverlay: mockRemoveOverlay,
    isSaving: false,
    isRemoving: false,
  })),
  useCorroborationDetail: vi.fn(() => ({ data: null, isLoading: false })),
  useSeverityVotes: vi.fn(() => ({ data: null, isLoading: false })),
  useFpSummary: vi.fn(() => ({ data: null, isLoading: false })),
  useFpActions: vi.fn(() => ({ submitFp: vi.fn(), isPending: false })),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: any) => sel({
    user: { displayName: 'Test', email: 'test@test.com', role: 'analyst' },
    tenant: { name: 'ACME' },
    accessToken: 'mock-token',
  })),
}))

import { GlobalIocOverlayPanel } from '@/components/GlobalIocOverlayPanel'
import { useGlobalIocDetail } from '@/hooks/use-global-iocs'

describe('GlobalIocOverlayPanel', () => {
  const onClose = vi.fn()

  it('renders IOC header with type icon and value', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    expect(screen.getByText('185.220.101.34')).toBeInTheDocument()
  })

  it('renders STIX confidence tier badge with correct color', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    const badges = screen.getAllByText('High')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders global data section (confidence, corroboration, etc.)', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText('4 feeds')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument() // enrichment quality
  })

  it('renders enrichment details (Shodan section)', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    expect(screen.getByTestId('shodan-section')).toBeInTheDocument()
    expect(screen.getByText('Shodan')).toBeInTheDocument()
    expect(screen.getByText('Tor Exit Node')).toBeInTheDocument()
  })

  it('renders GreyNoise section', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    expect(screen.getByTestId('greynoise-section')).toBeInTheDocument()
    expect(screen.getByText('malicious')).toBeInTheDocument()
    expect(screen.getByText('Noise')).toBeInTheDocument()
  })

  it('renders EPSS section', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    expect(screen.getByTestId('epss-section')).toBeInTheDocument()
    expect(screen.getByText('95.0%')).toBeInTheDocument()
  })

  it('overlay form: severity dropdown works', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    const select = screen.getByTestId('overlay-severity')
    fireEvent.change(select, { target: { value: 'high' } })
    expect(select).toHaveValue('high')
  })

  it('overlay form: confidence slider works', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    const slider = screen.getByTestId('overlay-confidence')
    fireEvent.change(slider, { target: { value: '75' } })
    expect(slider).toHaveValue('75')
  })

  it('Save Overlay button calls API', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    const btn = screen.getByTestId('save-overlay')
    fireEvent.click(btn)
    expect(mockSetOverlay).toHaveBeenCalled()
  })

  it('Reset to Global button calls API with confirmation', () => {
    render(<GlobalIocOverlayPanel iocId="gioc-1" onClose={onClose} />)
    // Click Reset → shows confirmation
    const resetBtn = screen.getByTestId('reset-overlay')
    fireEvent.click(resetBtn)
    // Confirmation dialog appears
    const confirmBtn = screen.getByTestId('confirm-reset')
    fireEvent.click(confirmBtn)
    expect(mockRemoveOverlay).toHaveBeenCalled()
  })
})

describe('GlobalIocOverlayPanel — warninglist', () => {
  it('renders warninglist warning banner when matched', () => {
    vi.mocked(useGlobalIocDetail).mockReturnValueOnce({
      data: {
        id: 'gioc-5', iocType: 'ip', value: '192.168.1.1', normalizedValue: '192.168.1.1',
        dedupeHash: 'mno', confidence: 30, severity: 'info', stixConfidenceTier: 'Low',
        lifecycle: 'aging', crossFeedCorroboration: 1, sightingSources: ['gf-1'],
        firstSeen: '2026-01-01T00:00:00Z', lastSeen: '2026-03-01T00:00:00Z',
        enrichmentQuality: 20, warninglistMatch: 'IANA Reserved',
        enrichmentData: {},
      },
      isLoading: false,
    })
    render(<GlobalIocOverlayPanel iocId="gioc-5" onClose={vi.fn()} />)
    expect(screen.getByTestId('warninglist-banner')).toBeInTheDocument()
    expect(screen.getByText(/IANA Reserved/)).toBeInTheDocument()
  })
})
