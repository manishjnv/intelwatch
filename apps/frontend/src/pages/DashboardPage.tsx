import { useAuthStore } from '@/stores/auth-store';

const FEATURES = [
  { title: 'IOC Intelligence', desc: 'Search, pivot, and manage indicators of compromise.', phase: 'Phase 3', color: 'text-blue-400' },
  { title: 'Feed Ingestion', desc: 'Connect STIX, MISP, CSV, and REST feeds.', phase: 'Phase 2', color: 'text-green-400' },
  { title: 'AI Enrichment', desc: 'Claude-powered analysis with VT & AbuseIPDB.', phase: 'Phase 2', color: 'text-purple-400' },
  { title: 'Threat Graph', desc: 'Interactive knowledge graph visualization.', phase: 'Phase 4', color: 'text-cyan-400' },
  { title: 'Threat Actors', desc: 'Track APT groups, campaigns, and TTPs.', phase: 'Phase 3', color: 'text-orange-400' },
  { title: 'Malware Analysis', desc: 'Malware family tracking and behavioral indicators.', phase: 'Phase 3', color: 'text-red-400' },
  { title: 'Vulnerability Intel', desc: 'CVE tracking with EPSS scoring.', phase: 'Phase 3', color: 'text-yellow-400' },
  { title: 'Threat Hunting', desc: 'YARA & Sigma rule management with NL queries.', phase: 'Phase 4', color: 'text-emerald-400' },
  { title: 'Digital Risk Protection', desc: 'Dark web monitoring and credential leak detection.', phase: 'Phase 4', color: 'text-rose-400' },
  { title: 'Correlation Engine', desc: 'Automated cross-entity correlation with alerts.', phase: 'Phase 4', color: 'text-amber-400' },
  { title: 'Enterprise Integrations', desc: 'SIEM, SOAR, ticketing, and API integrations.', phase: 'Phase 5', color: 'text-sky-400' },
  { title: 'RBAC & SSO', desc: 'Role-based access with Google SSO and SAML.', phase: 'Phase 5', color: 'text-indigo-400' },
];

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-text-primary">Welcome back, {user?.displayName ?? 'Analyst'}</h1>
        <p className="text-sm text-text-muted mt-0.5">{tenant?.name ?? 'Your organization'} &middot; Free tier</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[['Total IOCs', '—', 'Phase 2'], ['Active Feeds', '—', 'Phase 2'], ['Enriched Today', '—', 'Phase 2'], ['Open Alerts', '—', 'Phase 4']].map(([label, value, sub]) => (
          <div key={label} className="bg-bg-primary border border-border rounded-lg p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
            <div className="text-lg font-semibold text-text-primary mt-0.5">{value}</div>
            <div className="text-[10px] text-text-muted mt-0.5">Coming {sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-text-primary">Phase 1 Complete — Foundation Ready</h3>
        <p className="text-xs text-text-secondary mt-0.5">Authentication, API gateway, and infrastructure are live. The data pipeline is coming in Phase 2.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card-3d bg-bg-primary border border-border rounded-xl p-4 shadow-card cursor-default">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <h3 className={'text-sm font-medium ' + f.color}>{f.title}</h3>
              <span className="text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded shrink-0">{f.phase}</span>
            </div>
            <p className="text-xs text-text-secondary line-clamp-2">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
