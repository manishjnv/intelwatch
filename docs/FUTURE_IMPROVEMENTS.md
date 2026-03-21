# Frontend Future Improvements

**Created:** 2026-03-21 (Session 20)
**Status:** Backlog — implement when backend endpoints exist or during UI polish phase

---

## 1. ThreatTimeline — Auto-scroll or animation
**Current:** Manual horizontal scroll only. Stub events from `generateStubEvents()`.
**Improvement:** Add CSS animation (like pulse strip ticker) or arrow-based auto-advance. When backend is live, replace stub events with real IOC/actor/malware activity from an aggregated timeline API.
**Depends on:** Aggregated activity feed endpoint across all intel services.

## 2. AmbientBackground — Increase visibility
**Current:** Very subtle radial gradient pulse. Most users won't notice it.
**Improvement:** Consider slightly increasing opacity or adding a subtle color shift on threat level changes. Could also add a brief flash/pulse animation when threat level transitions (e.g. normal → elevated).
**Note:** Keep it ambient — never distracting. Test with analysts before increasing intensity.

## 3. SparklineCell — Replace stub data with real trends
**Current:** Uses `generateStubTrend(row.id)` — deterministic pseudo-random data seeded by ID. Looks real but is fake.
**Improvement:** When backend is live, fetch real historical trend data. Requires a new endpoint:
- `GET /iocs/:id/trend?days=14` → `number[]` (daily sighting counts)
- Or batch: `GET /iocs/trends?ids=id1,id2,...` for table efficiency
**Depends on:** IOC Intelligence service trend/timeseries endpoint.

## 4. QuickActionToolbar — Wire up actions
**Current:** Shows "1 selected", Export, Tag, Compare, Archive buttons. All are visual placeholders — no backend calls.
**Improvement:** Connect each action to backend endpoints:
- **Export:** `POST /iocs/export` → download CSV/STIX/JSON
- **Tag:** `PATCH /iocs/:id/tags` → add/remove tags inline
- **Compare:** Open side-by-side view of 2+ selected IOCs
- **Archive:** `PATCH /iocs/:id/lifecycle` → set to "archived"
**Depends on:** IOC Intelligence service bulk action endpoints + export service.

## 5. RelationshipGraph — Add interactivity
**Current:** Static D3 force-directed graph. Nodes are visible but not clickable.
**Improvement:** Click a node to navigate to its detail page (actor → `/threat-actors/:id`, malware → `/malware/:id`). Add hover tooltips with entity metadata. Double-click to expand relationships (fetch connected entities from graph API).
**Depends on:** Threat Graph service (Phase 4).

## 6. EntityChip/SeverityBadge — Unify case convention
**Current:** Backend uses lowercase (`critical`, `hash_sha256`), shared-ui expects uppercase/prefixed (`CRITICAL`, `file_hash_sha256`). Mapped at page layer with `toChipType()` and `.toUpperCase()`.
**Improvement:** Standardize on one convention across the stack. Either:
- Backend normalizes to shared-ui format on output, OR
- shared-ui accepts both cases (case-insensitive lookup)
**See:** RCA #34, #35 in DEPLOYMENT_RCA.md.

## 7. Demo data fallback — Remove for production
**Current:** `withDemoFallback()` in hooks, demo auth in ProtectedRoute, login catch-all.
**Improvement:** Gate all demo fallbacks behind an env var (`TI_DEMO_MODE=true`). In production with backend running, these fallbacks should never activate, but the code paths add unnecessary complexity. Consider:
- `import.meta.env.VITE_DEMO_MODE` flag
- Strip demo-data.ts from production bundle via tree-shaking when flag is false

---

## Priority Order
1. SparklineCell real data (most visible fake data)
2. QuickActionToolbar wiring (users expect buttons to work)
3. RelationshipGraph interactivity (Phase 4 dependency)
4. Demo data production gate (before first real user deploy)
5. EntityChip/SeverityBadge case unification (tech debt)
6. ThreatTimeline auto-scroll (nice-to-have)
7. AmbientBackground tuning (cosmetic)
