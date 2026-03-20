# SKILL: UI/UX Platform Design
**ID:** 20-ui-ux | **Version:** 3.0
**Scope:** All frontend — design system, entity highlighting, stats bars, 3D effects, tooltips, mobile

---

## DESIGN PRINCIPLES
1. **Entity-first** — Every IP, domain, hash, actor name, CVE = clickable, highlighted, searchable
2. **Data-dense** — Analysts need information; avoid excessive whitespace
3. **Dark mode first** — Security platforms live in dark rooms
4. **Instant feel** — Skeleton screens, 48hr cache, optimistic updates
5. **Mobile-ready** — Full functionality at 375px, not just "viewable"
6. **Guided** — Every feature has a tooltip + inline help; no confusion allowed
7. **3D depth** — Subtle 3D transforms on interactive cards for premium feel

---

## TECH STACK (FRONTEND)

```
React 18 + TypeScript 5 + Vite 5
shadcn/ui + Tailwind CSS 3
TanStack Query v5 + Zustand 4
TanStack Table v8 (virtualized)
React Flow + D3.js (graph)
Recharts + D3 (charts)
Framer Motion 10 (3D effects, animations)
Floating UI (tooltips, popovers)
React Hook Form + Zod (forms)
```

---

## COLOR SYSTEM

```css
/* globals.css */
:root {
  --bg-base:      #07090e;
  --bg-primary:   #0d1117;
  --bg-secondary: #131920;
  --bg-elevated:  #1a2332;
  --bg-hover:     #1e2a3a;
  --bg-active:    #243244;

  --border:        #1e2d42;
  --border-strong: #2a3f5a;
  --border-focus:  #3b82f6;

  --text-primary:   #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted:     #64748b;
  --text-link:      #60a5fa;

  --accent:         #3b82f6;
  --accent-hover:   #2563eb;
  --accent-glow:    rgba(59, 130, 246, 0.15);

  /* Severity — consistent across entire app */
  --sev-critical: #ef4444;
  --sev-high:     #f97316;
  --sev-medium:   #eab308;
  --sev-low:      #22c55e;
  --sev-info:     #64748b;

  /* TLP */
  --tlp-white: #e2e8f0;
  --tlp-green: #22c55e;
  --tlp-amber: #eab308;
  --tlp-red:   #ef4444;

  /* 3D depth shadows */
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.4);
  --shadow-md:  0 4px 6px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4);
  --shadow-lg:  0 10px 25px rgba(0,0,0,0.6), 0 4px 10px rgba(0,0,0,0.4);
  --shadow-glow-blue:   0 0 20px rgba(59,130,246,0.2);
  --shadow-glow-red:    0 0 20px rgba(239,68,68,0.2);
  --shadow-glow-orange: 0 0 20px rgba(249,115,22,0.2);
}
```

---

## TOP STATS BAR (Platform-wide, always visible)

```tsx
// Shown at very top of every page — platform-wide pulse
export function TopStatsBar() {
  const { data: stats } = usePlatformStats()  // 30 min cache
  
  return (
    <div className="h-9 bg-bg-secondary border-b border-border flex items-center px-4 gap-6 text-xs shrink-0">
      <StatItem icon={<Shield className="w-3 h-3" />} label="IOCs" value={stats?.totalIOCs} />
      <StatDivider />
      <StatItem icon={<AlertTriangle className="w-3 h-3 text-sev-critical" />} label="Critical" value={stats?.criticalIOCs} highlight="critical" />
      <StatDivider />
      <StatItem icon={<Activity className="w-3 h-3" />} label="Feeds" value={`${stats?.activeFeeds} active`} />
      <StatDivider />
      <StatItem icon={<Zap className="w-3 h-3 text-yellow-400" />} label="Enriched today" value={stats?.enrichedToday} />
      <StatDivider />
      <StatItem icon={<Clock className="w-3 h-3" />} label="Last ingest" value={stats?.lastIngestTime} />
      
      {/* Live indicator */}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-text-muted">Live</span>
      </div>
    </div>
  )
}
```

## PAGE-SPECIFIC STATS BAR (Compact, below page header)

```tsx
// Each module has its own compact stats bar
export function IOCStatsBar() {
  const { data } = useIOCStats()  // 1hr cache
  return (
    <div className="flex items-center gap-4 px-6 py-2 bg-bg-elevated/50 border-b border-border text-xs">
      <CompactStat label="Total" value={data?.total} />
      <CompactStat label="Critical" value={data?.critical} color="var(--sev-critical)" />
      <CompactStat label="High" value={data?.high} color="var(--sev-high)" />
      <CompactStat label="Medium" value={data?.medium} color="var(--sev-medium)" />
      <CompactStat label="Added today" value={data?.addedToday} />
      <CompactStat label="Enriched" value={`${data?.enrichmentRate}%`} />
      <CompactStat label="Archived" value={data?.archived} color="var(--text-muted)" />
    </div>
  )
}
```

---

## ENTITY HIGHLIGHTING & CLICKABLE ENTITIES

All intelligence values are **highlighted, colored, and clickable** throughout the entire app:

```tsx
// EntityChip — the core clickable entity component
interface EntityChipProps {
  type: 'ip' | 'domain' | 'hash' | 'cve' | 'actor' | 'malware' | 'url' | 'email'
  value: string
  severity?: Severity
  showCopy?: boolean
  showSearch?: boolean
}

export function EntityChip({ type, value, severity, showCopy = true, showSearch = true }: EntityChipProps) {
  const [showActions, setShowActions] = useState(false)
  const navigate = useNavigate()
  
  const typeStyle: Record<string, string> = {
    ip:      'bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20',
    domain:  'bg-purple-500/10 text-purple-300 border-purple-500/20 hover:bg-purple-500/20',
    hash:    'bg-slate-500/10 text-slate-300 border-slate-500/20 hover:bg-slate-500/20 font-mono text-[10px]',
    cve:     'bg-orange-500/10 text-orange-300 border-orange-500/20 hover:bg-orange-500/20',
    actor:   'bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20',
    malware: 'bg-pink-500/10 text-pink-300 border-pink-500/20 hover:bg-pink-500/20',
    url:     'bg-cyan-500/10 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/20',
    email:   'bg-green-500/10 text-green-300 border-green-500/20 hover:bg-green-500/20',
  }
  
  return (
    <Popover>
      <PopoverTrigger>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs cursor-pointer transition-all ${typeStyle[type]}`}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => setShowActions(false)}
        >
          <EntityTypeIcon type={type} className="w-3 h-3" />
          <span className={type === 'hash' ? 'max-w-[120px] truncate' : ''}>{value}</span>
          {severity && <SeverityDot severity={severity} />}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-bg-elevated border-border shadow-lg p-3">
        <EntityQuickView type={type} value={value} />
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          <Button size="sm" variant="outline" onClick={() => navigate(`/${type}/${encodeURIComponent(value)}`)}>
            <ExternalLink className="w-3 h-3 mr-1" /> View Detail
          </Button>
          <Button size="sm" variant="outline" onClick={() => openLocalSearch(value)}>
            <Search className="w-3 h-3 mr-1" /> Local Search
          </Button>
          <Button size="sm" variant="outline" onClick={() => openInternetSearch(value, type)}>
            <Globe className="w-3 h-3 mr-1" /> Internet
          </Button>
          {showCopy && <CopyButton value={value} />}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

### Entity Quick View (Popover on hover)
```tsx
// Shows a mini-summary of the entity inline — no navigation needed
function EntityQuickView({ type, value }: { type: string, value: string }) {
  const { data, isLoading } = useEntitySummary(type, value)
  
  if (isLoading) return <Skeleton className="h-16" />
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <EntityTypeBadge type={type} />
        {data?.severity && <SeverityBadge severity={data.severity} />}
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{data?.summary ?? 'No summary available'}</p>
      {data?.enrichment && (
        <div className="flex gap-2 flex-wrap mt-1">
          {data.enrichment.malwareFamilies?.slice(0, 2).map(m => (
            <span key={m} className="px-1.5 py-0.5 bg-pink-500/10 text-pink-300 text-[10px] rounded">{m}</span>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Local + Internet Search
```typescript
function openLocalSearch(value: string) {
  // Search within platform — opens investigation panel with results
  globalSearchStore.open(value)
}

function openInternetSearch(value: string, type: string) {
  const searchUrls: Record<string, string> = {
    ip:     `https://www.shodan.io/host/${value}`,
    domain: `https://www.virustotal.com/gui/domain/${value}`,
    sha256: `https://www.virustotal.com/gui/file/${value}`,
    cve:    `https://nvd.nist.gov/vuln/detail/${value}`,
    url:    `https://urlscan.io/search/#${encodeURIComponent(value)}`,
    email:  `https://haveibeenpwned.com/account/${encodeURIComponent(value)}`,
    actor:  `https://attack.mitre.org/groups/?query=${encodeURIComponent(value)}`,
    default: `https://www.google.com/search?q=${encodeURIComponent(value)}+threat+intelligence`
  }
  window.open(searchUrls[type] ?? searchUrls.default, '_blank')
}
```

---

## INVESTIGATION VIEW (Relationship Sidebar)

```tsx
// Right-side panel that shows related entities for selected entity
export function InvestigationPanel({ entityType, entityId, onClose }: InvestigationPanelProps) {
  const { data: relations } = useEntityRelations(entityType, entityId)
  
  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      className="fixed right-0 top-0 h-full w-96 bg-bg-elevated border-l border-border shadow-2xl z-50 flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-text-primary">Investigation View</h3>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Related IOCs */}
        <CollapsibleSection title={`Related IOCs (${relations?.iocs.length})`}>
          {relations?.iocs.map(ioc => <EntityChip key={ioc.id} type={ioc.type} value={ioc.value} severity={ioc.severity} />)}
        </CollapsibleSection>
        
        {/* Related Threat Actors */}
        <CollapsibleSection title={`Threat Actors (${relations?.actors.length})`}>
          {relations?.actors.map(a => <EntityChip key={a.id} type="actor" value={a.name} />)}
        </CollapsibleSection>
        
        {/* Related Malware */}
        <CollapsibleSection title={`Malware Families (${relations?.malware.length})`}>
          {relations?.malware.map(m => <EntityChip key={m.id} type="malware" value={m.name} />)}
        </CollapsibleSection>
        
        {/* Timeline */}
        <CollapsibleSection title="Activity Timeline">
          <RelationTimeline events={relations?.timeline ?? []} />
        </CollapsibleSection>
      </div>
    </motion.div>
  )
}
```

---

## 3D CARD EFFECTS (Framer Motion)

```tsx
// 3D tilt effect on intelligence cards
export function IntelCard({ children, severity }: { children: React.ReactNode; severity?: Severity }) {
  const glowColor: Record<Severity, string> = {
    CRITICAL: 'rgba(239,68,68,0.15)',
    HIGH:     'rgba(249,115,22,0.12)',
    MEDIUM:   'rgba(234,179,8,0.1)',
    LOW:      'rgba(34,197,94,0.08)',
    INFO:     'rgba(100,116,139,0.05)',
  }
  
  return (
    <motion.div
      whileHover={{ 
        rotateX: 2, rotateY: 4, scale: 1.015,
        boxShadow: severity ? `var(--shadow-lg), 0 0 30px ${glowColor[severity]}` : 'var(--shadow-lg)'
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      style={{ transformStyle: 'preserve-3d', perspective: 1000 }}
      className="bg-bg-secondary rounded-xl border border-border p-4 cursor-pointer"
    >
      {children}
    </motion.div>
  )
}

// Stats widget with 3D depth
export function StatWidget3D({ label, value, icon, trend, severity }: StatWidgetProps) {
  return (
    <IntelCard severity={severity}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-text-primary mt-1 tabular-nums">{value}</p>
        </div>
        <div className="p-2 bg-bg-elevated rounded-lg border border-border">{icon}</div>
      </div>
      {trend && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${trend > 0 ? 'text-sev-critical' : 'text-sev-low'}`}>
          {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(trend)}% vs yesterday
        </div>
      )}
    </IntelCard>
  )
}
```

---

## TOOLTIP SYSTEM (Floating UI)

```tsx
// Every UI element that needs explanation gets a TooltipHelp component
interface TooltipHelpProps {
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  learnMoreUrl?: string
  children?: React.ReactNode
}

export function TooltipHelp({ content, side = 'top', learnMoreUrl, children }: TooltipHelpProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children ?? (
            <button className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-bg-elevated border border-border text-text-muted hover:text-text-primary hover:border-border-strong transition-colors ml-1">
              <HelpCircle className="w-3 h-3" />
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs bg-bg-elevated border-border text-text-primary text-xs p-3 shadow-lg">
          <p>{content}</p>
          {learnMoreUrl && (
            <a href={learnMoreUrl} target="_blank" rel="noopener" className="text-accent hover:underline mt-1 block">
              Learn more →
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Usage example:
<label className="flex items-center gap-1 text-sm text-text-secondary">
  EPSS Score
  <TooltipHelp
    content="Exploit Prediction Scoring System. Probability (0-100%) that this vulnerability will be exploited in the wild within 30 days."
    learnMoreUrl="https://www.first.org/epss"
  />
</label>
```

---

## COLLAPSIBLE SECTIONS

```tsx
export function CollapsibleSection({ title, children, defaultOpen = true, badge }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors text-sm font-medium text-text-primary"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge !== undefined && (
            <span className="px-1.5 py-0.5 bg-bg-secondary text-text-muted text-xs rounded-full border border-border">{badge}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-bg-primary">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## MOBILE OPTIMIZATION

```tsx
// Responsive breakpoints (must test at all)
// 375px  — iPhone SE (minimum supported)
// 768px  — iPad / tablet
// 1280px — laptop
// 1920px — desktop

// Mobile navigation — bottom tab bar on <768px
export function MobileNavBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-bg-secondary border-t border-border
                    flex items-center justify-around md:hidden z-50 safe-area-pb">
      <MobileNavItem icon={<LayoutDashboard />} label="Dashboard" to="/" />
      <MobileNavItem icon={<Shield />} label="IOCs" to="/ioc" />
      <MobileNavItem icon={<Search />} label="Search" to="/search" />
      <MobileNavItem icon={<Bell />} label="Alerts" to="/alerts" />
      <MobileNavItem icon={<Menu />} label="More" onClick={openMobileMenu} />
    </nav>
  )
}

// Responsive table — collapses to cards on mobile
export function ResponsiveIOCTable({ data }: { data: IOC[] }) {
  return (
    <>
      {/* Desktop: full table */}
      <div className="hidden md:block"><IntelligenceTable data={data} columns={iocColumns} /></div>
      {/* Mobile: card list */}
      <div className="md:hidden space-y-2 p-4">
        {data.map(ioc => <IOCMobileCard key={ioc.id} ioc={ioc} />)}
      </div>
    </>
  )
}
```

---

## GLOBAL SEARCH (CMD+K) WITH LOCAL + INTERNET

```tsx
export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const { data: localResults } = useGlobalSearch(query, { debounce: 300 })
  
  return (
    <CommandDialog>
      <CommandInput placeholder="Search IOCs, CVEs, actors, malware... (Cmd+K)" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandGroup heading="Platform Results">
          {localResults?.iocs.map(ioc => (
            <CommandItem key={ioc.id} onSelect={() => navigate(`/ioc/${ioc.id}`)}>
              <EntityChip type={ioc.type} value={ioc.value} severity={ioc.severity} />
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Search Online">
          <CommandItem onSelect={() => openInternetSearch(query, 'default')}>
            <Globe className="w-4 h-4 mr-2" /> Search "{query}" on VirusTotal
          </CommandItem>
          <CommandItem onSelect={() => window.open(`https://attack.mitre.org/techniques/?query=${query}`, '_blank')}>
            <ExternalLink className="w-4 h-4 mr-2" /> Search MITRE ATT&CK
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

---

## SKELETON SCREENS (No spinners alone)

```tsx
// Every loading state uses skeletons, not spinners
export function IOCTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-bg-secondary rounded-lg border border-border animate-pulse">
          <div className="h-4 w-16 bg-bg-elevated rounded" />
          <div className="h-4 w-48 bg-bg-elevated rounded" />
          <div className="h-4 w-24 bg-bg-elevated rounded" />
          <div className="h-4 w-16 bg-bg-elevated rounded ml-auto" />
        </div>
      ))}
    </div>
  )
}
```

---

## INLINE HELP MESSAGES

```tsx
// Below input fields explaining what each field means
export function InlineHelp({ message }: { message: string }) {
  return (
    <p className="mt-1 text-xs text-text-muted flex items-start gap-1">
      <Info className="w-3 h-3 mt-0.5 shrink-0" />
      {message}
    </p>
  )
}

// Usage:
<InlineHelp message="Enter the IOC value exactly as observed. The system auto-detects the type (IP, domain, hash, etc.)" />
```

---

## STRATEGIC REVIEW — P1 ADDITIONS (Update 1: EntityChip + InvestigationPanel + GlobalSearch)
**Added:** 2026-03-16 | **Source:** Strategic Architecture Review v1.0

### CANONICAL ENTITYCHIP v2 — 15 Entity Types

The EntityChip is the single most important UI primitive. Every module renders entity values.
Canonical implementation target: `packages/shared-ui/src/components/EntityChip.tsx`

```typescript
// Expanded EntityChip — 15 entity types with canonical color coding
export const ENTITY_TYPE_CONFIG: Record<EntityType, EntityTypeStyle> = {
  ip:            { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/20',    icon: 'Globe',       label: 'IP Address' },
  ipv6:          { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/20',    icon: 'Globe',       label: 'IPv6' },
  domain:        { bg: 'bg-purple-500/10',  text: 'text-purple-300',  border: 'border-purple-500/20',  icon: 'Link',        label: 'Domain' },
  fqdn:          { bg: 'bg-purple-500/10',  text: 'text-purple-300',  border: 'border-purple-500/20',  icon: 'Link',        label: 'FQDN' },
  url:           { bg: 'bg-cyan-500/10',    text: 'text-cyan-300',    border: 'border-cyan-500/20',    icon: 'ExternalLink',label: 'URL' },
  email:         { bg: 'bg-green-500/10',   text: 'text-green-300',   border: 'border-green-500/20',   icon: 'Mail',        label: 'Email' },
  file_hash_md5: { bg: 'bg-slate-500/10',   text: 'text-slate-300',   border: 'border-slate-500/20',   icon: 'FileDigit',   label: 'MD5' },
  file_hash_sha1:{ bg: 'bg-slate-500/10',   text: 'text-slate-300',   border: 'border-slate-500/20',   icon: 'FileDigit',   label: 'SHA1' },
  file_hash_sha256:{ bg: 'bg-slate-500/10', text: 'text-slate-300',   border: 'border-slate-500/20',   icon: 'FileDigit',   label: 'SHA256' },
  cve:           { bg: 'bg-orange-500/10',  text: 'text-orange-300',  border: 'border-orange-500/20',  icon: 'ShieldAlert', label: 'CVE' },
  actor:         { bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/20',     icon: 'UserX',       label: 'Threat Actor' },
  malware:       { bg: 'bg-pink-500/10',    text: 'text-pink-300',    border: 'border-pink-500/20',    icon: 'Bug',         label: 'Malware' },
  campaign:      { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/20',   icon: 'Target',      label: 'Campaign' },
  asn:           { bg: 'bg-teal-500/10',    text: 'text-teal-300',    border: 'border-teal-500/20',    icon: 'Network',     label: 'ASN' },
  cidr:          { bg: 'bg-teal-500/10',    text: 'text-teal-300',    border: 'border-teal-500/20',    icon: 'Network',     label: 'CIDR' },
}
```

### Internet Search URLs Per Entity Type

```typescript
// Canonical external search mapping — opens in new tab
export const INTERNET_SEARCH_URLS: Record<EntityType, (value: string) => string> = {
  ip:              (v) => `https://www.shodan.io/host/${v}`,
  ipv6:            (v) => `https://www.shodan.io/host/${v}`,
  domain:          (v) => `https://www.virustotal.com/gui/domain/${v}`,
  fqdn:            (v) => `https://www.virustotal.com/gui/domain/${v}`,
  url:             (v) => `https://urlscan.io/search/#${encodeURIComponent(v)}`,
  email:           (v) => `https://haveibeenpwned.com/account/${encodeURIComponent(v)}`,
  file_hash_md5:   (v) => `https://www.virustotal.com/gui/file/${v}`,
  file_hash_sha1:  (v) => `https://www.virustotal.com/gui/file/${v}`,
  file_hash_sha256:(v) => `https://www.virustotal.com/gui/file/${v}`,
  cve:             (v) => `https://nvd.nist.gov/vuln/detail/${v}`,
  actor:           (v) => `https://attack.mitre.org/groups/?query=${encodeURIComponent(v)}`,
  malware:         (v) => `https://malpedia.caad.fkie.fraunhofer.de/search?q=${encodeURIComponent(v)}`,
  campaign:        (v) => `https://www.google.com/search?q=${encodeURIComponent(v)}+cyber+campaign`,
  asn:             (v) => `https://bgp.he.net/${v}`,
  cidr:            (v) => `https://bgp.he.net/net/${v}`,
}
```

### EntityChip Hover Actions

On hover/click, EntityChip exposes these actions:
1. **Copy to clipboard** — copies raw value
2. **View Detail** — navigates to `/{type}/{encodedValue}` detail page
3. **Local Search** — opens GlobalSearch (Cmd+K) prefilled with value
4. **Internet Search** — opens external URL per type mapping above
5. **Add to Investigation** — attaches entity to active investigation
6. **Graph View** — jumps to graph centered on this entity node

### INVESTIGATIONPANEL v2 — Slide-In Specification

The InvestigationPanel is a right-side slide-in drawer for deep entity inspection.
Target: `packages/shared-ui/src/components/InvestigationPanel.tsx`

```typescript
// InvestigationPanel specification
interface InvestigationPanelSpec {
  width: 480                      // Fixed 480px (was 384px/w-96)
  position: 'fixed right-0 top-0'  // Full-height overlay
  zIndex: 50                       // Above page content
  animation: 'slide-in from right' // Framer Motion x: 100% → 0
  loading: 'skeleton'              // Skeleton screen while fetching
  sections: [
    'entity-header',               // Type badge + value + severity + TLP
    'enrichment-summary',          // AI enrichment result (risk score, categories)
    'related-iocs',                // Collapsible: linked IOCs from graph
    'related-actors',              // Collapsible: attributed threat actors
    'related-malware',             // Collapsible: associated malware families
    'related-campaigns',           // Collapsible: campaign memberships
    'related-vulnerabilities',     // Collapsible: exploited CVEs
    'activity-timeline',           // Chronological activity events
  ]
}

// 8 Action Buttons in InvestigationPanel header
const INVESTIGATION_ACTIONS = [
  { icon: 'Search',       label: 'Pivot Search',        action: 'pivotSearch' },
  { icon: 'GitBranch',    label: 'View in Graph',       action: 'openGraph' },
  { icon: 'Plus',         label: 'Add to Investigation', action: 'addToInvestigation' },
  { icon: 'Download',     label: 'Export Entity',       action: 'exportEntity' },
  { icon: 'Bell',         label: 'Create Alert Rule',   action: 'createAlertRule' },
  { icon: 'Tag',          label: 'Manage Tags',         action: 'manageTags' },
  { icon: 'Globe',        label: 'Internet Lookup',     action: 'internetSearch' },
  { icon: 'Archive',      label: 'Archive Entity',      action: 'archiveEntity' },
] as const
```

### GLOBALSEARCH v2 — Cmd+K with Elasticsearch Multi-Index Backend

GlobalSearch is the platform's universal search interface, accessible from any page.
Target: `packages/shared-ui/src/components/GlobalSearch.tsx`

```typescript
// GlobalSearch backend query — searches across all ES indices
async function globalSearchQuery(tenantId: string, query: string): Promise<GlobalSearchResults> {
  // Multi-index Elasticsearch search
  const indices = [
    `etip_${tenantId}_ioc_*`,        // All IOC type indices
    `etip_${tenantId}_actor`,         // Threat actors
    `etip_${tenantId}_malware`,       // Malware families
    `etip_${tenantId}_campaign`,      // Campaigns
    `etip_${tenantId}_investigation`, // Investigations
    `etip_${tenantId}_alert`,         // Alert events
  ]

  const response = await esClient.search({
    index: indices.join(','),
    body: {
      query: {
        multi_match: {
          query,
          fields: ['value^3', 'value.keyword^5', 'name^2', 'aliases', 'description', 'cve_id^4'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
      size: 20,
      _source: ['value', 'name', 'type', 'severity', 'confidence_score'],
      highlight: { fields: { value: {}, name: {}, description: {} } },
    },
  })

  return categorizeResults(response.hits.hits)
}

// Frontend: GlobalSearch result categories displayed in CommandDialog
const SEARCH_CATEGORIES = [
  { key: 'iocs',            heading: 'Indicators of Compromise', icon: 'Shield' },
  { key: 'actors',          heading: 'Threat Actors',            icon: 'UserX' },
  { key: 'malware',         heading: 'Malware Families',         icon: 'Bug' },
  { key: 'campaigns',       heading: 'Campaigns',                icon: 'Target' },
  { key: 'vulnerabilities',  heading: 'Vulnerabilities',          icon: 'ShieldAlert' },
  { key: 'investigations',  heading: 'Investigations',           icon: 'Search' },
  { key: 'online',          heading: 'Search Online',            icon: 'Globe' },
] as const

// Keyboard shortcut registration
// Cmd+K (Mac) / Ctrl+K (Windows) opens GlobalSearch
// Escape closes
// Arrow keys navigate results
// Enter selects and navigates to detail page
```

### GlobalSearch Online Fallback Options

When local results are insufficient, offer these online search options at the bottom:
- **VirusTotal** — `https://www.virustotal.com/gui/search/{query}`
- **MITRE ATT&CK** — `https://attack.mitre.org/techniques/?query={query}`
- **Shodan** — `https://www.shodan.io/search?query={query}`
- **NVD** — `https://nvd.nist.gov/vuln/search/results?query={query}`
- **Google Threat Intel** — `https://www.google.com/search?q={query}+threat+intelligence`
