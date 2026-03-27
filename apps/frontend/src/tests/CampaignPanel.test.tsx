import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { CampaignPanel } from '@/components/campaigns/CampaignPanel'
import type { Campaign } from '@/hooks/use-campaigns'

const MOCK_CAMPAIGN: Campaign = {
  id: 'camp-1',
  name: 'APT29 SolarWinds Campaign',
  status: 'active',
  severity: 'critical',
  confidence: 85,
  firstSeen: '2024-12-01T00:00:00Z',
  lastSeen: '2025-03-15T00:00:00Z',
  iocCount: 47,
  iocTypes: { ip: 12, domain: 18, hash_sha256: 10, url: 7 },
  actors: ['APT29', 'Cozy Bear'],
  malwareFamilies: ['SUNBURST', 'TEARDROP'],
  techniques: ['T1190', 'T1059', 'T1078'],
}

describe('CampaignPanel', () => {
  it('renders campaign header with name and status badge', () => {
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} />)
    expect(screen.getByTestId('campaign-header')).toHaveTextContent('APT29 SolarWinds Campaign')
    expect(screen.getByTestId('campaign-status-badge')).toHaveTextContent('active')
  })

  it('active campaign shows green badge', () => {
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} />)
    const badge = screen.getByTestId('campaign-status-badge')
    expect(badge.className).toContain('text-sev-low')
  })

  it('historical campaign shows gray badge', () => {
    const historical = { ...MOCK_CAMPAIGN, status: 'historical' as const }
    render(<CampaignPanel campaign={historical} />)
    const badge = screen.getByTestId('campaign-status-badge')
    expect(badge.className).toContain('text-text-muted')
  })

  it('renders IOC breakdown grouped by type', () => {
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} />)
    expect(screen.getByTestId('ioc-type-ip')).toHaveTextContent('12')
    expect(screen.getByTestId('ioc-type-domain')).toHaveTextContent('18')
    expect(screen.getByTestId('ioc-type-hash_sha256')).toHaveTextContent('10')
    expect(screen.getByTestId('ioc-type-url')).toHaveTextContent('7')
  })

  it('renders linked actors as clickable buttons', () => {
    const onActorClick = vi.fn()
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} onActorClick={onActorClick} />)
    const actors = screen.getAllByTestId('related-actor')
    expect(actors).toHaveLength(2)
    fireEvent.click(actors[0])
    expect(onActorClick).toHaveBeenCalledWith('APT29')
  })

  it('renders linked malware as clickable buttons', () => {
    const onMalwareClick = vi.fn()
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} onMalwareClick={onMalwareClick} />)
    const malware = screen.getAllByTestId('related-malware')
    expect(malware).toHaveLength(2)
    fireEvent.click(malware[0])
    expect(onMalwareClick).toHaveBeenCalledWith('SUNBURST')
  })

  it('renders ATT&CK techniques as links', () => {
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} />)
    const techniques = screen.getAllByTestId('related-technique')
    expect(techniques).toHaveLength(3)
    expect(techniques[0]).toHaveAttribute('href', expect.stringContaining('attack.mitre.org'))
    expect(techniques[0]).toHaveAttribute('target', '_blank')
  })

  it('renders timeline events', () => {
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} />)
    expect(screen.getByTestId('campaign-timeline')).toBeInTheDocument()
  })

  it('renders campaign IOC total count', () => {
    render(<CampaignPanel campaign={MOCK_CAMPAIGN} />)
    expect(screen.getByTestId('campaign-iocs')).toHaveTextContent('47')
  })

  it('renders suspected campaign with amber badge', () => {
    const suspected = { ...MOCK_CAMPAIGN, status: 'suspected' as const }
    render(<CampaignPanel campaign={suspected} />)
    const badge = screen.getByTestId('campaign-status-badge')
    expect(badge.className).toContain('text-sev-medium')
  })
})
