/**
 * @module pages/OnboardingPage
 * @description Onboarding & Setup wizard dashboard — 8-step wizard,
 * pipeline health, module readiness checklist, and quick-start guide.
 * Connects to onboarding-service API (port 3018 via nginx /api/v1/onboarding/*).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useOnboardingWizard, useWelcomeDashboard, usePipelineHealth,
  useModuleReadiness, useReadinessCheck, useCompleteStep, useSkipStep, useSeedDemo,
  type OnboardingWizard, type PipelineHealth, type ModuleStatus,
} from '@/hooks/use-phase6-data'
import { FeedSelectionStep } from '@/components/FeedSelectionStep'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { CheckCircle2, Circle, Clock, SkipForward, Play, Rocket } from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  welcome:           'Welcome',
  org_profile:       'Org Profile',
  team_invite:       'Team Invite',
  feed_activation:   'Feed Activation',
  integration_setup: 'Integration Setup',
  dashboard_config:  'Dashboard Config',
  readiness_check:   'Readiness Check',
  launch:            'Launch',
}

const STEP_ORDER = [
  'welcome', 'org_profile', 'team_invite', 'feed_activation',
  'integration_setup', 'dashboard_config', 'readiness_check', 'launch',
]

const MODULE_STATUS_BADGE: Record<string, string> = {
  ready:        'text-sev-low bg-sev-low/10',
  needs_config: 'text-sev-medium bg-sev-medium/10',
  needs_deps:   'text-sev-high bg-sev-high/10',
  disabled:     'text-text-muted bg-bg-elevated',
}

const PIPELINE_OVERALL_COLOR: Record<string, string> = {
  healthy:   'text-sev-low bg-sev-low/10 border-sev-low/30',
  degraded:  'text-sev-medium bg-sev-medium/10 border-sev-medium/30',
  unhealthy: 'text-sev-critical bg-sev-critical/10 border-sev-critical/30',
}

const STAGE_DOT: Record<string, string> = {
  healthy:  'bg-sev-low',
  unhealthy:'bg-sev-critical',
  unknown:  'bg-text-muted',
}

// ─── Wizard Tab ──────────────────────────────────────────────────

function WizardTab({ wizard }: { wizard: OnboardingWizard }) {
  const completeStep = useCompleteStep()
  const skipStep = useSkipStep()
  const currentStep = wizard.currentStep
  const showFeedStep = currentStep === 'feed_activation'

  return (
    <div className="space-y-4">
      <div className="bg-bg-elevated rounded-lg border border-border-subtle divide-y divide-border-subtle/50">
        {STEP_ORDER.map((step, i) => {
          const status = wizard.steps[step] ?? 'pending'
          const isCurrent = step === currentStep
          return (
            <div key={step} className={cn('flex items-center gap-3 px-4 py-3', isCurrent && 'bg-accent/5')}>
              <span className="text-xs text-text-muted w-5 shrink-0">{i + 1}</span>
              {status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-sev-low shrink-0" />
              ) : status === 'in_progress' ? (
                <Clock className="w-4 h-4 text-accent shrink-0" />
              ) : status === 'skipped' ? (
                <SkipForward className="w-4 h-4 text-text-muted shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-text-muted shrink-0" />
              )}
              <span className={cn('text-sm flex-1', isCurrent ? 'text-text-primary font-medium' : 'text-text-secondary')}>
                {STEP_LABELS[step] ?? step}
              </span>
              {isCurrent && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold">
                  CURRENT
                </span>
              )}
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded capitalize',
                status === 'completed'   ? 'text-sev-low bg-sev-low/10'   :
                status === 'in_progress' ? 'text-accent bg-accent/10'     :
                status === 'skipped'     ? 'text-text-muted bg-bg-primary' :
                                           'text-text-muted bg-bg-primary',
              )}>
                {status}
              </span>
            </div>
          )
        })}
      </div>

      {showFeedStep && (
        <FeedSelectionStep
          planTier="free"
          onContinue={() => completeStep.mutate({ step: 'feed_activation' })}
          onSkip={() => skipStep.mutate({ step: 'feed_activation' })}
        />
      )}

      {!showFeedStep && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => completeStep.mutate({ step: currentStep })}
            disabled={completeStep.isPending}
            className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <Play className="w-3 h-3" />
            {completeStep.isPending ? 'Completing…' : 'Complete Step'}
          </button>
          <button
            onClick={() => skipStep.mutate({ step: currentStep })}
            disabled={skipStep.isPending}
            className="px-4 py-2 text-xs font-medium border border-border-subtle text-text-muted rounded-lg hover:border-accent/50 hover:text-accent disabled:opacity-50 transition-colors"
          >
            {skipStep.isPending ? 'Skipping…' : 'Skip Step'}
          </button>
          <span className="text-xs text-text-muted ml-auto">
            Current: <strong className="text-text-secondary">{STEP_LABELS[currentStep] ?? currentStep}</strong>
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Pipeline Health Tab ─────────────────────────────────────────

function PipelineTab({ pipeline }: { pipeline: PipelineHealth }) {
  const overallColor = PIPELINE_OVERALL_COLOR[pipeline.overall] ?? PIPELINE_OVERALL_COLOR.healthy
  return (
    <div className="space-y-4">
      <div className={cn('flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium', overallColor)}>
        <span>Pipeline Status:</span>
        <span className="uppercase font-bold">{pipeline.overall}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pipeline.stages.map(stage => (
          <div key={stage.name} className="bg-bg-elevated border border-border-subtle rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('w-2 h-2 rounded-full shrink-0', STAGE_DOT[stage.status] ?? 'bg-text-muted')} />
              <span className="text-sm font-medium text-text-primary">{stage.name}</span>
              <span className={cn(
                'ml-auto text-[10px] px-1.5 py-0.5 rounded capitalize',
                stage.status === 'healthy' ? 'text-sev-low bg-sev-low/10' : 'text-sev-critical bg-sev-critical/10',
              )}>
                {stage.status}
              </span>
            </div>
            <p className="text-xs text-text-muted">{stage.message}</p>
            {stage.latencyMs != null && (
              <p className="text-[11px] text-text-muted mt-1">{stage.latencyMs}ms</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Module Status Tab ───────────────────────────────────────────

function ModulesTab({ modules }: { modules: ModuleStatus[] }) {
  if (modules.length === 0) {
    return <div className="px-4 py-8 text-center text-xs text-text-muted">No modules found.</div>
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {modules.map(mod => (
        <div key={mod.module} className="bg-bg-elevated border border-border-subtle rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-primary">{mod.module}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium',
              MODULE_STATUS_BADGE[mod.status] ?? '')}>
              {mod.status.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span>{mod.enabled ? '● Enabled' : '○ Disabled'}</span>
            <span>{mod.healthy ? '✓ Healthy' : '✗ Unhealthy'}</span>
          </div>
          {mod.missingDeps.length > 0 && (
            <p className="text-[10px] text-sev-high mt-1.5">Missing: {mod.missingDeps.join(', ')}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Quick Start Tab ─────────────────────────────────────────────

function QuickStartTab() {
  const { data: welcome } = useWelcomeDashboard()
  const seedDemo = useSeedDemo()

  if (!welcome) return null
  const stats = welcome.stats

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Feeds Active',    value: stats.feedsActive },
          { label: 'IOCs Ingested',   value: stats.iocsIngested.toLocaleString() },
          { label: 'Team Members',    value: stats.teamMembers },
          { label: 'Modules Enabled', value: stats.modulesEnabled },
        ].map(s => (
          <div key={s.label} className="bg-bg-elevated border border-border-subtle rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-text-primary">{s.value}</p>
            <p className="text-xs text-text-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {welcome.nextStep && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-accent mb-0.5">Next Step</p>
            <p className="text-sm text-text-primary">{STEP_LABELS[welcome.nextStep] ?? welcome.nextStep}</p>
          </div>
          <Rocket className="w-5 h-5 text-accent opacity-60" />
        </div>
      )}

      {welcome.tips.length > 0 && (
        <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4">
          <h3 className="text-xs font-semibold text-text-primary mb-3">Getting Started Tips</h3>
          <ul className="space-y-3">
            {welcome.tips.map(tip => (
              <li key={tip.id} className="flex items-start gap-3">
                <CheckCircle2 className="w-3.5 h-3.5 text-sev-low shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-text-secondary">{tip.title}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{tip.content}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => seedDemo.mutate({})}
          disabled={seedDemo.isPending}
          className="px-4 py-2 text-xs font-medium bg-teal-400/15 text-teal-400 border border-teal-400/30 rounded-lg hover:bg-teal-400/25 disabled:opacity-50 transition-colors"
        >
          {seedDemo.isPending ? 'Seeding…' : 'Seed Demo Data'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────

type OnboardingTab = 'wizard' | 'pipeline' | 'modules' | 'quickstart'

const TABS: { key: OnboardingTab; label: string }[] = [
  { key: 'wizard',     label: 'Setup Wizard' },
  { key: 'pipeline',   label: 'Pipeline Health' },
  { key: 'modules',    label: 'Module Status' },
  { key: 'quickstart', label: 'Quick Start' },
]

export function OnboardingPage() {
  const [activeTab, setActiveTab] = useState<OnboardingTab>('wizard')

  const { data: wizard, isDemo: wizardDemo } = useOnboardingWizard()
  const { data: pipeline } = usePipelineHealth()
  const { data: modules = [] } = useModuleReadiness()
  const { data: readiness } = useReadinessCheck()

  const completionPct  = wizard?.completionPercent ?? 0
  const modulesEnabled = modules.filter(m => m.enabled).length
  const pipelineStatus = pipeline?.overall ?? '—'
  const readinessScore = readiness ? `${readiness.score}/${readiness.maxScore}` : '—'

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageStatsBar title="Onboarding & Setup" isDemo={wizardDemo}>
        <CompactStat label="Completion"      value={`${completionPct}%`} />
        <CompactStat label="Modules Enabled" value={String(modulesEnabled)} />
        <CompactStat label="Pipeline"        value={pipelineStatus} />
        <CompactStat label="Readiness"       value={readinessScore} />
      </PageStatsBar>

      <div className="flex gap-1 px-4 pt-4 border-b border-border-subtle">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2',
              activeTab === t.key
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'wizard'     && wizard   && <WizardTab   wizard={wizard} />}
        {activeTab === 'pipeline'   && pipeline  && <PipelineTab pipeline={pipeline} />}
        {activeTab === 'modules'                 && <ModulesTab  modules={modules} />}
        {activeTab === 'quickstart'              && <QuickStartTab />}
      </div>
    </div>
  )
}
