/**
 * @module config/modules
 * @description Single source of truth for all ETIP module definitions.
 * Used by DashboardPage (cards), DashboardLayout (sidebar nav),
 * ComingSoonPage (placeholders), and App.tsx (routing).
 *
 * Session 111: Removed 12 modules absorbed into Command Center tabs.
 * Session 112: Removed Global Catalog from sidebar (feeds governed by plan, not user choice).
 * Sidebar now shows 11 items: Dashboard, IOC Search, + 9 modules below.
 */
import {
  IconIOC, IconGraph, IconActors, IconMalware,
  IconVuln, IconHunting, IconDRP, IconCorrelation,
  IconCommandCenter,
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
    id: 'command-center',
    title: 'Command Center',
    description: 'Unified AI processing, model config, queue management & tenant oversight.',
    helpText: 'AI processing costs, provider keys, model assignments, queue monitoring, and client management.',
    icon: IconCommandCenter,
    color: 'text-purple-400',
    phase: 2,
    route: '/command-center',
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
