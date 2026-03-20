# ETIP Session Start Templates

Copy-paste the appropriate template at the start of every new Claude Code session.

---

## Template A — Starting a new module (most common)

Replace `{MODULE}` and `{SKILL_FILE}` from the map below.

```
/session-start

Module for this session: {MODULE}

After loading context, read skills/{SKILL_FILE} for the full module spec.
Then declare scope lock and wait for my task.
```

### Module → Skill file map

| Module | Skill file |
|---|---|
| ingestion | 04-INGESTION.md |
| normalization | 05-NORMALIZATION.md |
| ai-enrichment | 06-AI-ENRICHMENT.md |
| ioc-intelligence | 07-IOC-INTELLIGENCE.md |
| threat-actor-intel | 08-THREAT-ACTOR.md |
| malware-intel | 09-MALWARE-INTEL.md |
| vulnerability-intel | 10-VULNERABILITY-INTEL.md |
| digital-risk-protection | 11-DIGITAL-RISK-PROTECTION.md |
| threat-graph | 12-THREAT-GRAPH.md |
| correlation-engine | 13-CORRELATION-ENGINE.md |
| threat-hunting | 14-THREAT-HUNTING.md |
| enterprise-integration | 15-ENTERPRISE-INTEGRATION.md |
| user-management | 16-USER-MANAGEMENT.md |
| customization | 17-CUSTOMIZATION.md |
| onboarding | 18-ONBOARDING.md |
| billing | 19-FREE-TO-PAID.md |
| frontend / ui | 20-UI-UX.md |
| admin-ops | 22-ADMIN-PLATFORM.md |
| caching | 23-CACHING-ARCHIVAL.md |

---

## Template B — Continuing previous session work

```
/session-start

Continuing work on {MODULE} from last session.
Read skills/{SKILL_FILE} for module spec.
Check git log to see what was done last session, then ask me what to tackle next.
```

---

## Template C — Bug fix on deployed module

```
/session-start

Bug fix session on {MODULE} (already deployed — Tier 2 guarded).
Read skills/{SKILL_FILE}.
Scope: bug fix only — no new features, no structural changes.
Show me the current test coverage for this module first.
```

---

## Template D — Frontend / UI work

```
/session-start

Frontend session — working on {FEATURE} in apps/frontend.
Read skills/20-UI-UX.md and skills/UI_DESIGN_LOCK.md.
Locked packages: packages/shared-ui/** — do NOT modify without [DESIGN-APPROVED].
Free to modify: apps/frontend/src/** only.
```

---

## Rules Claude must follow every session

These are enforced by /session-start but worth knowing:

1. **Never touch Tier 1** — shared-* packages and api-gateway are frozen
2. **Never touch deployed modules** unless explicitly a bug fix session
3. **Never touch intelwatch.in** — the live production site on the same VPS
4. **Always TDD** — tests written before implementation, use /implement
5. **Always /session-end** before closing — updates PROJECT_STATE.md
6. **Always check DEPLOYMENT_RCA.md** before any push
7. **Max 1 module per session** — if change touches 2+ modules, stop and split

---

## Quick reference: current phase order

```
Phase 1: Foundation          ✅ COMPLETE
Phase 2: Data Pipeline       → ingestion → normalization → ai-enrichment
Phase 3: Core Intel          → ioc → threat-actor → malware → vulnerability
Phase 4: Advanced Intel      → drp → threat-graph → correlation → hunting
Phase 5: Platform Services   → enterprise-integration → user-management → customization
Phase 6: Growth              → onboarding → billing → admin-ops
Phase 7: Performance         → caching-archival
Phase 8: UI Polish           → frontend (runs parallel with all phases)
```

Start Phase 2 next: `ingestion` service.
