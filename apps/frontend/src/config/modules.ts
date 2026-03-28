/**
 * @module config/modules
 * @description Single source of truth for all ETIP module definitions.
 * Used by DashboardPage (cards), DashboardLayout (sidebar nav),
 * ComingSoonPage (placeholders), and App.tsx (routing).
 */
import {
  IconIOC, IconFeed, IconGraph, IconActors, IconMalware,
  IconVuln, IconHunting, IconDRP, IconCorrelation, IconIntegrations, IconRBAC,
  IconCustomization, IconBilling, IconAdmin, IconOnboarding, IconReporting,
  IconAlerting, IconAnalytics, IconGlobalCatalog, IconPlanLimits,
  IconPipelineMonitor, IconCommandCenter,
} from '@/components/brand/ModuleIcons'

export interface IconComponentProps {
  size?: number
  className?: string
}

export interface ModuleConfig {
  id: string
  title: string
  description: string
  helpText: string
  icon: React.FC<IconComponentProps>
  color: string
  phase: number
  route: string
}

export const MODULES: ModuleConfig[] = [
  {
    id: 'ioc-intelligence',
    title: 'IOC Intelligence',
    description: 'Search, pivot, and manage indicators of compromise with full lifecycle tracking.',
    helpText: 'Track IPs, domains, hashes, URLs, emails, and CVEs with automated enrichment.',
    icon: IconIOC,
    color: 'text-accent',
    phase: 3,
    route: '/iocs',
  },
  {
    id: 'feed-ingestion',
    title: 'Feed Ingestion',
    description: 'Connect STIX, MISP, CSV, and REST feeds. Automated normalization pipeline.',
    helpText: 'Connects to external threat intelligence feeds and normalizes data automatically.',
    icon: IconFeed,
    color: 'text-sev-low',
    phase: 2,
    route: '/feeds',
  },
  {
    id: 'global-catalog',
    title: 'Global Catalog',
    description: 'Browse and subscribe to curated global threat intelligence feeds.',
    helpText: 'Global feed catalog with pipeline health, subscriptions, and IOC overlay management.',
    icon: IconGlobalCatalog,
    color: 'text-teal-400',
    phase: 2,
    route: '/global-catalog',
  },
  {
    id: 'command-center',
    title: 'Command Center',
    description: 'Unified AI processing, model config, queue management & tenant oversight.',
    helpText: 'AI processing costs, provider keys, model assignments, queue monitoring, and client management.',
    icon: IconCommandCenter,
    color: 'text-purple-400',
    phase: 2,
    route: '/command-center',
  },
  {
    id: 'threat-graph',
    title: 'Threat Graph',
    description: 'Interactive knowledge graph visualizing relationships between entities.',
    helpText: 'Neo4j-backed graph showing connections between IOCs, actors, malware, and campaigns.',
    icon: IconGraph,
    color: 'text-cyan-400',
    phase: 4,
    route: '/graph',
  },
  {
    id: 'threat-actors',
    title: 'Threat Actors',
    description: 'Track APT groups, campaigns, TTPs, and attribution with MITRE ATT&CK mapping.',
    helpText: 'Profiles of nation-state and criminal threat actors with TTP mapping.',
    icon: IconActors,
    color: 'text-sev-high',
    phase: 3,
    route: '/threat-actors',
  },
  {
    id: 'malware-analysis',
    title: 'Malware Analysis',
    description: 'Malware family tracking, sample analysis, and behavioral indicators.',
    helpText: 'Track malware families, their variants, and associated indicators.',
    icon: IconMalware,
    color: 'text-sev-critical',
    phase: 3,
    route: '/malware',
  },
  {
    id: 'vulnerability-intel',
    title: 'Vulnerability Intel',
    description: 'CVE tracking with EPSS scoring, exploit availability, and patch status.',
    helpText: 'Monitors CVEs with prioritization based on exploitability and your asset exposure.',
    icon: IconVuln,
    color: 'text-sev-medium',
    phase: 3,
    route: '/vulnerabilities',
  },
  {
    id: 'threat-hunting',
    title: 'Threat Hunting',
    description: 'YARA & Sigma rule management with natural language query interface.',
    helpText: 'Create and manage detection rules with an AI-assisted natural language query builder.',
    icon: IconHunting,
    color: 'text-emerald-400',
    phase: 4,
    route: '/hunting',
  },
  {
    id: 'digital-risk-protection',
    title: 'Digital Risk Protection',
    description: 'Dark web monitoring, brand protection, and credential leak detection.',
    helpText: 'Monitors external attack surface including dark web, paste sites, and social media.',
    icon: IconDRP,
    color: 'text-rose-400',
    phase: 4,
    route: '/drp',
  },
  {
    id: 'correlation-engine',
    title: 'Correlation Engine',
    description: 'Automated cross-entity correlation with alert prioritization.',
    helpText: 'Automatically links related entities and generates prioritized alerts.',
    icon: IconCorrelation,
    color: 'text-yellow-400',
    phase: 4,
    route: '/correlation',
  },
  {
    id: 'enterprise-integrations',
    title: 'Enterprise Integrations',
    description: 'SIEM, SOAR, ticketing, and API integrations for your security stack.',
    helpText: 'Bi-directional integration with Splunk, Sentinel, ServiceNow, and more.',
    icon: IconIntegrations,
    color: 'text-sky-400',
    phase: 5,
    route: '/integrations',
  },
  {
    id: 'rbac-sso',
    title: 'RBAC & SSO',
    description: 'Role-based access control with Google SSO, SAML, and OIDC support.',
    helpText: 'Enterprise-grade access control with 5 roles and 30+ granular permissions.',
    icon: IconRBAC,
    color: 'text-indigo-400',
    phase: 5,
    route: '/settings',
  },
  {
    id: 'customization',
    title: 'Customization',
    description: 'Module toggles, AI model config, risk weights, and notification preferences.',
    helpText: 'Fine-tune platform behavior — enable/disable modules, set AI budgets, adjust risk scoring.',
    icon: IconCustomization,
    color: 'text-emerald-400',
    phase: 5,
    route: '/customization',
  },
  {
    id: 'billing',
    title: 'Billing',
    description: 'Plan management, usage metering, payment history, and subscription controls.',
    helpText: 'Manage your subscription plan, view API usage, download invoices, and apply coupons.',
    icon: IconBilling,
    color: 'text-amber-400',
    phase: 6,
    route: '/billing',
  },
  {
    id: 'admin-ops',
    title: 'Admin Ops',
    description: 'System health dashboard, maintenance windows, tenant management, and audit log.',
    helpText: 'Platform-wide operations: monitor all 18 services, schedule maintenance, manage tenants.',
    icon: IconAdmin,
    color: 'text-violet-400',
    phase: 6,
    route: '/admin',
  },
  {
    id: 'onboarding',
    title: 'Onboarding',
    description: '8-step setup wizard, pipeline health checks, module readiness, and demo data seeding.',
    helpText: 'Guided onboarding: configure your org, connect feeds, enable modules, and launch ETIP.',
    icon: IconOnboarding,
    color: 'text-teal-400',
    phase: 6,
    route: '/onboarding',
  },
  {
    id: 'reporting',
    title: 'Reporting',
    description: 'Generate, schedule, and export threat intelligence reports in multiple formats.',
    helpText: 'Create daily/weekly/monthly/executive reports with cron scheduling and PDF/HTML/CSV export.',
    icon: IconReporting,
    color: 'text-orange-400',
    phase: 7,
    route: '/reporting',
  },
  {
    id: 'alerting',
    title: 'Alerting',
    description: 'Real-time alert rules, notification channels, escalation policies, and alert lifecycle management.',
    helpText: 'Configure alert rules, receive notifications via email/Slack/webhook, and escalate unresolved alerts.',
    icon: IconAlerting,
    color: 'text-rose-400',
    phase: 7,
    route: '/alerting',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description: 'Platform-wide analytics: IOC trends, threat landscape, executive summary, and pipeline health.',
    helpText: 'Dashboards and trends across all services — risk posture, top threats, service health matrix.',
    icon: IconAnalytics,
    color: 'text-blue-400',
    phase: 7,
    route: '/analytics',
  },
  {
    id: 'plan-limits',
    title: 'Plan Limits',
    description: 'Configure resource limits for Free, Starter, Teams, and Enterprise tiers.',
    helpText: 'Set feed limits, fetch intervals, retention, AI budgets, and global subscription caps per plan.',
    icon: IconPlanLimits,
    color: 'text-amber-400',
    phase: 6,
    route: '/plan-limits',
  },
  {
    id: 'pipeline-monitor',
    title: 'Pipeline Monitor',
    description: 'Real-time global pipeline health, feed status, IOC throughput, and operational controls.',
    helpText: 'Monitor global feed processing pipeline — queue health, IOC stats, corroboration, and admin actions.',
    icon: IconPipelineMonitor,
    color: 'text-teal-400',
    phase: 2,
    route: '/global-monitoring',
  },
]

/** Phase-specific accent color for badges and indicators. */
export function getPhaseColor(phase: number): string {
  switch (phase) {
    case 2: return 'text-sev-low'
    case 3: return 'text-accent'
    case 4: return 'text-cyan-400'
    case 5: return 'text-sky-400'
    case 6: return 'text-amber-400'
    case 7: return 'text-orange-400'
    default: return 'text-text-muted'
  }
}

/** Phase-specific background color for badges. */
export function getPhaseBgColor(phase: number): string {
  switch (phase) {
    case 2: return 'bg-sev-low/10'
    case 3: return 'bg-accent/10'
    case 4: return 'bg-cyan-400/10'
    case 5: return 'bg-sky-400/10'
    case 6: return 'bg-amber-400/10'
    case 7: return 'bg-orange-400/10'
    default: return 'bg-bg-elevated'
  }
}

/** Resolve a module config from a route path. */
export function getModuleByRoute(path: string): ModuleConfig | undefined {
  return MODULES.find(m => m.route === path)
}
