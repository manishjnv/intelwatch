# Command Center — Complete Implementation Plan

## Context

3 fragmented AI pages → 1 unified `/command-center` page. Global processing model (AI costs incurred once, consumption tracked per-tenant). Super-admin: 5 tabs. Tenant admin: 2 read-only tabs. Multi-provider AI. Extensible tab architecture for future admin sections.

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

| Role | Description | Tabs Visible |
|------|-------------|-------------|
| Super Admin | Platform owner. Full control. | 5 tabs (3 read + 2 admin) |
| Tenant Admin | Org manager. Min 1, max all. Multiple see identical views. | 2 read-only tabs |
| Regular User | Analyst. Display designation (Analyst/Lead/Manager) only. | No access (AI results inline in detail panels) |

- Free tier = solo tenant admin with 0 employees, free-tier content
- Original signup user cannot be demoted/removed
- Any user can be promoted to tenant admin by existing tenant admin

---

## Tab Structure

```
/command-center

Super-admin:    [Overview]  [Configuration]  [Queue]  [Configure ⚙️]  [Clients 👥]
Tenant admin:   [Overview]  [Configuration]
```

### Extensible Tab Registry

```typescript
interface CommandCenterTab {
  id: string;
  label: string;
  icon: LucideIcon;
  section: 'ai' | 'platform' | 'business';  // future sections
  roles: ('super_admin' | 'tenant_admin')[];
  badge?: () => number | null;               // dynamic notification count
}

const TABS: CommandCenterTab[] = [
  { id: 'overview',      label: 'Overview',      icon: BarChart3,   section: 'ai', roles: ['super_admin', 'tenant_admin'] },
  { id: 'configuration', label: 'Configuration', icon: Sliders,     section: 'ai', roles: ['super_admin', 'tenant_admin'] },
  { id: 'queue',         label: 'Queue',         icon: ListOrdered, section: 'ai', roles: ['super_admin'], badge: () => pendingCount },
  { id: 'configure',     label: 'Configure',     icon: Settings,    section: 'ai', roles: ['super_admin'] },
  { id: 'clients',       label: 'Clients',       icon: Users,       section: 'ai', roles: ['super_admin'], badge: () => overLimitCount },
  // Future: { id: 'system-health', label: 'Health', icon: Activity, section: 'platform', roles: ['super_admin'] },
];

// Filter by role
const visibleTabs = TABS.filter(t => t.roles.includes(user.role));
```

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
├── TabBar (filtered by role, with badges)
│   ├── Tab badge: pending count (Queue), over-limit count (Clients)
│   └── Mobile: dropdown selector replacing tabs
├── TabContent
│   ├── OverviewTab
│   │   ├── SuperAdminOverview
│   │   │   ├── CostTimeline (SVG area chart)
│   │   │   ├── CostByFeedType (horizontal bars)
│   │   │   ├── CostByModel (horizontal bars, provider-colored)
│   │   │   └── SubtaskHeatmap (grid cells)
│   │   └── TenantOverview
│   │       ├── ConsumptionTimeline (SVG area chart)
│   │       ├── CostByProvider (donut chart)
│   │       ├── CostByIOCType (horizontal bars)
│   │       └── BudgetGauge (thin bar)
│   ├── ConfigurationTab (read-only for all)
│   │   ├── ManagedBanner
│   │   ├── PlanBadge
│   │   ├── ModelAssignmentsTable (display-only DataTable)
│   │   └── CostEstimator (slider + breakdown)
│   ├── QueueTab (super-admin)
│   │   ├── QueueHealthBar (stats)
│   │   ├── QueueDepthChart (stacked bars)
│   │   └── PendingItemsTable (DataTable, selectable, batch actions)
│   ├── ConfigureTab (super-admin)
│   │   ├── ProviderKeyCards (3 provider cards)
│   │   ├── ModelAssignmentsTable (editable dropdowns)
│   │   │   └── ModelDropdown (grouped by provider, stars, accuracy, cost)
│   │   └── ConfidenceModelToggle (radio)
│   └── ClientsTab (super-admin)
│       ├── SummaryCards (4-card grid)
│       ├── FilterBar (search, plan filter, status filter, saved filters)
│       ├── TenantTable (DataTable, clickable rows)
│       └── TenantDetailDrawer (slide-out, 480px)
│           ├── ConsumptionSparkline
│           ├── CostBreakdown
│           ├── TopCostlyItems
│           ├── LimitEditor
│           └── QuickActions
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

| Current | Action |
|---------|--------|
| `/global-ai-config` page | DELETE → Tab 4 |
| `/customization` AI Config tab | DELETE → Tab 2 (read-only) |
| `/enrichment` page | REBRAND → `/command-center` with 5 tabs |
| Sidebar "AI Enrichment" | Rename → "Command Center" |
| Sidebar "AI Config" | DELETE |
| Plan-tier model presets | DELETE — accuracy primary |
| `AI_MODELS = ['haiku', 'sonnet', 'opus']` | REPLACE → multi-provider ModelRegistry |
| In-memory cost tracking | KEEP as hot cache + ADD Postgres |
| BYOK (Anthropic only) | EXPAND → 3 providers in Tab 4 |

## New Files

| File | Purpose |
|------|---------|
| `packages/shared-utils/src/model-registry.ts` | Multi-provider model catalog + pricing + accuracy |
| `apps/customization/src/services/provider-key-store.ts` | 3-provider API key CRUD |
| Prisma migration: `ai_processing_costs` | Global cost table |
| Prisma migration: `tenant_item_consumption` | Consumption tracking |
| `apps/frontend/src/pages/CommandCenterPage.tsx` | Page shell + tab routing |
| `apps/frontend/src/components/command-center/OverviewTab.tsx` | Tab 1 |
| `apps/frontend/src/components/command-center/ConfigurationTab.tsx` | Tab 2 |
| `apps/frontend/src/components/command-center/QueueTab.tsx` | Tab 3 |
| `apps/frontend/src/components/command-center/ConfigureTab.tsx` | Tab 4 |
| `apps/frontend/src/components/command-center/ClientsTab.tsx` | Tab 5 |
| `apps/frontend/src/components/command-center/TenantDetailDrawer.tsx` | Drawer |
| `apps/frontend/src/components/command-center/ModelDropdown.tsx` | Multi-provider dropdown |
| `apps/frontend/src/components/command-center/charts/` | SVG chart components |
| `apps/frontend/src/hooks/use-command-center.ts` | Data hooks |

## Implementation Order (split across 2-3 sessions)

### Session A: Backend + Data Layer
1. Model Registry (shared constant, 9 models, pricing, accuracy benchmarks)
2. Postgres migrations (2 tables)
3. Cost write path (ingestion + enrichment → global table)
4. Consumption tracking middleware (API calls → tenant table)
5. Provider Key Store (3-provider CRUD + test connection)
6. Backend API endpoints for Command Center queries

### Session B: Frontend — Shell + Admin Tabs
7. CommandCenterPage shell (tab registry, role gating, KPI strip)
8. Tab 4: Configure (API keys, model dropdown with stars, assignments table)
9. Tab 5: Clients (summary cards, tenant table, detail drawer)
10. Tab 3: Queue (health bar, depth chart, pending table)

### Session C: Frontend — Shared Tabs + Cleanup
11. Tab 1: Overview (super-admin vs tenant views, all charts)
12. Tab 2: Configuration (read-only table, cost estimator, free-tier variant)
13. Cleanup (delete old pages, update routes/sidebar, redirects)
14. Mobile responsive pass + testing

## Verification

- Super-admin: 5 tabs, full control + global visibility, all charts render
- Tenant admin (paid): 2 tabs, read-only, own consumption + attributed cost
- Tenant admin (free): 2 tabs, free-tier content, upgrade prompts, no AI data
- Regular user: no Command Center access, AI results in detail panels only
- Multiple tenant admins same org: identical view
- Tenant A cannot see Tenant B's data
- Global cost not multiplied by consumers
- All charts responsive (desktop → tablet → mobile)
- Model dropdown shows only providers with valid API keys
- Stars update per subtask when model changes
- Old routes (`/enrichment`, `/global-ai-config`) redirect to `/command-center`
- Drawer closes on Esc, mobile renders as fullscreen modal
- Tab badges show live counts
