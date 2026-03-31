/** Tenant-admin settings view — org profile, quality, alerts, notifications, onboarding, upgrade. */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter } from '@/hooks/use-command-center'
import type {
  OrgProfile, Industry, AlertSensitivity,
  DigestFrequency, NotificationPrefs, OnboardingProgress,
} from '@/types/org-profile'
import {
  INDUSTRIES, BUSINESS_RISKS, ORG_SIZES, TECH_STACK_OPTIONS, DEMO_ORG_PROFILE,
} from '@/types/org-profile'
import {
  CheckCircle, Shield, Building2, AlertTriangle, Rocket, TrendingUp,
  ChevronRight, Clock, Mail, Volume2, VolumeX, Check, Circle,
} from 'lucide-react'
import { MiniSparkline } from './charts'

const SENSITIVITY_OPTS: { value: AlertSensitivity; label: string; desc: string }[] = [
  { value: 'low', label: 'Low', desc: 'Only critical & high severity alerts. Fewer notifications, only confirmed threats.' },
  { value: 'balanced', label: 'Balanced', desc: 'Critical, high, and medium severity. Good balance between noise and coverage.' },
  { value: 'aggressive', label: 'Aggressive', desc: 'All severity levels including low. Maximum coverage, more notifications.' },
]
const PLAN_BADGE: Record<string, string> = { free: 'bg-text-muted/20 text-text-muted', starter: 'bg-sev-low/20 text-sev-low', teams: 'bg-accent/20 text-accent', enterprise: 'bg-purple-400/20 text-purple-400' }
const PLAN_FEATURES = [
  { name: 'IOC Processing', free: '100/mo', starter: '10,000/mo', teams: '50,000/mo' },
  { name: 'AI Enrichment', free: 'None', starter: 'Basic', teams: 'Full' },
  { name: 'Alert Rules', free: '3', starter: '25', teams: 'Unlimited' },
  { name: 'Team Members', free: '1', starter: '5', teams: '25' },
  { name: 'Integrations', free: 'None', starter: '3', teams: 'Unlimited' },
]

export function TenantSettings({ data }: { data: ReturnType<typeof useCommandCenter> }) {
  const plan = data.tenantPlan
  const isFree = plan === 'free'

  const [orgProfile, setOrgProfile] = useState<OrgProfile>(DEMO_ORG_PROFILE)
  const [sensitivity, setSensitivity] = useState<AlertSensitivity>('balanced')
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    digestFrequency: 'daily', realTimeAlerts: true, quietHoursStart: '22:00', quietHoursEnd: '07:00',
  })
  const [onboarding] = useState<OnboardingProgress>({
    profile: true, firstFeed: true, inviteTeam: false, configureAlerts: false,
  })

  const enrichmentAccuracy = 87, enrichedThisMonth = 3_200
  const accuracyTrend = [82, 84, 85, 83, 86, 87, 87]
  const onboardingSteps = [
    { key: 'profile', label: 'Complete org profile', done: onboarding.profile },
    { key: 'firstFeed', label: 'Add first feed', done: onboarding.firstFeed },
    { key: 'inviteTeam', label: 'Invite team members', done: onboarding.inviteTeam },
    { key: 'configureAlerts', label: 'Configure alerts', done: onboarding.configureAlerts },
  ]
  const completedSteps = onboardingSteps.filter(s => s.done).length

  return (
    <div data-testid="settings-tab-tenant" className="space-y-6 max-w-3xl">
      {/* Org Profile */}
      <section data-testid="org-profile-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-400" /> Organization Profile
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-muted block mb-1">Industry</label>
            <select
              data-testid="industry-select"
              value={orgProfile.industry}
              onChange={e => setOrgProfile(p => ({ ...p, industry: e.target.value as Industry }))}
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-2">Tech Stack</label>
            {(Object.entries(TECH_STACK_OPTIONS) as [keyof typeof TECH_STACK_OPTIONS, string[]][]).map(([group, options]) => (
              <div key={group} className="mb-2">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">{group}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {options.map(opt => {
                    const selected = orgProfile.techStack[group].includes(opt)
                    return (
                      <button
                        key={opt}
                        data-testid={`tech-${group}-${opt.replace(/\s/g, '-').toLowerCase()}`}
                        onClick={() => {
                          setOrgProfile(p => ({
                            ...p,
                            techStack: {
                              ...p.techStack,
                              [group]: selected
                                ? p.techStack[group].filter(v => v !== opt)
                                : [...p.techStack[group], opt],
                            },
                          }))
                        }}
                        className={cn(
                          'px-2 py-1 rounded text-[11px] font-medium transition-colors border',
                          selected
                            ? 'bg-accent/10 text-accent border-accent/30'
                            : 'bg-bg-primary text-text-muted border-border hover:text-text-primary',
                        )}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-2">Business Risk Priorities</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BUSINESS_RISKS.map(risk => {
                const checked = orgProfile.businessRisk.includes(risk.value)
                return (
                  <label key={risk.value} className="flex items-center gap-2 cursor-pointer" data-testid={`risk-${risk.value}`}>
                    <button
                      onClick={() => {
                        setOrgProfile(p => ({
                          ...p,
                          businessRisk: checked
                            ? p.businessRisk.filter(r => r !== risk.value)
                            : [...p.businessRisk, risk.value],
                        }))
                      }}
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                        checked ? 'bg-brand border-brand' : 'border-border',
                      )}
                    >
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="text-xs text-text-secondary">{risk.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-2">Organization Size</label>
            <div className="grid grid-cols-2 gap-2">
              {ORG_SIZES.map(size => (
                <button
                  key={size.value}
                  data-testid={`size-${size.value}`}
                  onClick={() => setOrgProfile(p => ({ ...p, orgSize: size.value }))}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors',
                    orgProfile.orgSize === size.value
                      ? 'border-brand bg-brand/10 text-accent'
                      : 'border-border bg-bg-primary text-text-muted hover:text-text-primary',
                  )}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Country</label>
              <input
                data-testid="geography-country"
                type="text"
                value={orgProfile.geography.country}
                onChange={e => setOrgProfile(p => ({ ...p, geography: { ...p.geography, country: e.target.value } }))}
                className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary"
                placeholder="e.g. India"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Region</label>
              <input
                data-testid="geography-region"
                type="text"
                value={orgProfile.geography.region}
                onChange={e => setOrgProfile(p => ({ ...p, geography: { ...p.geography, region: e.target.value } }))}
                className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary"
                placeholder="e.g. Asia"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Intelligence Quality */}
      <section data-testid="intelligence-quality-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-sev-low" /> Intelligence Quality
        </h2>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-primary)" strokeWidth="6" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={enrichmentAccuracy >= 85 ? 'var(--sev-low)' : enrichmentAccuracy >= 70 ? 'var(--sev-medium)' : 'var(--sev-high)'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(enrichmentAccuracy / 100) * 213.6} 213.6`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-text-primary">{enrichmentAccuracy}%</span>
            </div>
            <span className="text-[10px] text-text-muted mt-1">Accuracy</span>
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <span className="text-[10px] text-text-muted">Accuracy Trend (7d)</span>
              <MiniSparkline values={accuracyTrend} height={24} width={120} />
            </div>
            <div>
              <span className="text-[10px] text-text-muted block">Items enriched this month</span>
              <span className="text-sm font-semibold text-text-primary tabular-nums">{enrichedThisMonth.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Alert Sensitivity */}
      <section data-testid="alert-sensitivity-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-sev-medium" /> Alert Sensitivity
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SENSITIVITY_OPTS.map(opt => (
            <button
              key={opt.value}
              data-testid={`sensitivity-${opt.value}`}
              onClick={() => setSensitivity(opt.value)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                sensitivity === opt.value
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-bg-primary hover:border-brand/30',
              )}
            >
              <span className="text-xs font-semibold text-text-primary">{opt.label}</span>
              <p className="text-[10px] text-text-muted mt-1">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section data-testid="notifications-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent" /> Notifications
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-muted block mb-2">Email Digest</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'off'] as DigestFrequency[]).map(freq => (
                <button
                  key={freq}
                  data-testid={`digest-${freq}`}
                  onClick={() => setNotifications(n => ({ ...n, digestFrequency: freq }))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    notifications.digestFrequency === freq
                      ? 'border-brand bg-brand/10 text-accent'
                      : 'border-border text-text-muted hover:text-text-primary',
                  )}
                >
                  {freq === 'off' ? 'Off' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              {notifications.realTimeAlerts ? <Volume2 className="w-3.5 h-3.5 text-sev-low" /> : <VolumeX className="w-3.5 h-3.5 text-text-muted" />}
              <span className="text-xs text-text-secondary">Real-time alerts</span>
            </div>
            <button
              data-testid="toggle-realtime"
              onClick={() => setNotifications(n => ({ ...n, realTimeAlerts: !n.realTimeAlerts }))}
              className={cn('w-9 h-5 rounded-full transition-colors relative', notifications.realTimeAlerts ? 'bg-brand' : 'bg-bg-primary border border-border')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', notifications.realTimeAlerts ? 'left-4' : 'left-0.5')} />
            </button>
          </label>

          <div>
            <label className="text-xs text-text-muted block mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Quiet Hours
            </label>
            <div className="flex items-center gap-2">
              <input
                data-testid="quiet-start"
                type="time"
                value={notifications.quietHoursStart}
                onChange={e => setNotifications(n => ({ ...n, quietHoursStart: e.target.value }))}
                className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary"
              />
              <span className="text-xs text-text-muted">to</span>
              <input
                data-testid="quiet-end"
                type="time"
                value={notifications.quietHoursEnd}
                onChange={e => setNotifications(n => ({ ...n, quietHoursEnd: e.target.value }))}
                className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Onboarding */}
      <section data-testid="onboarding-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Rocket className="w-4 h-4 text-accent" /> Setup Progress
        </h2>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted">{completedSteps} of {onboardingSteps.length} complete</span>
            <span className="text-xs font-semibold text-text-primary">{Math.round((completedSteps / onboardingSteps.length) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          {onboardingSteps.map(step => (
            <div key={step.key} className="flex items-center gap-2.5">
              {step.done ? (
                <CheckCircle className="w-4 h-4 text-sev-low shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-text-muted shrink-0" />
              )}
              <span className={cn('text-xs', step.done ? 'text-text-secondary line-through' : 'text-text-primary')}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
        {completedSteps < onboardingSteps.length && (
          <button
            data-testid="resume-wizard-btn"
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            <ChevronRight className="w-3 h-3" /> Resume Setup Wizard
          </button>
        )}
      </section>

      {/* Upgrade CTA (free only) */}
      {isFree && (
        <section data-testid="upgrade-cta-section" className="p-4 bg-gradient-to-br from-purple-400/10 to-accent/10 rounded-lg border border-purple-400/30">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-semibold text-text-primary">Upgrade Your Plan</h2>
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', PLAN_BADGE[plan])}>
              {plan}
            </span>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Unlock AI enrichment, more team members, and advanced integrations.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="plan-comparison-table">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="py-2 px-2 text-left">Feature</th>
                  <th className="py-2 px-2 text-center">Free</th>
                  <th className="py-2 px-2 text-center">Starter</th>
                  <th className="py-2 px-2 text-center">Teams</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map(f => (
                  <tr key={f.name} className="border-b border-border/50">
                    <td className="py-1.5 px-2 text-text-secondary">{f.name}</td>
                    <td className="py-1.5 px-2 text-center text-text-muted">{f.free}</td>
                    <td className="py-1.5 px-2 text-center text-sev-low">{f.starter}</td>
                    <td className="py-1.5 px-2 text-center text-accent font-medium">{f.teams}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            data-testid="upgrade-btn"
            className="mt-4 w-full py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand/90 transition-colors"
          >
            Upgrade Now
          </button>
        </section>
      )}
    </div>
  )
}
