import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

vi.mock('@/hooks/use-intel-data', () => ({
  useActors: () => ({
    data: { data: [{ id: 'a1', name: 'APT29', aliases: [], actorType: 'nation_state', motivation: 'espionage', sophistication: 'expert', country: 'Russia', confidence: 85, tlp: 'amber', tags: [], active: true, firstSeen: null, lastSeen: null }], total: 1, page: 1, limit: 50 },
    isLoading: false, isDemo: false,
  }),
  useActorDetail: () => ({ data: { mitreTechniques: ['T1059'] } }),
}))

vi.mock('@/hooks/use-linked-iocs', () => ({
  useLinkedIocs: () => ({
    iocs: [{ id: 'li1', iocType: 'ip', normalizedValue: '1.2.3.4', severity: 'high' }],
    totalCount: 1, filteredCount: 1, isLoading: false, isDemo: true,
    typeFilter: 'all', setTypeFilter: vi.fn(), sevFilter: 'all', setSevFilter: vi.fn(),
    sortKey: 'confidence', setSortKey: vi.fn(), hasMore: false, loadMore: vi.fn(),
    typeBreakdown: { ip: 1 }, sevBreakdown: { high: 1 },
  }),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (v: any) => v }))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: any) => (
    <div data-testid="split-pane">
      <div data-testid="split-left">{left}</div>
      {showRight && <div data-testid="split-right">{right}</div>}
    </div>
  ),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div>{children}</div>,
  CompactStat: ({ value }: any) => <span>{value}</span>,
}))

import { ThreatActorListPage } from '@/pages/ThreatActorListPage'

describe('ActorLinkedIocs', () => {
  it('actor detail page shows Linked IOCs section', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT29'))
    expect(screen.getByTestId('linked-iocs-section')).toBeInTheDocument()
  })

  it('LinkedIocsSection receives entityType=actor', () => {
    render(<ThreatActorListPage />)
    fireEvent.click(screen.getByText('APT29'))
    expect(screen.getByTestId('actor-ioc-section')).toBeInTheDocument()
  })
})
