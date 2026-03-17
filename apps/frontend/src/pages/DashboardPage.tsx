/**
 * @module pages/DashboardPage
 * Uses design-locked IntelCard (3D hover), PageStatsBar, TooltipHelp, InlineHelp.
 */
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Shield, Activity, Search, AlertTriangle, Globe, Cpu, Network, Bug, Users, Zap, BarChart3, Lock } from 'lucide-react'
import { IntelCard }                   from '@etip/shared-ui/components/IntelCard'
import { PageStatsBar, CompactStat }   from '@etip/shared-ui/components/PageStatsBar'
import { TooltipHelp }                 from '@etip/shared-ui/components/TooltipHelp'
import { InlineHelp }                  from '@etip/shared-ui/components/InlineHelp'

interface FeatureCard { title:string; description:string; icon:React.ReactNode; phase:string; color:string; helpText:string }

const FEATURES: FeatureCard[] = [
  { title:'IOC Intelligence',       description:'Search, pivot, and manage indicators of compromise with full lifecycle tracking.',        icon:<Shield className="w-5 h-5"/>,      phase:'Phase 3', color:'text-accent',       helpText:'Track IPs, domains, hashes, URLs, emails, and CVEs with automated enrichment.'                           },
  { title:'Feed Ingestion',         description:'Connect STIX, MISP, CSV, and REST feeds. Automated normalization pipeline.',             icon:<Activity className="w-5 h-5"/>,    phase:'Phase 2', color:'text-sev-low',       helpText:'Connects to external threat intelligence feeds and normalizes data automatically.'                        },
  { title:'AI Enrichment',          description:'Claude-powered analysis with VirusTotal & AbuseIPDB correlation.',                       icon:<Cpu className="w-5 h-5"/>,         phase:'Phase 2', color:'text-purple-400',   helpText:'Uses AI to generate risk assessments, context summaries, and correlation insights.'                       },
  { title:'Threat Graph',           description:'Interactive knowledge graph visualizing relationships between entities.',                 icon:<Network className="w-5 h-5"/>,     phase:'Phase 4', color:'text-cyan-400',     helpText:'Neo4j-backed graph showing connections between IOCs, actors, malware, and campaigns.'                      },
  { title:'Threat Actors',          description:'Track APT groups, campaigns, TTPs, and attribution with MITRE ATT&CK mapping.',          icon:<Users className="w-5 h-5"/>,       phase:'Phase 3', color:'text-sev-high',     helpText:'Profiles of nation-state and criminal threat actors with TTP mapping.'                                    },
  { title:'Malware Analysis',       description:'Malware family tracking, sample analysis, and behavioral indicators.',                   icon:<Bug className="w-5 h-5"/>,         phase:'Phase 3', color:'text-sev-critical', helpText:'Track malware families, their variants, and associated indicators.'                                       },
  { title:'Vulnerability Intel',    description:'CVE tracking with EPSS scoring, exploit availability, and patch status.',                icon:<AlertTriangle className="w-5 h-5"/>,phase:'Phase 3',color:'text-sev-medium',   helpText:'Monitors CVEs with prioritization based on exploitability and your asset exposure.'                       },
  { title:'Threat Hunting',         description:'YARA & Sigma rule management with natural language query interface.',                     icon:<Search className="w-5 h-5"/>,      phase:'Phase 4', color:'text-emerald-400', helpText:'Create and manage detection rules with an AI-assisted natural language query builder.'                    },
  { title:'Digital Risk Protection',description:'Dark web monitoring, brand protection, and credential leak detection.',                  icon:<Globe className="w-5 h-5"/>,       phase:'Phase 4', color:'text-rose-400',     helpText:'Monitors external attack surface including dark web, paste sites, and social media.'                      },
  { title:'Correlation Engine',     description:'Automated cross-entity correlation with alert prioritization.',                          icon:<Zap className="w-5 h-5"/>,         phase:'Phase 4', color:'text-yellow-400',   helpText:'Automatically links related entities and generates prioritized alerts.'                                   },
  { title:'Enterprise Integrations',description:'SIEM, SOAR, ticketing, and API integrations for your security stack.',                  icon:<BarChart3 className="w-5 h-5"/>,   phase:'Phase 5', color:'text-sky-400',      helpText:'Bi-directional integration with Splunk, Sentinel, ServiceNow, and more.'                                  },
  { title:'RBAC & SSO',             description:'Role-based access control with Google SSO, SAML, and OIDC support.',                    icon:<Lock className="w-5 h-5"/>,        phase:'Phase 5', color:'text-indigo-400',   helpText:'Enterprise-grade access control with 5 roles and 30+ granular permissions.'                               },
]

export function DashboardPage() {
  const user   = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)

  return (
    <div>
      <PageStatsBar>
        <CompactStat label="Total IOCs"     value="—"/>
        <CompactStat label="Active Feeds"   value="—"/>
        <CompactStat label="Enriched Today" value="—"/>
        <CompactStat label="Open Alerts"    value="—"/>
      </PageStatsBar>

      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-lg sm:text-xl font-semibold text-text-primary">
            Welcome back, {user?.displayName ?? 'Analyst'}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">{tenant?.name ?? 'Your organization'} • Free tier</p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-accent"/>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-text-primary">Phase 1 Complete — Foundation Ready</h3>
                <TooltipHelp message="Phase 1 includes authentication, API gateway, database schema, and CI/CD pipeline. All passing 372+ tests."/>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Authentication, API gateway, and infrastructure are live. The data pipeline (feed ingestion, normalization, AI enrichment) is coming in Phase 2.
              </p>
              <InlineHelp message="Press Cmd+K (Mac) or Ctrl+K (Win) at any time to search across all intelligence."/>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {FEATURES.map((f) => (
            <IntelCard key={f.title} className="cursor-default">
              <div className="flex items-start gap-3">
                <div className={cn('w-9 h-9 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0', f.color)}>
                  {f.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{f.title}</h3>
                      <TooltipHelp message={f.helpText} size={3}/>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded shrink-0">{f.phase}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{f.description}</p>
                </div>
              </div>
            </IntelCard>
          ))}
        </div>
      </div>
    </div>
  )
}
