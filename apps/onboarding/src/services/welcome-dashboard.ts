import type {
  WelcomeDashboard,
  WizardStep,
  QuickAction,
  GuidedTip,
} from '../schemas/onboarding.js';
import type { WizardStore } from './wizard-store.js';
import type { ProgressTracker } from './progress-tracker.js';
import type { DemoSeeder } from './demo-seeder.js';

/** Quick actions shown on first-login dashboard. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'add_feed',
    title: 'Add Your First Feed',
    description: 'Connect an OSINT feed like AlienVault OTX or CISA Alerts',
    actionUrl: '/feeds',
    icon: 'rss',
    completed: false,
  },
  {
    id: 'explore_iocs',
    title: 'Explore IOC Intelligence',
    description: 'Search and investigate indicators of compromise',
    actionUrl: '/iocs',
    icon: 'search',
    completed: false,
  },
  {
    id: 'invite_team',
    title: 'Invite Your Team',
    description: 'Add analysts and hunters to your workspace',
    actionUrl: '/settings',
    icon: 'users',
    completed: false,
  },
  {
    id: 'configure_alerts',
    title: 'Set Up Alerts',
    description: 'Configure notifications for critical threat intelligence',
    actionUrl: '/customization',
    icon: 'bell',
    completed: false,
  },
  {
    id: 'view_graph',
    title: 'Explore Threat Graph',
    description: 'Visualize relationships between threat entities',
    actionUrl: '/graph',
    icon: 'network',
    completed: false,
  },
];

/** Guided tips for new users. */
const GUIDED_TIPS: GuidedTip[] = [
  {
    id: 'tip_entity_click',
    title: 'Click Any Entity',
    content: 'Every IP, domain, hash, and CVE is clickable. Click to investigate relationships and enrichment data.',
    category: 'getting_started',
    order: 1,
  },
  {
    id: 'tip_global_search',
    title: 'Global Search (Cmd+K)',
    content: 'Press Cmd+K (or Ctrl+K) anywhere to search across all IOCs, actors, malware, and CVEs.',
    category: 'getting_started',
    order: 2,
  },
  {
    id: 'tip_ai_enrichment',
    title: 'AI-Powered Enrichment',
    content: 'Every IOC is automatically enriched with VirusTotal, AbuseIPDB, and AI analysis. Check the enrichment tab for details.',
    category: 'feature_highlight',
    order: 3,
  },
  {
    id: 'tip_feed_schedule',
    title: 'Schedule Your Feeds',
    content: 'Set up cron schedules for your feeds to automatically ingest new threat data at regular intervals.',
    category: 'best_practice',
    order: 4,
  },
  {
    id: 'tip_correlation',
    title: 'Automatic Correlation',
    content: 'The correlation engine detects connections between IOCs, actors, and campaigns automatically.',
    category: 'feature_highlight',
    order: 5,
  },
  {
    id: 'tip_export',
    title: 'Export in STIX 2.1',
    content: 'Export any intelligence data in STIX 2.1 format for sharing with other TI platforms.',
    category: 'best_practice',
    order: 6,
  },
];

/**
 * P0 #10: Personalized first-login experience with guided tour.
 * Shows onboarding progress, quick actions, and tips.
 */
export class WelcomeDashboardService {
  constructor(
    private wizardStore: WizardStore,
    private progressTracker: ProgressTracker,
    _demoSeeder: DemoSeeder,
  ) {}

  /** Get the welcome dashboard for a tenant. */
  async getDashboard(tenantId: string): Promise<WelcomeDashboard> {
    const wizard = await this.wizardStore.getOrCreate(tenantId);
    const stats = await this.progressTracker.getStats(tenantId);
    const isComplete = this.wizardStore.isComplete(tenantId);

    // Determine next step
    const nextStep: WizardStep | null = isComplete ? null : wizard.currentStep;

    // Build quick actions with completion state
    const actions = this.getQuickActions(tenantId, stats);

    return {
      tenantId,
      onboardingComplete: isComplete,
      completionPercent: wizard.completionPercent,
      nextStep,
      stats,
      quickActions: actions,
      tips: GUIDED_TIPS,
    };
  }

  /** Get guided tips filtered by category. */
  getTips(category?: string): GuidedTip[] {
    if (!category) return [...GUIDED_TIPS];
    return GUIDED_TIPS.filter((t) => t.category === category);
  }

  /** Get quick actions with tenant-specific completion state. */
  getQuickActions(
    _tenantId: string,
    stats: { feedsActive: number; teamMembers: number; modulesEnabled: number },
  ): QuickAction[] {
    const s = stats;
    return QUICK_ACTIONS.map((action) => {
      let completed = false;
      if (action.id === 'add_feed') completed = s.feedsActive > 0;
      if (action.id === 'invite_team') completed = s.teamMembers > 0;
      return { ...action, completed };
    });
  }

  /** Check if the welcome dashboard should show for this tenant. */
  shouldShowWelcome(tenantId: string): boolean {
    return !this.wizardStore.isComplete(tenantId);
  }

  /** Mark guided tour as completed (track per-tenant). */
  private tourCompleted = new Set<string>();

  markTourCompleted(tenantId: string): void {
    this.tourCompleted.add(tenantId);
  }

  isTourCompleted(tenantId: string): boolean {
    return this.tourCompleted.has(tenantId);
  }
}
