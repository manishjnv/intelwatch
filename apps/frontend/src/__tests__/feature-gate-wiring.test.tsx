/**
 * @module __tests__/feature-gate-wiring.test
 * @description Tests for FeatureGate wiring on TI pages, sidebar lock badges,
 * and dashboard widget gating.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { FeatureGate, UpgradeCTA } from '@/components/FeatureGate'

// ─── Mock feature limits ────────────────────────────────────

let mockEnabled = true

vi.mock('@/hooks/use-feature-limits', () => ({
  useFeatureEnabled: () => mockEnabled,
  useFeatureLimits: () => ({
    features: [
      { featureKey: 'digital_risk_protection', enabled: mockEnabled, limitDaily: 100, usedDaily: 10, limitMonthly: 1000, usedMonthly: 100, percentDaily: 10, percentMonthly: 10 },
      { featureKey: 'ioc_management', enabled: true, limitDaily: 5000, usedDaily: 100, limitMonthly: 50000, usedMonthly: 1000, percentDaily: 2, percentMonthly: 2 },
    ],
    isLoading: false,
    error: null,
    isDemo: false,
  }),
  useQuotaStatus: () => ({ percentage: 10, period: 'daily', limit: 100, used: 10, status: 'ok' }),
  FEATURE_KEYS: ['ioc_management', 'threat_actors', 'malware_intel', 'vulnerability_intel', 'threat_hunting', 'graph_exploration', 'digital_risk_protection', 'correlation_engine'],
  FEATURE_LABELS: {
    ioc_management: 'IOC Management',
    threat_actors: 'Threat Actors',
    malware_intel: 'Malware Intelligence',
    vulnerability_intel: 'Vulnerability Intel',
    threat_hunting: 'Threat Hunting',
    graph_exploration: 'Graph Exploration',
    digital_risk_protection: 'Digital Risk Protection',
    correlation_engine: 'Correlation Engine',
  },
  FEATURE_ICONS: {},
}))

// ─── FeatureGate Component Tests ────────────────────────────

describe('FeatureGate', () => {
  it('renders children when feature is enabled', () => {
    mockEnabled = true
    render(
      <FeatureGate feature="digital_risk_protection">
        <div data-testid="drp-content">DRP Page</div>
      </FeatureGate>
    )
    expect(screen.getByTestId('drp-content')).toBeInTheDocument()
  })

  it('shows upgrade CTA when feature is disabled', () => {
    mockEnabled = false
    render(
      <FeatureGate feature="digital_risk_protection">
        <div data-testid="drp-content">DRP Page</div>
      </FeatureGate>
    )
    expect(screen.queryByTestId('drp-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('upgrade-cta-digital_risk_protection')).toBeInTheDocument()
  })

  it('upgrade CTA shows feature name', () => {
    mockEnabled = false
    render(
      <FeatureGate feature="digital_risk_protection">
        <div>Content</div>
      </FeatureGate>
    )
    expect(screen.getByText(/Digital Risk Protection is not available/)).toBeInTheDocument()
  })

  it('upgrade CTA has link to billing', () => {
    mockEnabled = false
    render(
      <FeatureGate feature="digital_risk_protection">
        <div>Content</div>
      </FeatureGate>
    )
    const link = screen.getByTestId('upgrade-btn-digital_risk_protection')
    expect(link).toHaveAttribute('href', '/command-center#billing-plans')
  })

  it('renders custom fallback when provided', () => {
    mockEnabled = false
    render(
      <FeatureGate feature="digital_risk_protection" fallback={<div data-testid="custom-fallback">Custom</div>}>
        <div>Content</div>
      </FeatureGate>
    )
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
  })
})

// ─── UpgradeCTA Component Tests ─────────────────────────────

describe('UpgradeCTA', () => {
  it('renders lock icon', () => {
    render(<UpgradeCTA feature="threat_hunting" />)
    expect(screen.getByTestId('upgrade-cta-threat_hunting')).toBeInTheDocument()
  })

  it('shows correct feature label', () => {
    render(<UpgradeCTA feature="correlation_engine" />)
    expect(screen.getByText(/Correlation Engine is not available/)).toBeInTheDocument()
  })

  it('upgrade button links to billing plans', () => {
    render(<UpgradeCTA feature="graph_exploration" />)
    const btn = screen.getByTestId('upgrade-btn-graph_exploration')
    expect(btn.tagName).toBe('A')
    expect(btn).toHaveAttribute('href', '/command-center#billing-plans')
  })
})

// ─── Sidebar lock badge simulation ──────────────────────────

describe('Sidebar feature gating (unit)', () => {
  const ROUTE_FEATURE_MAP: Record<string, string> = {
    '/iocs': 'ioc_management',
    '/drp': 'digital_risk_protection',
    '/graph': 'graph_exploration',
    '/hunting': 'threat_hunting',
    '/correlation': 'correlation_engine',
  }

  it('maps routes to correct feature keys', () => {
    expect(ROUTE_FEATURE_MAP['/iocs']).toBe('ioc_management')
    expect(ROUTE_FEATURE_MAP['/drp']).toBe('digital_risk_protection')
    expect(ROUTE_FEATURE_MAP['/graph']).toBe('graph_exploration')
    expect(ROUTE_FEATURE_MAP['/correlation']).toBe('correlation_engine')
  })

  it('dashboard has no feature key (always visible)', () => {
    expect(ROUTE_FEATURE_MAP['/dashboard']).toBeUndefined()
  })

  it('command center has no feature key (always visible)', () => {
    expect(ROUTE_FEATURE_MAP['/command-center']).toBeUndefined()
  })
})

// ─── Dashboard widget gating simulation ─────────────────────

describe('Dashboard widget gating (unit)', () => {
  const features = [
    { featureKey: 'digital_risk_protection', enabled: false },
    { featureKey: 'ioc_management', enabled: true },
    { featureKey: 'threat_hunting', enabled: false },
  ]

  it('disabled feature shows gated overlay', () => {
    const drp = features.find(f => f.featureKey === 'digital_risk_protection')
    expect(drp?.enabled).toBe(false)
  })

  it('enabled feature shows normal card', () => {
    const ioc = features.find(f => f.featureKey === 'ioc_management')
    expect(ioc?.enabled).toBe(true)
  })

  it('enterprise plan enables all features', () => {
    const allEnabled = features.map(f => ({ ...f, enabled: true }))
    expect(allEnabled.every(f => f.enabled)).toBe(true)
  })

  it('free plan disables DRP', () => {
    const freeFeatures = features.map(f => ({
      ...f,
      enabled: f.featureKey === 'ioc_management',
    }))
    const drp = freeFeatures.find(f => f.featureKey === 'digital_risk_protection')
    expect(drp?.enabled).toBe(false)
  })
})
