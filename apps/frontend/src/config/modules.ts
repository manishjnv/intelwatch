/**
 * @module config/modules
 * @description Single source of truth for all ETIP module definitions.
 * Used by DashboardPage (cards), DashboardLayout (sidebar nav),
 * ComingSoonPage (placeholders), and App.tsx (routing).
 */
import type { LucideIcon } from 'lucide-react'
import {
  Shield, Activity, Cpu, Network, Users, Bug,
  AlertTriangle, Search, Globe, Zap, BarChart3, Lock,
} from 'lucide-react'

export interface ModuleConfig {
  id: string
  title: string
  description: string
  helpText: string
  icon: LucideIcon
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
    icon: Shield,
    color: 'text-accent',
    phase: 3,
    route: '/iocs',
  },
  {
    id: 'feed-ingestion',
    title: 'Feed Ingestion',
    description: 'Connect STIX, MISP, CSV, and REST feeds. Automated normalization pipeline.',
    helpText: 'Connects to external threat intelligence feeds and normalizes data automatically.',
    icon: Activity,
    color: 'text-sev-low',
    phase: 2,
    route: '/feeds',
  },
  {
    id: 'ai-enrichment',
    title: 'AI Enrichment',
    description: 'Claude-powered analysis with VirusTotal & AbuseIPDB correlation.',
    helpText: 'Uses AI to generate risk assessments, context summaries, and correlation insights.',
    icon: Cpu,
    color: 'text-purple-400',
    phase: 2,
    route: '/enrichment',
  },
  {
    id: 'threat-graph',
    title: 'Threat Graph',
    description: 'Interactive knowledge graph visualizing relationships between entities.',
    helpText: 'Neo4j-backed graph showing connections between IOCs, actors, malware, and campaigns.',
    icon: Network,
    color: 'text-cyan-400',
    phase: 4,
    route: '/graph',
  },
  {
    id: 'threat-actors',
    title: 'Threat Actors',
    description: 'Track APT groups, campaigns, TTPs, and attribution with MITRE ATT&CK mapping.',
    helpText: 'Profiles of nation-state and criminal threat actors with TTP mapping.',
    icon: Users,
    color: 'text-sev-high',
    phase: 3,
    route: '/threat-actors',
  },
  {
    id: 'malware-analysis',
    title: 'Malware Analysis',
    description: 'Malware family tracking, sample analysis, and behavioral indicators.',
    helpText: 'Track malware families, their variants, and associated indicators.',
    icon: Bug,
    color: 'text-sev-critical',
    phase: 3,
    route: '/malware',
  },
  {
    id: 'vulnerability-intel',
    title: 'Vulnerability Intel',
    description: 'CVE tracking with EPSS scoring, exploit availability, and patch status.',
    helpText: 'Monitors CVEs with prioritization based on exploitability and your asset exposure.',
    icon: AlertTriangle,
    color: 'text-sev-medium',
    phase: 3,
    route: '/vulnerabilities',
  },
  {
    id: 'threat-hunting',
    title: 'Threat Hunting',
    description: 'YARA & Sigma rule management with natural language query interface.',
    helpText: 'Create and manage detection rules with an AI-assisted natural language query builder.',
    icon: Search,
    color: 'text-emerald-400',
    phase: 4,
    route: '/hunting',
  },
  {
    id: 'digital-risk-protection',
    title: 'Digital Risk Protection',
    description: 'Dark web monitoring, brand protection, and credential leak detection.',
    helpText: 'Monitors external attack surface including dark web, paste sites, and social media.',
    icon: Globe,
    color: 'text-rose-400',
    phase: 4,
    route: '/drp',
  },
  {
    id: 'correlation-engine',
    title: 'Correlation Engine',
    description: 'Automated cross-entity correlation with alert prioritization.',
    helpText: 'Automatically links related entities and generates prioritized alerts.',
    icon: Zap,
    color: 'text-yellow-400',
    phase: 4,
    route: '/correlation',
  },
  {
    id: 'enterprise-integrations',
    title: 'Enterprise Integrations',
    description: 'SIEM, SOAR, ticketing, and API integrations for your security stack.',
    helpText: 'Bi-directional integration with Splunk, Sentinel, ServiceNow, and more.',
    icon: BarChart3,
    color: 'text-sky-400',
    phase: 5,
    route: '/integrations',
  },
  {
    id: 'rbac-sso',
    title: 'RBAC & SSO',
    description: 'Role-based access control with Google SSO, SAML, and OIDC support.',
    helpText: 'Enterprise-grade access control with 5 roles and 30+ granular permissions.',
    icon: Lock,
    color: 'text-indigo-400',
    phase: 5,
    route: '/settings',
  },
]

/** Phase-specific accent color for badges and indicators. */
export function getPhaseColor(phase: number): string {
  switch (phase) {
    case 2: return 'text-sev-low'
    case 3: return 'text-accent'
    case 4: return 'text-cyan-400'
    case 5: return 'text-sky-400'
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
    default: return 'bg-bg-elevated'
  }
}

/** Resolve a module config from a route path. */
export function getModuleByRoute(path: string): ModuleConfig | undefined {
  return MODULES.find(m => m.route === path)
}
