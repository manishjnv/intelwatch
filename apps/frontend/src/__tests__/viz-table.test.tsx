/**
 * Tests for table-enhancement viz components:
 * - FlipDetailCard (#6)
 * - SplitPane (#7)
 * - QuickActionToolbar (#9)
 * - EntityPreview (#3)
 * - SparklineCell (#8)
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

import { FlipDetailCard, IOCSummaryFront, IOCDetailBack } from '@/components/viz/FlipDetailCard'
import { SplitPane } from '@/components/viz/SplitPane'
import { QuickActionToolbar } from '@/components/viz/QuickActionToolbar'
import { EntityPreview } from '@/components/viz/EntityPreview'
import { SparklineCell, generateStubTrend } from '@/components/viz/SparklineCell'

/* ================================================================ */
/* FlipDetailCard (#6)                                               */
/* ================================================================ */
describe('FlipDetailCard', () => {
  const front = <div data-testid="front-content">Front</div>
  const back = <div data-testid="back-content">Back</div>

  it('renders the flip card container', () => {
    render(<FlipDetailCard isFlipped={false} front={front} back={back} />)
    expect(screen.getByTestId('flip-card')).toBeInTheDocument()
  })

  it('renders front face', () => {
    render(<FlipDetailCard isFlipped={false} front={front} back={back} />)
    expect(screen.getByTestId('front-content')).toBeInTheDocument()
  })

  it('renders back face', () => {
    render(<FlipDetailCard isFlipped={true} front={front} back={back} />)
    expect(screen.getByTestId('back-content')).toBeInTheDocument()
  })

  it('applies className prop', () => {
    render(<FlipDetailCard isFlipped={false} front={front} back={back} className="custom-class" />)
    expect(screen.getByTestId('flip-card')).toHaveClass('custom-class')
  })

  it('has perspective style for 3D effect', () => {
    render(<FlipDetailCard isFlipped={false} front={front} back={back} />)
    expect(screen.getByTestId('flip-card')).toHaveStyle({ perspective: '1200px' })
  })

  it('renders both front and back content simultaneously', () => {
    render(<FlipDetailCard isFlipped={false} front={front} back={back} />)
    expect(screen.getByTestId('front-content')).toBeInTheDocument()
    expect(screen.getByTestId('back-content')).toBeInTheDocument()
  })
})

describe('IOCSummaryFront', () => {
  const record = { normalizedValue: '1.2.3.4', iocType: 'ip', severity: 'critical', confidence: 85, tags: ['botnet', 'c2'] }

  it('renders IOC value', () => {
    render(<IOCSummaryFront record={record} />)
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
  })

  it('renders severity badge', () => {
    render(<IOCSummaryFront record={record} />)
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('renders confidence', () => {
    render(<IOCSummaryFront record={record} />)
    expect(screen.getByText('Conf: 85%')).toBeInTheDocument()
  })

  it('renders tags', () => {
    render(<IOCSummaryFront record={record} />)
    expect(screen.getByText('botnet')).toBeInTheDocument()
    expect(screen.getByText('c2')).toBeInTheDocument()
  })
})

describe('IOCDetailBack', () => {
  const record = {
    normalizedValue: '1.2.3.4', iocType: 'ip', severity: 'high', confidence: 70,
    firstSeen: '2026-03-20', lastSeen: '2026-03-21', tlp: 'amber', lifecycle: 'active',
    threatActors: ['APT28'], malwareFamilies: ['Emotet'],
  }

  it('renders detail heading', () => {
    render(<IOCDetailBack record={record} onFlipBack={vi.fn()} />)
    expect(screen.getByText('IOC Detail')).toBeInTheDocument()
  })

  it('renders threat actors', () => {
    render(<IOCDetailBack record={record} onFlipBack={vi.fn()} />)
    expect(screen.getByText('APT28')).toBeInTheDocument()
  })

  it('renders malware families', () => {
    render(<IOCDetailBack record={record} onFlipBack={vi.fn()} />)
    expect(screen.getByText('Emotet')).toBeInTheDocument()
  })

  it('calls onFlipBack when back button clicked', () => {
    const onFlip = vi.fn()
    render(<IOCDetailBack record={record} onFlipBack={onFlip} />)
    fireEvent.click(screen.getByText('← Back'))
    expect(onFlip).toHaveBeenCalledOnce()
  })
})

/* ================================================================ */
/* SplitPane (#7)                                                    */
/* ================================================================ */
describe('SplitPane', () => {
  it('renders left content when showRight is false', () => {
    render(<SplitPane left={<div>Left</div>} right={null} showRight={false} />)
    expect(screen.getByText('Left')).toBeInTheDocument()
    expect(screen.getByTestId('split-pane')).toBeInTheDocument()
  })

  it('renders both panes when showRight is true', () => {
    render(<SplitPane left={<div>Left</div>} right={<div>Right</div>} showRight={true} />)
    // Desktop + mobile layouts both render (hidden via CSS), so multiple matches
    expect(screen.getAllByText('Left').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Right').length).toBeGreaterThanOrEqual(1)
  })

  it('renders draggable divider when showRight', () => {
    render(<SplitPane left={<div>L</div>} right={<div>R</div>} showRight={true} />)
    expect(screen.getByTestId('split-divider')).toBeInTheDocument()
  })

  it('does not render divider when showRight is false', () => {
    render(<SplitPane left={<div>L</div>} right={null} showRight={false} />)
    expect(screen.queryByTestId('split-divider')).not.toBeInTheDocument()
  })

  it('applies className prop', () => {
    render(<SplitPane left={<div>L</div>} right={null} showRight={false} className="my-split" />)
    expect(screen.getByTestId('split-pane')).toHaveClass('my-split')
  })

  it('renders left pane with correct initial width', () => {
    render(<SplitPane left={<div>L</div>} right={<div>R</div>} showRight={true} defaultSplit={70} />)
    // Desktop + mobile both render split-left; desktop one has inline width
    const leftPanes = screen.getAllByTestId('split-left')
    const withWidth = leftPanes.find(el => el.style.width === '70%')
    expect(withWidth).toBeTruthy()
  })
})

/* ================================================================ */
/* QuickActionToolbar (#9)                                           */
/* ================================================================ */
describe('QuickActionToolbar', () => {
  it('is hidden when selectedCount is 0', () => {
    render(<QuickActionToolbar selectedCount={0} />)
    expect(screen.queryByTestId('quick-action-toolbar')).not.toBeInTheDocument()
  })

  it('appears when selectedCount > 0', () => {
    render(<QuickActionToolbar selectedCount={3} />)
    expect(screen.getByTestId('quick-action-toolbar')).toBeInTheDocument()
  })

  it('displays selection count', () => {
    render(<QuickActionToolbar selectedCount={5} />)
    expect(screen.getByTestId('selection-count')).toHaveTextContent('5 selected')
  })

  it('renders 4 action buttons', () => {
    render(<QuickActionToolbar selectedCount={1} />)
    expect(screen.getByTestId('action-export')).toBeInTheDocument()
    expect(screen.getByTestId('action-tag')).toBeInTheDocument()
    expect(screen.getByTestId('action-compare')).toBeInTheDocument()
    expect(screen.getByTestId('action-archive')).toBeInTheDocument()
  })

  it('calls onExport when export clicked', () => {
    const onExport = vi.fn()
    render(<QuickActionToolbar selectedCount={1} onExport={onExport} />)
    fireEvent.click(screen.getByTestId('action-export'))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('calls onClear when clear clicked', () => {
    const onClear = vi.fn()
    render(<QuickActionToolbar selectedCount={1} onClear={onClear} />)
    fireEvent.click(screen.getByTestId('action-clear'))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('calls onTag when tag clicked', () => {
    const onTag = vi.fn()
    render(<QuickActionToolbar selectedCount={1} onTag={onTag} />)
    fireEvent.click(screen.getByTestId('action-tag'))
    expect(onTag).toHaveBeenCalledOnce()
  })

  it('calls onArchive when archive clicked', () => {
    const onArchive = vi.fn()
    render(<QuickActionToolbar selectedCount={1} onArchive={onArchive} />)
    fireEvent.click(screen.getByTestId('action-archive'))
    expect(onArchive).toHaveBeenCalledOnce()
  })
})

/* ================================================================ */
/* EntityPreview (#3)                                                */
/* ================================================================ */
describe('EntityPreview', () => {
  it('renders children (EntityChip)', () => {
    render(
      <EntityPreview type="ip" value="1.2.3.4">
        <span data-testid="chip">1.2.3.4</span>
      </EntityPreview>
    )
    expect(screen.getByTestId('chip')).toBeInTheDocument()
  })

  it('renders trigger wrapper', () => {
    render(
      <EntityPreview type="ip" value="1.2.3.4">
        <span>chip</span>
      </EntityPreview>
    )
    expect(screen.getByTestId('entity-preview-trigger')).toBeInTheDocument()
  })

  it('does not show preview card by default', () => {
    render(
      <EntityPreview type="ip" value="1.2.3.4">
        <span>chip</span>
      </EntityPreview>
    )
    expect(screen.queryByTestId('entity-preview-card')).not.toBeInTheDocument()
  })

  it('passes through children unchanged', () => {
    render(
      <EntityPreview type="domain" value="evil.com" severity="high">
        <span data-testid="chip" className="original-class">evil.com</span>
      </EntityPreview>
    )
    const chip = screen.getByTestId('chip')
    expect(chip).toHaveClass('original-class')
    expect(chip).toHaveTextContent('evil.com')
  })
})

/* ================================================================ */
/* SparklineCell (#8)                                                */
/* ================================================================ */
describe('SparklineCell', () => {
  it('renders an SVG element', () => {
    render(<SparklineCell data={[10, 20, 15, 30, 25, 40, 35]} />)
    expect(screen.getByTestId('sparkline')).toBeInTheDocument()
    expect(screen.getByTestId('sparkline').tagName).toBe('svg')
  })

  it('renders with custom width and height', () => {
    render(<SparklineCell data={[1, 2, 3]} width={60} height={20} />)
    const svg = screen.getByTestId('sparkline')
    expect(svg).toHaveAttribute('width', '60')
    expect(svg).toHaveAttribute('height', '20')
  })

  it('renders empty state for insufficient data', () => {
    const { container } = render(<SparklineCell data={[5]} />)
    expect(screen.queryByTestId('sparkline')).not.toBeInTheDocument()
    expect(container.querySelector('.bg-bg-elevated\\/30')).toBeInTheDocument()
  })

  it('contains a polyline element', () => {
    const { container } = render(<SparklineCell data={[1, 5, 3, 7, 2]} />)
    expect(container.querySelector('polyline')).toBeInTheDocument()
  })

  it('contains an endpoint circle', () => {
    const { container } = render(<SparklineCell data={[1, 5, 3, 7, 2]} />)
    expect(container.querySelector('circle')).toBeInTheDocument()
  })

  it('generateStubTrend returns 7 values', () => {
    const data = generateStubTrend('test-id-123')
    expect(data).toHaveLength(7)
    data.forEach(v => expect(v).toBeGreaterThanOrEqual(0))
  })

  it('generateStubTrend is deterministic', () => {
    const a = generateStubTrend('same-seed')
    const b = generateStubTrend('same-seed')
    expect(a).toEqual(b)
  })

  it('generateStubTrend varies by seed', () => {
    const a = generateStubTrend('seed-a')
    const b = generateStubTrend('seed-b')
    expect(a).not.toEqual(b)
  })
})
