/**
 * @module __tests__/honest-dashboard-widgets
 * @description DECISION-048 honest-dashboard sweep for the 12 widgets that read
 * useAnalyticsDashboard(). No `isDemo` field, no fabricated fallback data —
 * loading/error states must never render demo values; headline scalars show
 * '—' on loading/error; empty arrays show the widget's honest empty state.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

const TECH_PROFILE = {
  industry: 'Technology' as const,
  techStack: { os: [], cloud: [], network: [], database: [], web: [] },
  businessRisk: ['DataBreach' as const],
  orgSize: 'enterprise' as const,
  geography: { country: 'US', region: 'North America' },
}

const EMPTY_ANALYTICS = {
  topCves: [] as { id: string; epss: number; severity: string; affectedProducts: number }[],
  alertTrend: [] as { date: string; count: number; breakdown?: Record<string, number> }[],
  iocTrend: [] as { date: string; count: number; breakdown?: Record<string, number> }[],
  iocBySeverity: {} as Record<string, number>,
  topIocs: [] as { type: string; value: string; confidence?: number; severity: string; corroboration?: number }[],
  topActors: [] as { name: string; iocCount: number; lastSeen: string }[],
  feedHealth: [] as { name: string; reliability: number; iocsPerDay: number }[],
  summary: { totalIocs: 0, totalArticles: 0, totalFeeds: 0, totalAlerts: 0, avgConfidence: null as number | null, avgEnrichmentQuality: null as number | null, pipelineThroughput: 0 },
  isLoading: false,
  isError: false,
  error: null as unknown,
  dateRange: { preset: '7d' as const, from: '', to: '' },
  setPreset: vi.fn(),
  setCustomRange: vi.fn(),
  refetch: vi.fn(),
  isFetching: false,
  dataUpdatedAt: Date.now(),
}

const REAL_ANALYTICS: typeof EMPTY_ANALYTICS = {
  ...EMPTY_ANALYTICS,
  topCves: [{ id: 'CVE-2025-1234', epss: 0.85, severity: 'critical', affectedProducts: 12 }],
  alertTrend: [
    { date: '2026-04-01', count: 5, breakdown: { critical: 2, high: 3 } },
    { date: '2026-04-02', count: 7, breakdown: { critical: 3, high: 2, medium: 2 } },
  ],
  iocTrend: [
    { date: '2026-04-01', count: 20 },
    { date: '2026-04-02', count: 25 },
  ],
  iocBySeverity: { critical: 30, high: 50, medium: 80, low: 20, info: 10 },
  topIocs: [
    { type: 'ip', value: '185.220.101.34', confidence: 92, severity: 'critical', corroboration: 5 },
  ],
  topActors: [{ name: 'APT28', iocCount: 23, lastSeen: '2026-04-01' }],
  feedHealth: [{ name: 'CISA KEV', reliability: 92, iocsPerDay: 40 }],
  summary: { totalIocs: 4287, totalArticles: 17842, totalFeeds: 12, totalAlerts: 247, avgConfidence: 72, avgEnrichmentQuality: 84, pipelineThroughput: 156 },
}

let mockAnalytics: typeof EMPTY_ANALYTICS = { ...EMPTY_ANALYTICS }

vi.mock('@/hooks/use-analytics-dashboard', () => ({
  useAnalyticsDashboard: () => mockAnalytics,
}))

vi.mock('@/components/command-center/charts', () => ({
  MiniSparkline: ({ values }: { values: number[] }) => (
    <span data-testid="mini-sparkline">{values.length} points</span>
  ),
}))

import { AttackTechniqueWidget } from '@/components/widgets/AttackTechniqueWidget'
import { FeedHealthWidget } from '@/components/widgets/FeedHealthWidget'
import { FeedValueWidget } from '@/components/widgets/FeedValueWidget'
import { IocTrendWidget } from '@/components/widgets/IocTrendWidget'
import { ProfileMatchWidget } from '@/components/widgets/ProfileMatchWidget'
import { RecentAlertsWidget } from '@/components/widgets/RecentAlertsWidget'
import { SeverityTrendWidget } from '@/components/widgets/SeverityTrendWidget'
import { ThreatBriefingWidget } from '@/components/widgets/ThreatBriefingWidget'
import { ThreatLandscapeBanner } from '@/components/widgets/ThreatLandscapeBanner'
import { ThreatScoreWidget } from '@/components/widgets/ThreatScoreWidget'
import { TopActorsWidget } from '@/components/widgets/TopActorsWidget'
import { TopCvesWidget } from '@/components/widgets/TopCvesWidget'

function reset() {
  mockAnalytics = { ...EMPTY_ANALYTICS }
}

describe('AttackTechniqueWidget — honest', () => {
  it('empty/loading=false renders without crashing, no Demo text', () => {
    reset()
    render(<AttackTechniqueWidget />)
    expect(screen.getByTestId('attack-technique-widget')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })
})

describe('FeedHealthWidget — honest', () => {
  it('empty data renders honest empty state, no Demo text', () => {
    reset()
    render(<FeedHealthWidget />)
    expect(screen.getByTestId('feed-health-widget')).toBeInTheDocument()
    expect(screen.getByText('No feeds configured')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('isError shows honest empty state (feedHealth stays empty)', () => {
    reset()
    mockAnalytics = { ...EMPTY_ANALYTICS, isError: true }
    render(<FeedHealthWidget />)
    expect(screen.getByText('No feeds configured')).toBeInTheDocument()
  })

  it('real data renders real feed rows', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<FeedHealthWidget />)
    expect(screen.getByText('CISA KEV')).toBeInTheDocument()
  })
})

describe('FeedValueWidget — honest', () => {
  it('empty feedHealth shows honest empty state, no DEMO_QUALITY names', () => {
    reset()
    render(<FeedValueWidget />)
    expect(screen.getByTestId('feed-value-widget')).toBeInTheDocument()
    expect(screen.getByText('No feed data available')).toBeInTheDocument()
    expect(screen.queryByText('AlienVault OTX')).not.toBeInTheDocument()
    expect(screen.queryByText('Abuse.ch URLhaus')).not.toBeInTheDocument()
    expect(screen.queryByText('MISP Community')).not.toBeInTheDocument()
    expect(screen.queryByText('PhishTank')).not.toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('isError keeps empty state, no demo names', () => {
    reset()
    mockAnalytics = { ...EMPTY_ANALYTICS, isError: true }
    render(<FeedValueWidget />)
    expect(screen.getByText('No feed data available')).toBeInTheDocument()
  })

  it('real data scores real feeds', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<FeedValueWidget />)
    expect(screen.getByText('CISA KEV')).toBeInTheDocument()
  })
})

describe('IocTrendWidget — honest', () => {
  it('empty data + not loading renders without crashing, total is 0', () => {
    reset()
    render(<IocTrendWidget />)
    expect(screen.getByTestId('ioc-trend-widget')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('isError shows "—" instead of a fabricated total', () => {
    reset()
    mockAnalytics = { ...EMPTY_ANALYTICS, isError: true }
    render(<IocTrendWidget />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('isLoading shows "—"', () => {
    reset()
    mockAnalytics = { ...EMPTY_ANALYTICS, isLoading: true }
    render(<IocTrendWidget />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('real data shows the real total', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<IocTrendWidget />)
    expect(screen.getByText('45')).toBeInTheDocument() // 20 + 25
  })
})

describe('ProfileMatchWidget — honest', () => {
  it('empty topIocs shows honest empty state, no Demo text', () => {
    reset()
    render(<ProfileMatchWidget profile={TECH_PROFILE} />)
    expect(screen.getByTestId('profile-match-empty')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('real data can render matches', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<ProfileMatchWidget profile={TECH_PROFILE} />)
    expect(screen.getByTestId('profile-match-widget')).toBeInTheDocument()
  })
})

describe('RecentAlertsWidget — honest', () => {
  it('empty alertTrend renders honest empty state, no Demo text', () => {
    reset()
    render(<RecentAlertsWidget />)
    expect(screen.getByText('No recent alerts')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('real data renders real alert rows', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<RecentAlertsWidget />)
    expect(screen.getByTestId('recent-alerts-widget')).toBeInTheDocument()
  })
})

describe('SeverityTrendWidget — honest', () => {
  it('empty/short iocTrend shows honest empty state, no Demo text', () => {
    reset()
    render(<SeverityTrendWidget />)
    expect(screen.getByText('Not enough data for trend')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('real data with 2+ points renders sparklines', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<SeverityTrendWidget />)
    expect(screen.getAllByTestId('mini-sparkline').length).toBe(4)
  })
})

describe('ThreatBriefingWidget — honest', () => {
  it('empty data + not loading renders without crashing, no Demo text', () => {
    reset()
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByTestId('threat-briefing-widget')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('isError shows "—" for headline scalars, not 0 or demo values', () => {
    reset()
    mockAnalytics = { ...EMPTY_ANALYTICS, isError: true }
    render(<ThreatBriefingWidget profile={null} />)
    const widget = screen.getByTestId('threat-briefing-widget')
    expect(widget).toHaveTextContent('—')
    expect(screen.queryByText('4,287')).not.toBeInTheDocument()
  })

  it('isLoading shows "—" for headline scalars', () => {
    reset()
    mockAnalytics = { ...EMPTY_ANALYTICS, isLoading: true }
    render(<ThreatBriefingWidget profile={null} />)
    const widget = screen.getByTestId('threat-briefing-widget')
    expect(widget).toHaveTextContent('—')
  })

  it('real data shows real critical count and top actor', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('APT28')).toBeInTheDocument()
  })
})

describe('ThreatLandscapeBanner — honest', () => {
  it('empty topIocs renders without crashing, no Demo text', () => {
    reset()
    render(<ThreatLandscapeBanner profile={TECH_PROFILE} />)
    expect(screen.getByTestId('threat-landscape-banner')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('real data can render priority threats', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<ThreatLandscapeBanner profile={TECH_PROFILE} />)
    expect(screen.getByTestId('threat-landscape-banner')).toBeInTheDocument()
  })
})

describe('ThreatScoreWidget — honest', () => {
  it('empty topIocs shows honest empty state, no Demo text', () => {
    reset()
    render(<ThreatScoreWidget profile={null} />)
    expect(screen.getByText('No scored IOCs yet')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('real data computes and renders a real score', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<ThreatScoreWidget profile={null} />)
    expect(screen.getByText('185.220.101.34')).toBeInTheDocument()
  })
})

describe('TopActorsWidget — honest', () => {
  it('empty topActors shows honest empty state, no Demo text', () => {
    reset()
    render(<TopActorsWidget profile={null} />)
    expect(screen.getByText('No threat actors tracked yet')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('real data renders real actor names', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<TopActorsWidget profile={null} />)
    expect(screen.getByText('APT28')).toBeInTheDocument()
  })
})

describe('TopCvesWidget — honest', () => {
  it('empty topCves shows honest empty state, no Demo text', () => {
    reset()
    render(<TopCvesWidget />)
    expect(screen.getByText('No CVEs tracked yet')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('real data renders the real CVE id', () => {
    reset()
    mockAnalytics = { ...REAL_ANALYTICS }
    render(<TopCvesWidget />)
    expect(screen.getByText('CVE-2025-1234')).toBeInTheDocument()
  })
})
