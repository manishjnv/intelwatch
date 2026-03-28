# Command Center — Complete Implementation Plan

## Context

Unified admin hub at `/command-center`. Absorbs 12 standalone admin pages into 9 tabs (3 sections). Global processing model (AI costs incurred once, consumption tracked per-tenant). Super-admin: 9 tabs. Tenant-admin/Free: 6 tabs. Multi-provider AI. Sidebar shrinks from 22 → 12 items (11 intelligence + Command Center).

---

## Core Architecture: Global Processing → Per-Tenant Consumption

```
GLOBAL (one-time)                           PER-TENANT (consumption)
──────────────────                          ────────────────────────
Feeds fetched → Articles ingested     →→→   Tenant subscribes to feed
Articles normalized                   →→→   Tenant views/uses article → logged
AI enriches IOCs (cost stored once)   →→→   Tenant consumes IOC → cost looked up
                                            from global cost table
```

- AI cost incurred ONCE per item globally, stored in global table (no tenant_id)
- When N tenants consume same item, each sees same production cost
- Platform total = sum of global processing (NOT multiplied by consumers)
- Tenants have zero visibility into other tenants

---

## Access Model

### Functional Access (Sidebar Intelligence Pages)

ALL users (analyst, tenant admin, free) get FULL functional access to intelligence pages:
- IOC Search, IOC Intelligence, Threat Graph, Threat Actors, Malware, Vulnerability, Threat Hunting, DRP, Correlation, Global Catalog
- All filtering, sorting, search, export, pivot, detail panels, bulk actions
- Dashboard (customized by org profile — see Org-Aware Dashboard below)

### Command Center Access (Admin Hub)

| Role | Description | Command Center Tabs |
|------|-------------|---------------------|
| Super Admin | Platform owner. Full control. | 9 tabs (all sections) |
| Tenant Admin | Org manager (paid). Analyst access + admin extras. | 6 tabs (outcome-focused, no AI internals) |
| Free User | Solo tenant admin. Can upgrade → add members. | 6 tabs (with upgrade CTAs) |
| Analyst | Full intelligence access. No admin. | No Command Center access |

**Tenant Admin extras over Analyst:** Settings (org config, onboarding, notifications), Feeds (subscription management), Users & Access (team, roles, invites), Billing & Plans (subscription, invoices, upgrade), Alerts & Reports (org-level alert rules, scheduled reports)

- Free user = tenant admin on free tier (single user, upgrade to add members)
- Tenant admin and free user have SAME access level, different plan context
- Original signup user cannot be demoted/removed
- Any user can be promoted to tenant admin by existing tenant admin
- Module access governed by subscription plan (no manual toggles)
- Tenant admins/free users NEVER see AI model names, provider names, or technical details — only outcome metrics

---

## Org-Aware Dashboard

Dashboard content is customized based on the org's profile. When the org updates their profile, dashboard automatically re-weights what intel surfaces.

### Org Profile Fields (set during onboarding, editable in Settings)

| Field | Options | Effect on Dashboard |
|-------|---------|---------------------|
| **Industry** | Finance, Healthcare, Government, Energy, Telecom, Retail, Manufacturing, Education, Technology, Defense | Prioritize threat actors & campaigns targeting this sector |
| **Tech Stack** | Windows/Linux/macOS, Cloud (AWS/Azure/GCP), Network (Cisco/Fortinet/Palo Alto), Database (Oracle/Postgres/MongoDB), Web (Apache/Nginx/IIS) | Surface CVEs and malware affecting these technologies |
| **Business Risk** | Data breach, Ransomware, IP theft, Service disruption, Regulatory compliance, Supply chain | Weight IOCs and alerts by relevance to these risk categories |
| **Org Size** | Startup (<50), SMB (50-500), Enterprise (500-5000), Large Enterprise (5000+) | Adjust threat model (nation-state targeting for enterprise, opportunistic for SMB) |
| **Geography** | Country/region of operations | Prioritize regional threat actors and regulatory-relevant threats |

### Dashboard Sections (personalized)

```
┌─────────────────────────────────────────────────────────────────┐
│  YOUR THREAT LANDSCAPE                                          │
│  Based on: Healthcare + Windows/Azure + Data breach risk        │
│                                                                  │
│  ┌─ Priority Threats ──────────────────────────────────────┐    │
│  │  Threats targeting Healthcare sector this week:          │    │
│  │  • APT41 — new campaign against healthcare orgs          │    │
│  │  • CVE-2026-1234 — Azure AD bypass (your stack)         │    │
│  │  • Ransomware: BlackCat variant targeting HIPAA data     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Your Tech Stack Exposure ──┐  ┌─ Industry Trend ─────────┐ │
│  │  Windows CVEs: 12 new       │  │  Healthcare attacks ▲23% │ │
│  │  Azure CVEs: 3 critical     │  │  vs last month            │ │
│  │  CVSS >8: 5 unpatched      │  │  ▁▂▃▄▅▆▇█ 30d trend      │ │
│  └─────────────────────────────┘  └───────────────────────────┘ │
│                                                                  │
│  ┌─ Risk-Weighted IOCs ────────────────────────────────────┐    │
│  │  Showing IOCs most relevant to your risk profile:        │    │
│  │  (Data breach + Ransomware weighted highest)             │    │
│  │  1. 198.51.100.23 — C2 linked to ransomware (score: 98) │    │
│  │  2. evil-domain.com — data exfil endpoint (score: 95)    │    │
│  │  3. CVE-2026-5678 — RCE in Azure (score: 94)            │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Recommended Actions ───────────────────────────────────┐    │
│  │  Based on your profile, we recommend:                    │    │
│  │  □ Patch 3 critical Azure CVEs (affects your stack)      │    │
│  │  □ Review 5 IOCs linked to healthcare ransomware         │    │
│  │  □ Update firewall rules for 2 new C2 domains            │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### How Profile Drives Content

```
Org Profile → Relevance Scoring Engine → Weighted Results

1. Industry filter:   IOCs/actors/campaigns tagged with matching sector get +30 boost
2. Tech stack filter: CVEs affecting org's technologies get +25 boost
3. Risk filter:       IOCs matching risk categories (ransomware, breach) get +20 boost
4. Geography filter:  Regional threat actors get +15 boost
5. Org size filter:   Threat model adjustment (nation-state vs opportunistic) +10 boost

Dashboard sorts ALL intel by (base_score + relevance_boost) descending
```

### Profile Change → Dashboard Refresh

When org updates their profile in Settings:
1. Relevance scores recalculated for all current IOCs/actors/CVEs
2. Dashboard widgets refresh with new weights
3. Alert rules auto-suggest based on new risk profile
4. Feed recommendations update in Global Catalog ("recommended for Healthcare")

---

## Tab Structure — 9 Tabs, 3 Sections

```
/command-center

                    ┌─ Intelligence ─────────────────────────────┐
Super-admin:        │ [Overview]  [Queue]  [Clients]             │
                    ├─ Management ───────────────────────────────┤
                    │ [Settings]  [Feeds]  [Users & Access]      │
                    ├─ Business ─────────────────────────────────┤
                    │ [Billing & Plans]  [Alerts & Reports]  [System] │
                    └────────────────────────────────────────────┘

                    ┌─ Intelligence ─────────────────────────────┐
Tenant-admin/Free:  │ [Overview]                                 │
                    ├─ Management ───────────────────────────────┤
                    │ [Settings]  [Feeds]  [Users & Access]      │
                    ├─ Business ─────────────────────────────────┤
                    │ [Billing & Plans]  [Alerts & Reports]      │
                    └────────────────────────────────────────────┘
```

### Sidebar — 12 items (down from 22)

```
Dashboard                          ← landing
IOC Search                         ← analyst
IOC Intelligence                   ← analyst
Global Catalog                     ← analyst
Threat Graph                       ← analyst
Threat Actors                      ← analyst
Malware Analysis                   ← analyst
Vulnerability Intel                ← analyst
Threat Hunting                     ← analyst
Digital Risk Protection            ← analyst
Correlation Engine                 ← analyst
Command Center ⬡                  ← 9 tabs inside (admin hub)
```

### Pages absorbed into Command Center

| Old Sidebar Page | Absorbed Into Tab | Section |
|-----------------|-------------------|---------|
| Feed Ingestion | Feeds | Management |
| Enterprise Integration | Users & Access | Management |
| RBAC & SSO | Users & Access | Management |
| Customization | Settings | Management |
| Onboarding | Settings | Management |
| Billing | Billing & Plans | Business |
| Plan Limits | Billing & Plans | Business |
| Alerting | Alerts & Reports | Business |
| Reporting | Alerts & Reports | Business |
| Admin Ops | System | Business |
| Pipeline Monitor | System | Business |
| Analytics | Overview | Intelligence |

### Extensible Tab Registry

```typescript
type TabSection = 'intelligence' | 'management' | 'business';

interface CommandCenterTab {
  id: string;
  label: string;
  icon: LucideIcon;
  section: TabSection;
  roles: ('super_admin' | 'tenant_admin')[];
  badge?: () => number | null;
}

const TABS: CommandCenterTab[] = [
  // Intelligence
  { id: 'overview',         label: 'Overview',         icon: BarChart3,     section: 'intelligence', roles: ['super_admin', 'tenant_admin'] },
  { id: 'queue',            label: 'Queue',            icon: ListOrdered,   section: 'intelligence', roles: ['super_admin'], badge: () => pendingCount },
  { id: 'clients',          label: 'Clients',          icon: Building2,     section: 'intelligence', roles: ['super_admin'], badge: () => overLimitCount },
  // Management
  { id: 'settings',         label: 'Settings',         icon: Settings,      section: 'management',   roles: ['super_admin', 'tenant_admin'] },
  { id: 'feeds',            label: 'Feeds',            icon: Rss,           section: 'management',   roles: ['super_admin', 'tenant_admin'] },
  { id: 'users-access',     label: 'Users & Access',   icon: Users,         section: 'management',   roles: ['super_admin', 'tenant_admin'] },
  // Business
  { id: 'billing-plans',    label: 'Billing & Plans',  icon: CreditCard,    section: 'business',     roles: ['super_admin', 'tenant_admin'] },
  { id: 'alerts-reports',   label: 'Alerts & Reports', icon: Bell,          section: 'business',     roles: ['super_admin', 'tenant_admin'] },
  { id: 'system',           label: 'System',           icon: Activity,      section: 'business',     roles: ['super_admin'] },
];

const visibleTabs = TABS.filter(t => t.roles.includes(user.role));
// Group by section for rendering section headers in tab bar
const groupedTabs = groupBy(visibleTabs, 'section');
```

### Settings Tab — Role-based content (no model names for tenants)

| Section | Super-Admin | Tenant-Admin / Free |
|---------|-------------|---------------------|
| **Org Profile** | View/edit all tenants | Edit own org: industry, tech stack, business risk, size, geography |
| AI Providers & Keys | Full edit (keys, test, assignments, confidence) | — hidden — |
| Model Assignments | Per-subtask model selection with accuracy/cost | — hidden — |
| Confidence Model | Linear / Bayesian toggle | — hidden — |
| Intelligence Quality | — | Accuracy gauge, enrichment stats |
| Alert Sensitivity | — | Low / Balanced / Aggressive |
| Notifications | Global rules | Own notification prefs |
| Onboarding | Manage all tenant wizards | Own setup wizard progress, getting started checklist |
| Upgrade | — | Plan comparison, upgrade CTA, current plan details |
| Platform Preferences | Global defaults | — hidden — |

### Billing & Plans Tab — Tenant-Admin extras

| Section | Super-Admin | Tenant-Admin / Free |
|---------|-------------|---------------------|
| Subscription | All tenant subscriptions | Own plan, usage vs limits |
| Invoices | All invoices | Own invoice history, download PDF |
| Plan Limits | Set per-tenant quotas | View own limits, usage meters |
| Upgrade/Downgrade | — | Compare plans, initiate upgrade |
| Offers & Coupons | Create/manage promotions | Apply coupon code, view active offers |
| Billing Info | — | Update payment method, GST details |

### Sidebar Access — All Roles

```
                        Analyst    Tenant-Admin/Free    Super-Admin
                        ───────    ─────────────────    ───────────
Sidebar (11 intel pages)   ✓ full      ✓ full              ✓ full
Dashboard (org-aware)      ✓ view      ✓ view + edit profile ✓ all
Command Center             ✗           ✓ 6 tabs             ✓ 9 tabs
```

Analysts get ALL functional intelligence features: search, filter, sort, export, pivot, detail panels, bulk actions, hunt sessions, graph exploration. No restrictions on intelligence pages. Command Center is the only analyst exclusion — that's admin territory.

---

## UI Design System Compliance

**Framework:** Tailwind CSS 3.4 with ETIP design tokens
**Charts:** Custom SVG + D3.js v7.9 (no external chart libs)
**Animations:** Framer Motion (subtle, 200ms)
**Icons:** lucide-react
**Font:** Inter (sans), JetBrains Mono (mono/data)
**Theme:** Dark mode default, light mode via `[data-theme="light"]`

### Design-Locked Components (reuse as-is)
- IntelCard (3D hover, Framer Motion)
- SeverityBadge (frozen color map)
- EntityChip (pill shape)
- TopStatsBar / PageStatsBar
- DataTable (sortable, 3 density modes, keyboard nav)

---

## Page Layout

### Desktop (≥1024px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TopStatsBar (h-9, always visible — IOCs, Critical, Feeds, Live)       │
├─────────────────────────────────────────────────────────────────────────┤
│  ThreatPulseStrip (live ticker)                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Page Header ──────────────────────────────────────────────────┐    │
│  │  ⬡ Command Center          [Today ▾] [This Week] [This Month] │    │
│  │  "AI processing & platform management"     [Export CSV] [⟳]   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ KPI Strip (4-6 cards, single row) ────────────────────────────┐    │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │    │
│  │ │ Items    │ │ AI Cost  │ │ Cache    │ │ Budget   │          │    │
│  │ │ 12,450   │ │ $142.30  │ │ Hit 82%  │ │ 34% Used │          │    │
│  │ │ ↑12%     │ │ ↓8%      │ │ ↑3%      │ │ ●●●○○    │          │    │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ Tab Bar ──────────────────────────────────────────────────────┐    │
│  │  [Overview]  [Configuration]  [Queue •3]  [Configure ⚙]       │    │
│  │                                            [Clients 👥 •2]     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ Tab Content (scrollable) ─────────────────────────────────────┐    │
│  │                                                                 │    │
│  │    (varies by active tab — see tab designs below)               │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tablet (768px–1023px)

```
┌───────────────────────────────────────┐
│  TopStatsBar (scrollable)             │
├───────────────────────────────────────┤
│  Page Header (stacked)                │
│  KPI Strip (2×2 grid)                 │
├───────────────────────────────────────┤
│  Tab Bar (scrollable horizontal)      │
├───────────────────────────────────────┤
│  Tab Content                          │
│  (charts stack vertically,            │
│   tables show 4-5 key columns)        │
└───────────────────────────────────────┘
```

### Mobile (< 768px)

```
┌───────────────────────┐
│  TopStatsBar (scroll) │
├───────────────────────┤
│  Header (compact)     │
│  KPI Strip (2×2)      │
├───────────────────────┤
│  Tab Dropdown ▾       │
│  (replaces tab bar)   │
├───────────────────────┤
│  Tab Content          │
│  (single column,      │
│   cards full-width,   │
│   tables → card list, │
│   drawer → fullscreen │
│   modal)              │
└───────────────────────┘
```

---

## KPI Strip Design

Persistent above tabs. Content changes by role.

### Super-Admin KPI Strip

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ 📊 Processed   │ │ 💰 AI Cost     │ │ 🏢 Tenants     │ │ 📈 Consumption │ │ ⚡ Queue        │ │ ⚠️  Alerts     │
│                │ │                │ │                │ │                │ │                │ │                │
│ 12,450         │ │ $142.30        │ │ 24 active      │ │ 89,200 items   │ │ 34 pending     │ │ 2 over limit   │
│ items (MTD)    │ │ this month     │ │ 3 free tier    │ │ across tenants │ │ 0 stuck        │ │ 1 suspended    │
│                │ │                │ │                │ │                │ │                │ │                │
│ ▲ 12% vs last │ │ ▼ 8% vs last  │ │ +2 this month  │ │ ▲ 15% vs last │ │ rate: 42/min   │ │ ● sev-high     │
│ ▁▂▃▄▅▆▇ 7d    │ │ ▇▆▅▄▃▂▁ 7d    │ │                │ │ ▁▂▃▄▅▆▇ 7d    │ │                │ │                │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
```

### Tenant Admin KPI Strip (paid)

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ 📊 Consumed    │ │ 💰 AI Cost     │ │ 📡 Feeds       │ │ 📊 Budget      │
│                │ │                │ │                │ │                │
│ 3,200 items    │ │ $23.45         │ │ 8 subscribed   │ │ ●●●○○ 62%     │
│ this month     │ │ attributed     │ │ 12 available   │ │ $23 / $37 cap │
│                │ │                │ │                │ │                │
│ ▲ 8% vs last  │ │ ▁▂▃▄▅▆▇ 7d    │ │                │ │ 12 days left  │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
```

### Tenant Admin KPI Strip (free)

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐
│ 📊 Consumed    │ │ 💰 AI Cost     │ │ 📡 Feeds       │ │ ⭐ Upgrade           │
│                │ │                │ │                │ │                      │
│ 45 items       │ │ $0.00          │ │ 3 / 3 max     │ │ Unlock AI enrichment │
│ this month     │ │ AI not active  │ │ (free limit)   │ │ + 10 feeds + more    │
│                │ │                │ │                │ │                      │
│ free tier      │ │ ——             │ │ 🔒 Upgrade     │ │ [View Plans →]       │
└────────────────┘ └────────────────┘ └────────────────┘ └──────────────────────┘
```

### KPI Card Component Design

```
┌─ IntelCard wrapper (3D hover) ──────────────┐
│                                              │
│  [Icon]  Label              [trend arrow]    │
│                                              │
│  VALUE (text-2xl font-bold font-mono)        │
│  subtitle (text-xs text-muted)               │
│                                              │
│  ▁▂▃▄▅▆▇  7-day sparkline (SVG, 48×16px)   │
│  or 5-dot gauge (●●●○○)                     │
│  or delta badge (+12% ▲ green / -8% ▼ red)  │
│                                              │
└──────────────────────────────────────────────┘
```

Tailwind: `bg-bg-elevated rounded-xl p-4 border border-border`
Sparkline: Custom SVG polyline, stroke 1.5px, accent color
Delta: `text-sev-low` (positive) / `text-sev-high` (negative)
Responsive: `grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3`

---

## Tab 1: Overview — Detailed Design

### Super-Admin Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌─ Cost Timeline (full width) ──────────────────────────────┐  │
│  │                                                            │  │
│  │  Processing Cost Over Time          [Day] [Week] [Month]  │  │
│  │                                                            │  │
│  │  $160 ┤                                                    │  │
│  │  $120 ┤          ╭─╮                                       │  │
│  │   $80 ┤    ╭─────╯ ╰──╮        ╭──╮                       │  │
│  │   $40 ┤╭───╯          ╰────────╯  ╰───                    │  │
│  │    $0 ┤─────────────────────────────────                   │  │
│  │       Mar 1    Mar 7   Mar 14  Mar 21   Mar 28             │  │
│  │                                                            │  │
│  │  SVG area chart, gradient fill (accent → transparent)      │  │
│  │  Hover: tooltip with exact date + cost + item count        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Cost by Feed Type ────────┐  ┌─ Cost by Model ────────────┐ │
│  │                             │  │                             │ │
│  │  RSS      ████████░░ $82   │  │  Sonnet   ██████████ $95   │ │
│  │  NVD      █████░░░░░ $34   │  │  Haiku    ████░░░░░░ $32   │ │
│  │  STIX     ███░░░░░░░ $16   │  │  Opus     ██░░░░░░░░ $15   │ │
│  │  REST     ██░░░░░░░░  $8   │  │                             │ │
│  │  MISP     █░░░░░░░░░  $2   │  │  Colors: provider-coded    │ │
│  │                             │  │  Anthropic=#8b5cf6          │ │
│  │  Horizontal bar, sorted     │  │  OpenAI=#10b981             │ │
│  │  by value descending        │  │  Google=#f59e0b             │ │
│  └─────────────────────────────┘  └─────────────────────────────┘ │
│                                                                  │
│  ┌─ Cost by Subtask ────────────────────────────────────────┐    │
│  │                                                           │    │
│  │  Heatmap grid: subtask (rows) × day (columns)            │    │
│  │  Color intensity = cost (white → accent → critical)       │    │
│  │  Hover: subtask name, date, cost, item count              │    │
│  │                                                           │    │
│  │  ┌────┬────┬────┬────┬────┬────┬────┐                    │    │
│  │  │ Tr │░░░░│████│░░░░│████│░░░░│░░░░│ Triage             │    │
│  │  │ Ex │████│████│████│████│████│████│ Extraction          │    │
│  │  │ Sc │░░░░│░░░░│████│░░░░│░░░░│░░░░│ Scoring            │    │
│  │  │ At │░░░░│░░░░│░░░░│████│░░░░│░░░░│ Attribution        │    │
│  │  └────┴────┴────┴────┴────┴────┴────┘                    │    │
│  │   M    T    W    T    F    S    S                          │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Tenant Admin Layout (desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌─ Consumption Timeline (full width) ────────────────────────┐  │
│  │                                                             │  │
│  │  Your Consumption This Month              [Day] [Week] [Mo]│  │
│  │                                                             │  │
│  │  150 ┤         ╭──╮                                         │  │
│  │  100 ┤   ╭─────╯  ╰───╮                                    │  │
│  │   50 ┤───╯            ╰────────                             │  │
│  │    0 ┤─────────────────────────                             │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Cost by Provider ──────────┐  ┌─ Cost by IOC Type ─────────┐ │
│  │                              │  │                              │ │
│  │  🟣 Anthropic   $18.20 78%  │  │  IP       ████████░░ $12.4  │ │
│  │  🟢 OpenAI       $3.10 13%  │  │  Domain   █████░░░░░  $6.2  │ │
│  │  🟡 Google       $2.15  9%  │  │  Hash     ███░░░░░░░  $3.1  │ │
│  │                              │  │  URL      █░░░░░░░░░  $1.7  │ │
│  │  Donut chart (SVG)          │  │                              │ │
│  │  Center: $23.45 total       │  │  Horizontal bars             │ │
│  └──────────────────────────────┘  └──────────────────────────────┘ │
│                                                                   │
│  ┌─ Budget Gauge (full width, thin) ──────────────────────────┐  │
│  │  ████████████████████████████████████░░░░░░░░░░░░░░░░░░░░  │  │
│  │  62% used ($23.45 / $37.00)              12 days remaining  │  │
│  │  Color: green <50%, yellow 50-70%, orange 70-90%, red >90%  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Responsive Behavior

| Component | Desktop (≥1024) | Tablet (768-1023) | Mobile (<768) |
|-----------|----------------|-------------------|---------------|
| Cost Timeline | Full width, 300px height | Full width, 200px | Full width, 150px |
| Feed/Model charts | 2-column grid | 2-column | Stack vertical |
| Subtask heatmap | Full grid | Scroll horizontal | Scroll horizontal |
| Donut chart | Side-by-side with bars | Stack | Stack |
| Budget gauge | Full width thin | Full width | Full width |

---

## Tab 2: Configuration — Detailed Design

### Layout (all roles, read-only)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌─ Banner ───────────────────────────────────────────────────┐  │
│  │  🔒 Managed by platform administrator                      │  │
│  │     Model assignments are configured at the platform level  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Current Plan Badge ─────┐                                    │
│  │  Your plan: [Teams ⭐]    │   Effective since: Mar 1, 2026    │
│  └──────────────────────────┘                                    │
│                                                                   │
│  ┌─ Model Assignments Table ──────────────────────────────────┐  │
│  │                                                             │  │
│  │  Category          Subtask         Provider    Model        │  │
│  │  ─────────────────────────────────────────────────────────  │  │
│  │  News Feed         Triage          🟣 Anthropic Haiku 4.5  │  │
│  │                    Extraction      🟣 Anthropic Sonnet 4.6 │  │
│  │                    Classification  🟢 OpenAI    GPT-4o Mini│  │
│  │                    Summarization   🟣 Anthropic Sonnet 4.6 │  │
│  │                    Translation     🟡 Google    Flash 2.5  │  │
│  │  ─────────────────────────────────────────────────────────  │  │
│  │  IOC Enrichment    Risk Scoring    🟣 Anthropic Sonnet 4.6 │  │
│  │                    Context Gen     🟣 Anthropic Sonnet 4.6 │  │
│  │                    ...                                      │  │
│  │  ─────────────────────────────────────────────────────────  │  │
│  │  Reporting         Exec Summary    🟣 Anthropic Sonnet 4.6 │  │
│  │                    ...                                      │  │
│  │                                                             │  │
│  │  Provider dots: 🟣 Anthropic  🟢 OpenAI  🟡 Google         │  │
│  │  text-xs, bg-bg-elevated, border-border                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Cost Estimator (sidebar-style) ──────────────────────────┐   │
│  │                                                            │   │
│  │  Articles/month: [─────●──────────] 5,000                 │   │
│  │                                                            │   │
│  │  Estimated Monthly Cost                                    │   │
│  │  ┌──────────────────────────────┐                          │   │
│  │  │  S1  Sonnet   $25.50        │                          │   │
│  │  │  S2  Sonnet    $6.60        │                          │   │
│  │  │  S3  Haiku     $1.13        │                          │   │
│  │  │  ─────────────────────────  │                          │   │
│  │  │  Total:       $33.23        │                          │   │
│  │  └──────────────────────────────┘                          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Free-Tier Variant

```
┌─ Banner ────────────────────────────────────────────────┐
│  🔒 AI enrichment is not included in the Free plan      │
│     Upgrade to Starter (₹9,999/mo) for AI-powered IOC   │
│     enrichment, risk scoring, and threat attribution     │
│                                           [View Plans →] │
└──────────────────────────────────────────────────────────┘

Model table shows: "Haiku (basic)" for all subtasks
Cost estimator: disabled, shows "Available on Starter+"
```

---

## Tab 3: Queue — Detailed Design (Super-Admin)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌─ Queue Health Bar ─────────────────────────────────────────┐  │
│  │  Pending: 34  │  Rate: 42/min  │  Stuck: 0  │  Age: <2m   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Queue Depth by Subtask (horizontal stacked bar) ──────────┐  │
│  │  Triage       ████████████████░░░░░░░░░░░░  12              │  │
│  │  Extraction   ████████░░░░░░░░░░░░░░░░░░░░   8              │  │
│  │  Scoring      ██████░░░░░░░░░░░░░░░░░░░░░░   6              │  │
│  │  Attribution  ████░░░░░░░░░░░░░░░░░░░░░░░░   4              │  │
│  │  Others       ████░░░░░░░░░░░░░░░░░░░░░░░░   4              │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Pending Items Table ──────────────────────────────────────┐  │
│  │  [□ Select All]  [Batch Enrich (0)]  [⟳ Refresh]          │  │
│  │                                                             │  │
│  │  □  IOC              Type    Severity  Queued    Action     │  │
│  │  ─────────────────────────────────────────────────────────  │  │
│  │  □  198.51.100.23    IP      ● High    2m ago   [Enrich]   │  │
│  │  □  evil-payload.d.  Domain  ● Crit    5m ago   [Enrich]   │  │
│  │  □  a3f2b8c...       Hash    ● Med     8m ago   [Enrich]   │  │
│  │                                                             │  │
│  │  DataTable: density compact, severity row tinting           │  │
│  │  Pagination: 20/page                                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tab 4: Configure — Detailed Design (Super-Admin)

### API Key Management Section

```
┌─ Provider API Keys ──────────────────────────────────────────────┐
│                                                                   │
│  ┌─ Anthropic ───────────────────────────────────────────────┐   │
│  │  🟣 Claude                                    ✅ Connected │   │
│  │  Key: sk-ant-api0•••••••abc1                              │   │
│  │  [Test Connection]  [Update Key]  [Remove]                │   │
│  │  Models available: Opus 4.6, Sonnet 4.6, Haiku 4.5       │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ OpenAI ──────────────────────────────────────────────────┐   │
│  │  🟢 OpenAI                                    ❌ Not set  │   │
│  │  Key: [sk-•••••••••••••••••••••••]  [Save Key]            │   │
│  │  [Test Connection]                                         │   │
│  │  Add key to unlock: o3, GPT-4o, o3-mini, GPT-4o Mini     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Google ──────────────────────────────────────────────────┐   │
│  │  🟡 Gemini                                    ❌ Not set  │   │
│  │  Key: [AIza•••••••••••••••••••••]   [Save Key]            │   │
│  │  [Test Connection]                                         │   │
│  │  Add key to unlock: Gemini 2.5 Pro, Gemini 2.5 Flash     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Model Assignments Table

```
┌─ Model Assignments ────────────────────────────────────────── [Save Changes] ─┐
│                                                                                │
│  ⚠️ Changes affect all tenants using the global processing pipeline             │
│                                                                                │
│  Category         Subtask          Model ▾                Accuracy   Cost/item │
│  ──────────────────────────────────────────────────────────────────────────────│
│  News Feed        Triage           [Haiku 4.5 🟢      ▾]   78%       $0.003  │
│  Processing       Extraction       [Sonnet 4.6         ▾]   92%       $0.025  │
│                   Classification   [GPT-4o Mini 🟢    ▾]   81%       $0.001  │
│                   Summarization    [Sonnet 4.6 🟡      ▾]   92%       $0.025  │
│                   Translation      [Flash 2.5 🟢      ▾]   79%       $0.001  │
│  ──────────────────────────────────────────────────────────────────────────────│
│  IOC              Risk Scoring     [Sonnet 4.6 🟡      ▾]   94%       $0.028  │
│  Enrichment       Context Gen      [Sonnet 4.6         ▾]   92%       $0.025  │
│                   Attribution      [o3 🟡              ▾]   96%       $0.110  │
│                   Campaign Link    [GPT-4o             ▾]   89%       $0.018  │
│                   False Positive   [Haiku 4.5 🟢      ▾]   78%       $0.003  │
│  ──────────────────────────────────────────────────────────────────────────────│
│  Reporting        Exec Summary     [Sonnet 4.6 🟡      ▾]   93%       $0.030  │
│                   Technical Detail [Sonnet 4.6         ▾]   91%       $0.028  │
│                   Trend Analysis   [Gemini 2.5 Pro     ▾]   90%       $0.015  │
│                   Recommendation   [Haiku 4.5 🟢      ▾]   76%       $0.003  │
│                   Formatting       [Flash 2.5 🟢      ▾]   74%       $0.001  │
│  ──────────────────────────────────────────────────────────────────────────────│
│                                                                                │
│  Accuracy: ≥90% text-sev-low │ 80-89% text-sev-medium │ <80% text-sev-high  │
│  Stars: 🟡 = best accuracy in provider │ 🟢 = best cost in provider          │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Model Dropdown (expanded)

```
┌─ Select Model ──────────────────────────────────┐
│                                                  │
│  ── Anthropic ──────────────────────────────     │
│  │  🟡 Claude Opus 4.6      96%    $0.110  │    │
│  │     Claude Sonnet 4.6    92%    $0.025  │    │
│  │  🟢 Claude Haiku 4.5     78%    $0.003  │    │
│                                                  │
│  ── OpenAI ─────────────────────────────────     │
│  │  🟡 o3                   95%    $0.085  │    │
│  │     GPT-4o               89%    $0.018  │    │
│  │     o3-mini              83%    $0.008  │    │
│  │  🟢 GPT-4o Mini          79%    $0.001  │    │
│                                                  │
│  ── Google ─────────────────────────────────     │
│  │  🟡 Gemini 2.5 Pro       90%    $0.015  │    │
│  │  🟢 Gemini 2.5 Flash     76%    $0.001  │    │
│                                                  │
│  Hover: shows full pricing breakdown tooltip     │
│  Disabled providers grayed: "Add API key to      │
│  unlock" text                                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Confidence Model Toggle

```
┌─ Confidence Model ───────────────────────────────┐
│                                                   │
│  ○ Linear    Weighted average (0.35 feed +        │
│              0.35 corroboration + 0.30 AI)        │
│                                                   │
│  ● Bayesian  Log-odds with multiplicative         │
│              impact for high-reliability sources   │
│                                                   │
│  Radio buttons, bg-accent/10 on selected          │
└───────────────────────────────────────────────────┘
```

---

## Tab 5: Clients — Detailed Design (Super-Admin)

### Summary Cards + Table + Drawer

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌─ Summary Cards (4-col) ────────────────────────────────────┐  │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────┐│  │
│  │ │ Platform    │ │ Items       │ │ Active      │ │ ⚠️ Over ││  │
│  │ │ $142.30     │ │ 89,200      │ │ 24 tenants  │ │ 2 limit ││  │
│  │ │ MTD cost    │ │ consumed    │ │ 3 free tier │ │ 1 susp  ││  │
│  │ └─────────────┘ └─────────────┘ └─────────────┘ └────────┘│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Filter Bar ───────────────────────────────────────────────┐  │
│  │  [🔍 Search tenant...]  [Plan: All ▾]  [Status: All ▾]    │  │
│  │  [Sort: Cost ▾]  [Saved: High Consumers ▾]                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Tenant Table ─────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  Tenant           Plan      Members Items   Cost    Usage  │  │
│  │  ────────────────────────────────────────────────────────── │  │
│  │  Acme Corp        [Teams]   12      8,400   $28.30  ●●●●○ │  │
│  │  ThreatDefend     [Enter]    8      6,200   $21.10  ●●●○○ │  │
│  │  SecOps Inc       [Start]    3      2,100    $7.20  ●●○○○ │  │
│  │  ⚠️ CyberWatch    [Teams]    5      4,800   $35.00  ●●●●● │  │
│  │  🔴 NullSec       [Free]     1         45    $0.00  susp  │  │
│  │                                                             │  │
│  │  Row hover: bg-bg-hover, click → opens detail drawer       │  │
│  │  Over-limit rows: border-l-2 border-sev-high               │  │
│  │  Suspended rows: opacity-60, strikethrough                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Tenant Detail Drawer (right side, w-[480px])

```
┌─ CyberWatch — Detail ─────────── [×] ─┐
│                                         │
│  ┌─ Header ──────────────────────────┐ │
│  │  CyberWatch Inc    [Teams ⭐]      │ │
│  │  5 members  │  Since: Jan 2026    │ │
│  │  Status: ⚠️ Over Monthly Limit     │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ 30-Day Consumption ──────────────┐ │
│  │  ▁▂▃▅▇█▇▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇  │ │
│  │  Sparkline: items/day, 200×60px    │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Cost Attribution ────────────────┐ │
│  │  By Provider:                      │ │
│  │  🟣 Anthropic  $28.50  82%        │ │
│  │  🟢 OpenAI      $4.20  12%        │ │
│  │  🟡 Google      $2.30   6%        │ │
│  │                                    │ │
│  │  By Item Type:                     │ │
│  │  IOC    $22.00 │ Article  $10.00  │ │
│  │  Report  $3.00 │                   │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Top 5 Costly Items ─────────────┐ │
│  │  1. CVE-2026-1234    $1.20       │ │
│  │  2. 198.51.100.23    $0.85       │ │
│  │  3. evil-domain.com  $0.72       │ │
│  │  ...                              │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Limits ──────────────────────────┐ │
│  │  Daily:   [____500____] tokens    │ │
│  │  Monthly: [___$37.00__] USD       │ │
│  │  [Apply]                          │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Quick Actions ───────────────────┐ │
│  │  [⏸ Pause AI]  [🔄 Reset Counter] │ │
│  │  [📊 Export]   [📋 Limit History]  │ │
│  └────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

---

## Chart & Visualization Specifications

All charts custom SVG (matching existing D3 pattern).

| Chart | Type | Size | Colors |
|-------|------|------|--------|
| Cost Timeline | Area chart w/ gradient fill | Full width, h-[200px] lg:h-[280px] | accent → accent/10 gradient |
| Cost by Feed Type | Horizontal bars | Half width, h-[200px] | accent shades (10%-100% opacity) |
| Cost by Model | Horizontal bars grouped by provider | Half width, h-[200px] | Provider colors (🟣🟢🟡) |
| Subtask Heatmap | Grid cells | Full width, h-[160px] | white → accent → sev-critical intensity |
| Consumption Donut | Donut with center label | 160×160px | Provider colors |
| Budget Gauge | Thin horizontal bar | Full width, h-[24px] | sev-low → sev-medium → sev-high → sev-critical |
| Sparklines | Polyline | 48×16px (KPI cards), 200×60px (drawer) | accent stroke, 1.5px |
| Queue Depth | Stacked horizontal bars | Full width, h-[120px] | Subtask-coded colors |
| Usage Dots | 5-dot gauge (●●●○○) | Inline, gap-0.5 | accent filled, border-muted empty |

### Interaction Patterns

- **Hover:** All charts show tooltip (bg-bg-elevated, border-border, shadow-md, rounded-lg, p-2)
- **Click:** Charts with drill-down navigate or filter
- **Animate:** Bars/areas animate in on mount (Framer Motion, 400ms ease-out)
- **Responsive:** Charts resize via `viewBox` SVG, maintain aspect ratio

---

## Component Hierarchy

```
CommandCenterPage
├── PageStatsBar (KPI strip — role-dependent content)
├── PageHeader (title, date range picker, export button)
├── SectionTabBar (grouped by section, filtered by role, with badges)
│   ├── Section headers: Intelligence | Management | Business
│   ├── Tab badges: pending count (Queue), over-limit count (Clients)
│   └── Mobile: dropdown selector replacing tabs
├── TabContent
│   ├── OverviewTab (intelligence — all roles)
│   │   ├── SuperAdminOverview
│   │   │   ├── CostTimeline (SVG area chart)
│   │   │   ├── CostByFeedType (horizontal bars)
│   │   │   ├── CostByModel (horizontal bars, provider-colored)
│   │   │   ├── SubtaskHeatmap (grid cells)
│   │   │   └── PlatformAnalytics (absorbed from AnalyticsPage)
│   │   └── TenantOverview
│   │       ├── ConsumptionTimeline (SVG area chart)
│   │       ├── CostByProvider (donut chart)
│   │       ├── CostByIOCType (horizontal bars)
│   │       └── BudgetGauge (thin bar)
│   ├── QueueTab (intelligence — super-admin)
│   │   ├── QueueHealthBar (stats)
│   │   ├── QueueDepthChart (stacked bars)
│   │   └── PendingItemsTable (DataTable, selectable, batch actions)
│   ├── ClientsTab (intelligence — super-admin)
│   │   ├── SummaryCards (4-card grid)
│   │   ├── FilterBar (search, plan filter, status filter)
│   │   ├── TenantTable (DataTable, clickable rows)
│   │   └── TenantDetailDrawer (slide-out, 480px)
│   ├── SettingsTab (management — all roles, content varies)
│   │   ├── SuperAdminSettings
│   │   │   ├── ProviderKeyCards (3 provider cards)
│   │   │   ├── ModelAssignmentsTable (editable dropdowns)
│   │   │   │   └── ModelDropdown (grouped by provider, stars, accuracy, cost)
│   │   │   ├── ConfidenceModelToggle (radio)
│   │   │   └── PlatformPreferences (global defaults)
│   │   └── TenantSettings (no AI model names or technical details)
│   │       ├── IntelligenceQuality (accuracy gauge, enrichment stats)
│   │       ├── IndustryFocus (sector selector for relevance scoring)
│   │       ├── AlertSensitivity (Low / Balanced / Aggressive)
│   │       ├── NotificationPreferences (digest, real-time, quiet hours)
│   │       ├── OnboardingProgress (setup wizard status)
│   │       └── UpgradeCTA (free users — plan comparison)
│   ├── FeedsTab (management — all roles, absorbed from FeedIngestionPage)
│   │   ├── FeedList (CRUD for super-admin, read-only for tenant)
│   │   ├── ConnectorStatus (RSS/NVD/STIX/REST/MISP health)
│   │   └── FeedScheduler (super-admin)
│   ├── UsersAccessTab (management — all roles, absorbed RBAC + Integration)
│   │   ├── TeamMembers (RBAC — roles, invite, remove)
│   │   ├── SSOConfig (super-admin — SSO provider setup)
│   │   └── Integrations (SIEM/SOAR/webhook config)
│   ├── BillingPlansTab (business — all roles, absorbed Billing + Plan Limits)
│   │   ├── SubscriptionInfo (current plan, usage meters)
│   │   ├── InvoiceHistory (past invoices)
│   │   ├── PlanLimits (super-admin — per-tenant quotas)
│   │   └── UpgradeFlow (free/starter users)
│   ├── AlertsReportsTab (business — all roles, absorbed Alerting + Reporting)
│   │   ├── AlertRules (create/edit/toggle alert rules)
│   │   ├── AlertHistory (past alerts, acknowledge)
│   │   ├── ReportTemplates (create/clone templates)
│   │   └── ReportGeneration (generate, schedule, export)
│   └── SystemTab (business — super-admin only, absorbed AdminOps + Pipeline)
│       ├── SystemHealth (container status, resource usage)
│       ├── PipelineMonitor (queue flow, throughput, stuck items)
│       ├── MaintenanceMode (enable/disable, schedule)
│       └── BackupRestore (backup history, trigger restore)
└── FreeTierUpgradeBanner (conditional)
```

---

## Data Model

### Global Table: `ai_processing_costs` (no tenant_id)

```sql
CREATE TABLE ai_processing_costs (
  id            TEXT PRIMARY KEY,
  item_id       TEXT NOT NULL,
  item_type     TEXT NOT NULL,      -- 'article' | 'ioc' | 'report'
  subtask       TEXT NOT NULL,
  provider      TEXT NOT NULL,      -- 'anthropic' | 'openai' | 'google'
  model         TEXT NOT NULL,
  input_tokens  INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_usd      DECIMAL(10,6) NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_apc_item ON ai_processing_costs(item_id, item_type);
CREATE INDEX idx_apc_date ON ai_processing_costs(processed_at);
CREATE INDEX idx_apc_subtask ON ai_processing_costs(subtask);
```

### Per-Tenant Table: `tenant_item_consumption` (has tenant_id)

```sql
CREATE TABLE tenant_item_consumption (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, item_id, item_type)
);
CREATE INDEX idx_tic_tenant ON tenant_item_consumption(tenant_id, consumed_at);
CREATE INDEX idx_tic_item ON tenant_item_consumption(item_id);
```

### Key Queries

```sql
-- Tenant: my attributed cost this month
SELECT COUNT(c.item_id), SUM(p.cost_usd), p.provider, p.model
FROM tenant_item_consumption c
JOIN ai_processing_costs p ON c.item_id = p.item_id AND c.item_type = p.item_type
WHERE c.tenant_id = $1 AND c.consumed_at >= date_trunc('month', NOW())
GROUP BY p.provider, p.model;

-- Super-admin: global processing cost by day
SELECT SUM(cost_usd), date_trunc('day', processed_at), subtask, provider
FROM ai_processing_costs
WHERE processed_at >= date_trunc('month', NOW())
GROUP BY 2, subtask, provider;

-- Super-admin: per-tenant consumption
SELECT c.tenant_id, COUNT(DISTINCT c.item_id), SUM(p.cost_usd)
FROM tenant_item_consumption c
JOIN ai_processing_costs p ON c.item_id = p.item_id AND c.item_type = p.item_type
WHERE c.consumed_at >= date_trunc('month', NOW())
GROUP BY c.tenant_id;
```

---

## What Gets Removed/Changed

| Current Sidebar Page | Action |
|---------------------|--------|
| `/global-ai-config` page | DELETE → Settings tab (super-admin AI section) |
| `/enrichment` page | DELETE → Queue tab + Overview tab |
| `/customization` page | DELETE → Settings tab |
| `/feed-ingestion` page | DELETE → Feeds tab |
| `/rbac` page | DELETE → Users & Access tab |
| `/integration` page | DELETE → Users & Access tab |
| `/billing` page | DELETE → Billing & Plans tab |
| `/plan-limits` page | DELETE → Billing & Plans tab |
| `/alerting` page | DELETE → Alerts & Reports tab |
| `/reporting` page | DELETE → Alerts & Reports tab |
| `/admin-ops` page | DELETE → System tab |
| `/analytics` page | DELETE → Overview tab (platform metrics) |
| `/onboarding` page | DELETE → Settings tab (onboarding section) |
| Sidebar "AI Enrichment" | Rename → "Command Center" |
| Sidebar "AI Config" | DELETE |
| 10 more sidebar entries | DELETE (absorbed into CC tabs) |
| `AI_MODELS = ['haiku', 'sonnet', 'opus']` | REPLACE → multi-provider ModelRegistry |
| In-memory cost tracking | KEEP as hot cache + ADD Postgres |
| BYOK (Anthropic only) | EXPAND → 3 providers in Settings tab |
| Module toggles (customization) | DELETE — plan tier governs access |

## Implementation Status

### Phase A: Backend + Data Layer — DONE (S105)

1. Model Registry (shared constant, 9 models, pricing, accuracy benchmarks)
2. Postgres migrations (2 tables)
3. Cost write path (ingestion + enrichment → global table)
4. Consumption tracking middleware (API calls → tenant table)
5. Provider Key Store (3-provider CRUD + test connection)
6. Backend API endpoints for Command Center queries

### Phase B: Frontend Shell + 3 Admin Tabs — DONE (S106)

7. CommandCenterPage shell (tab registry, role gating, KPI strip)
8. ConfigureTab (API keys, model dropdown with stars, assignments table)
9. ClientsTab (summary cards, tenant table, detail drawer)
10. QueueTab (health bar, depth chart, pending table)

### Phase C: Overview + Settings tabs — NEXT (S107)

11. OverviewTab (super-admin: cost timeline, feed/model/subtask charts, platform analytics; tenant: consumption, donut, budget gauge)
12. SettingsTab (super-admin: AI config; tenant: outcome-focused — quality gauge, industry focus, alert sensitivity, notifications, onboarding)
13. 6 SVG chart components (CostTimeline, CostByFeedType, CostByModel, SubtaskHeatmap, ConsumptionDonut, BudgetGauge)

### Phase D: Remaining 4 tabs — S108

14. FeedsTab (absorb FeedIngestionPage content)
15. UsersAccessTab (absorb RBAC + Enterprise Integration)
16. BillingPlansTab (absorb Billing + Plan Limits)
17. AlertsReportsTab (absorb Alerting + Reporting)

### Phase E: System tab + Sidebar cleanup — S109

18. SystemTab (absorb Admin Ops + Pipeline Monitor)
19. Sidebar cleanup (remove 12 absorbed pages, keep 11 intelligence + CC)
20. Route redirects (all old routes → `/command-center`)
21. Delete old page components
22. Mobile responsive pass + final testing

## Verification

- Super-admin: 9 tabs across 3 sections, full control + global visibility
- Tenant admin (paid): 6 tabs, outcome-focused settings, NO AI model/provider names visible
- Free user: same 6 tabs as tenant admin, with upgrade CTAs, plan comparison
- Regular user: no Command Center access, AI results in detail panels only
- Multiple tenant admins same org: identical view
- Tenant A cannot see Tenant B's data
- Module access governed by subscription plan (no manual toggle)
- Global cost not multiplied by consumers
- All charts responsive (desktop → tablet → mobile)
- Model dropdown shows only providers with valid API keys (super-admin only)
- Old routes redirect to `/command-center`
- Drawer closes on Esc, mobile renders as fullscreen modal
- Tab badges show live counts
- Section headers group tabs visually in tab bar
