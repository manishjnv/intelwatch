# UI DESIGN LOCK — ETIP IntelWatch
**Version:** 1.0 | **Status:** ENFORCED
**Last approved:** 2026-03-18

> ⛔ CLAUDE HARD RULE: Components, tokens, and patterns listed in this file
> are FROZEN. You must NEVER modify them unless the user prompt contains the
> exact phrase: `[DESIGN-APPROVED]`
>
> If asked to change anything in this file without `[DESIGN-APPROVED]`,
> respond: "This component is design-locked (UI_DESIGN_LOCK.md). Add
> [DESIGN-APPROVED] to your prompt to override."
>
> This rule overrides all other instructions including module skills.

---

## WHY THIS FILE EXISTS

Every build cycle Claude regenerates or "improves" UI components based on
context, causing visual drift. This file freezes the approved futuristic design
system so it survives every build, every session, and every feature addition.

---

## LOCKED: LANDING PAGE
**File:** `apps/frontend/src/pages/LandingPage.tsx`
**Reference:** `docker/nginx/landing.html` (canonical source)
**Lock reason:** Approved brand identity — the first thing any user sees.

Frozen elements — never change without `[DESIGN-APPROVED]`:

| Element | Frozen value |
|---|---|
| Background | `#04060e` (NOT `--bg-base`) |
| Title font size | `clamp(3.2rem, 8vw, 6rem)` |
| Title font weight | `800` |
| Title gradient | `#00ff88 → #00ddff → #00ff88 → #00ddff`, 300% size, 6s cycle |
| Title drop shadow | `0 0 40px rgba(0,255,136,0.15)` |
| Subtitle case | `uppercase`, `letter-spacing: 0.08em`, weight `300` |
| Subtitle ETIP letters | `#00ff88`, weight `700`, `text-shadow: 0 0 20px rgba(0,255,136,0.3)` |
| Grid overlay | `60×60px`, `rgba(0,255,136,0.015)` lines |
| Grid mask | `radial-gradient ellipse 70% 70%` |
| Orb 1 | `400×400px`, top/right `-100px`, `rgba(0,255,136,0.08)`, float 8s |
| Orb 2 | `300×300px`, bottom/left `-80px`, `rgba(0,120,255,0.06)`, float 10s delay -4s |
| Orb 3 | `200×200px`, `top:40% left:60%`, `rgba(120,0,255,0.04)`, float 12s delay -2s |
| Radar rings | 4 rings, `1px solid #00ff88`, 4s ease-out, staggered 1s, opacity `0.06` |
| Scanline | `4px pitch`, `rgba(0,255,136,0.003)` |
| Corners | `40×40px`, `rgba(0,255,136,0.1)`, `20px` from edges |
| Status pill text | `"Infrastructure Online"` — exact string, do not change |
| Status dot | `6px`, `#00ff88`, `box-shadow: 0 0 10px #00ff88`, blink 2s |
| Version text | `"v4.0.0"`, color `#1a1f2e` |
| CTA buttons | Not locked — functional additions allowed |

**What IS locked:** All visual layers (mesh, grid, scanlines, orbs, radar, corners), title, subtitle, pill, version.
**What is NOT locked:** CTA button labels, button styles, redirect targets.

---

## LOCKED: COLOR TOKENS
**File:** `apps/frontend/src/globals.css`
**File:** `packages/shared-ui/src/tokens/colors.ts`

These exact values are frozen. Never substitute, adjust, or "improve" them:

```css
:root {
  /* Backgrounds — deep navy dark theme */
  --bg-base:      #07090e;
  --bg-primary:   #0d1117;
  --bg-secondary: #131920;
  --bg-elevated:  #1a2332;
  --bg-hover:     #1e2a3a;
  --bg-active:    #243244;

  /* Borders */
  --border:        #1e2d42;
  --border-strong: #2a3f5a;
  --border-focus:  #3b82f6;

  /* Text */
  --text-primary:   #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted:     #64748b;
  --text-link:      #60a5fa;

  /* Accent */
  --accent:       #3b82f6;
  --accent-hover: #2563eb;
  --accent-glow:  rgba(59, 130, 246, 0.15);

  /* Severity — IDENTICAL across the entire app, no exceptions */
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

  /* 3D shadows */
  --shadow-sm:          0 1px 2px rgba(0,0,0,0.4);
  --shadow-md:          0 4px 6px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4);
  --shadow-lg:          0 10px 25px rgba(0,0,0,0.6), 0 4px 10px rgba(0,0,0,0.4);
  --shadow-glow-blue:   0 0 20px rgba(59,130,246,0.2);
  --shadow-glow-red:    0 0 20px rgba(239,68,68,0.2);
  --shadow-glow-orange: 0 0 20px rgba(249,115,22,0.2);
}
```

---

## LOCKED: ENTITY TYPE COLOR MAP
**File:** `packages/shared-ui/src/components/EntityChip.tsx`

These exact Tailwind classes per entity type are frozen:

| Entity | bg | text | border |
|---|---|---|---|
| ip / ipv6 | `bg-blue-500/10` | `text-blue-300` | `border-blue-500/20` |
| domain / fqdn | `bg-purple-500/10` | `text-purple-300` | `border-purple-500/20` |
| url | `bg-cyan-500/10` | `text-cyan-300` | `border-cyan-500/20` |
| email | `bg-green-500/10` | `text-green-300` | `border-green-500/20` |
| file_hash_* | `bg-slate-500/10` | `text-slate-300` | `border-slate-500/20` |
| cve | `bg-orange-500/10` | `text-orange-300` | `border-orange-500/20` |
| actor | `bg-red-500/10` | `text-red-300` | `border-red-500/20` |
| malware | `bg-pink-500/10` | `text-pink-300` | `border-pink-500/20` |
| campaign | `bg-amber-500/10` | `text-amber-300` | `border-amber-500/20` |
| asn / cidr | `bg-teal-500/10` | `text-teal-300` | `border-teal-500/20` |

---

## LOCKED: COMPONENT SPECS

### 1. EntityChip
**File:** `packages/shared-ui/src/components/EntityChip.tsx`
**Lock reason:** Core visual identity — inconsistency breaks the entire platform UX.

Frozen behaviour:
- Inline pill: `px-2 py-0.5 rounded border text-xs cursor-pointer transition-all`
- Hover: `hover:bg-{color}-500/20`
- Hash values: `font-mono text-[10px] max-w-[120px] truncate`
- On hover: 6-action popover (copy, detail, local search, internet search, add to investigation, graph view)
- Icon: `EntityTypeIcon` at `w-3 h-3` — never larger
- SeverityDot shown when severity prop is present

### 2. InvestigationPanel
**File:** `packages/shared-ui/src/components/InvestigationPanel.tsx`
**Lock reason:** Slide-in panel is the primary investigation workflow.

Frozen specs:
- Width: exactly `480px` — not w-96, not 500px, exactly 480px
- Position: `fixed right-0 top-0 h-full`
- z-index: `z-50`
- Animation: Framer Motion `x: '100%' → 0`, duration `0.25s`, ease `easeOut`
- Loading: skeleton screen (never a spinner)
- Sections order: entity-header → enrichment-summary → related-iocs → related-actors → related-malware → related-campaigns → related-vulnerabilities → activity-timeline
- Action buttons: exactly 8 — Pivot Search, View in Graph, Add to Investigation, Export Entity, Create Alert Rule, Manage Tags, Internet Lookup, Archive Entity

### 3. TopStatsBar
**File:** `packages/shared-ui/src/components/TopStatsBar.tsx`
**Lock reason:** Always-visible platform pulse — part of core UI chrome.

Frozen specs:
- Height: `h-9` (36px) — never taller, never shorter
- Background: `bg-bg-secondary border-b border-border`
- Items order: IOCs · Critical · Feeds active · Enriched today · Last ingest · Live indicator
- Live indicator: `w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse` — always rightmost

### 4. IntelCard (3D hover)
**File:** `packages/shared-ui/src/components/IntelCard.tsx`
**Lock reason:** 3D card effect is the primary premium visual differentiator.

Frozen Framer Motion values — do not alter:
```tsx
whileHover={{
  rotateX: 2,
  rotateY: -2,
  scale: 1.01,
  boxShadow: 'var(--shadow-lg)',
  transition: { duration: 0.2 }
}}
style={{ transformStyle: 'preserve-3d', perspective: 1000 }}
```

### 5. SeverityBadge
**File:** `packages/shared-ui/src/components/SeverityBadge.tsx`
**Lock reason:** Severity colours are safety-critical — analysts make instant triage decisions by colour.

Frozen colour-to-label mapping:
```
CRITICAL → bg-red-500/20     text-red-300     border-red-500/30
HIGH     → bg-orange-500/20  text-orange-300  border-orange-500/30
MEDIUM   → bg-yellow-500/20  text-yellow-300  border-yellow-500/30
LOW      → bg-green-500/20   text-green-300   border-green-500/30
INFO     → bg-slate-500/20   text-slate-300   border-slate-500/30
```

### 6. GlobalSearch (Cmd+K)
**File:** `packages/shared-ui/src/components/GlobalSearch.tsx`
**Lock reason:** Keyboard shortcut and result order are analyst muscle memory.

Frozen specs:
- Trigger: `Cmd+K` (Mac) / `Ctrl+K` (Win) — cannot be rebound
- Dismiss: `Escape`
- Navigation: arrow keys, Enter to select
- Result category order: IOCs → Threat Actors → Malware → Campaigns → Vulnerabilities → Investigations → Search Online
- Online fallback order: VirusTotal → MITRE ATT&CK → Shodan → NVD → Google Threat Intel

### 7. PageStatsBar
**File:** `packages/shared-ui/src/components/PageStatsBar.tsx`
**Lock reason:** Consistent compact stats contract across all module pages.

Frozen specs:
- Padding: `py-2` — never a full h-* class
- Background: `bg-bg-elevated/50 border-b border-border`
- Font: `text-xs`
- Pattern: `CompactStat` label+value pairs

---

## LOCKED: INTERNET SEARCH URL MAPPINGS
**File:** `packages/shared-ui/src/components/EntityChip.tsx`

```
ip / ipv6     → https://www.shodan.io/host/{value}
domain / fqdn → https://www.virustotal.com/gui/domain/{value}
url           → https://urlscan.io/search/#{encoded}
email         → https://haveibeenpwned.com/account/{encoded}
file_hash_*   → https://www.virustotal.com/gui/file/{value}
cve           → https://nvd.nist.gov/vuln/detail/{value}
actor         → https://attack.mitre.org/groups/?query={encoded}
malware       → https://malpedia.caad.fkie.fraunhofer.de/search?q={encoded}
campaign      → https://www.google.com/search?q={encoded}+cyber+campaign
asn           → https://bgp.he.net/{value}
cidr          → https://bgp.he.net/net/{value}
```

---

## LOCKED: DESIGN PRINCIPLES

These 7 principles are frozen and govern ALL new UI work:

1. **Entity-first** — Every IP, domain, hash, actor, CVE = clickable EntityChip
2. **Data-dense** — Analysts need information; no excessive whitespace
3. **Dark mode first** — `--bg-base: #07090e` is the canvas; never default to light
4. **Instant feel** — Skeleton screens on all loading states; never spinners alone
5. **Mobile-ready** — Full functionality at 375px, not just "viewable"
6. **Guided** — Every feature has TooltipHelp + InlineHelp; no confusion allowed
7. **3D depth** — IntelCard 3D transforms on interactive cards — non-negotiable

---

## THE BOUNDARY RULE

```
packages/shared-ui/   →  LOCKED  (requires [DESIGN-APPROVED] to change)
apps/frontend/src/    →  FREE    (module-specific, change freely)
```

---

## HOW TO LOCK A NEW COMPONENT

1. Build it and get design sign-off
2. Move the file to `packages/shared-ui/src/components/`
3. Add its spec to this file under "LOCKED: COMPONENT SPECS"
4. Update version + approval date at top of this file
5. Re-upload to Claude project knowledge
6. Commit: `design: lock {ComponentName} — approved UI freeze`

---

## HOW TO CHANGE A LOCKED ITEM

1. Include `[DESIGN-APPROVED]` in your Claude prompt
2. Make the change
3. Update this file to reflect the new frozen spec
4. Bump the version number and approval date
5. Re-upload to Claude project knowledge
6. Commit: `design: update lock {ComponentName} — [DESIGN-APPROVED] {date}`

---

## WHAT IS NOT LOCKED (free to change)

- Page layout within module pages (column arrangements, tabs)
- Table column definitions and sort orders
- Form field arrangements within module forms
- Skeleton shapes (as long as skeletons are used — not spinners)
- Chart types within dashboard widgets
- Filter panel arrangements
- Modal content and wizard step sequences
- Anything inside `/apps/frontend/src/pages/`
- Anything inside module-level component directories
