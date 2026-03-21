---
description: Load full project context for a new development session. Run this FIRST.
allowed-tools: Read, Bash(git:*)
---

Initialize a development session. Execute every step below without skipping.

## 1. Load Core Rules (always)
Read these files in order — they are the non-negotiable foundation:
1. `skills/00-CLAUDE-INSTRUCTIONS.md` — coding rules, Docker rules, definition of done
2. `skills/00-MASTER.md` — queue names, event types, service JWT, API shapes
3. `skills/00-ARCHITECTURE-ROADMAP.md` — phase order, tech stack, USPs

## 2. Load Project State
Read `docs/PROJECT_STATE.md` completely. Extract:
- Current phase
- Every module marked ✅ Deployed → these are FROZEN for this session
- Every module marked 🔨 WIP → candidate for this session
- "Next task" from Work In Progress section
- Known blockers

## 3. Load Decision History
Read `docs/DECISIONS_LOG.md` — note the last 5 decisions.
These are hard constraints. Never propose an approach that was already rejected here.

## 4. RCA Check
Read `docs/DEPLOYMENT_RCA.md` — note total issue count and last 3 entries.
Before any code is written, check if the planned change matches a known failure pattern.

## 4b. Load Last Session Handoff
Read `docs/SESSION_HANDOFF.md` — this has:
- What was built last session (commits, files)
- Open items / next steps
- Resume prompt with frozen module list
- Module → skill file map

## 5. Git State
Run: `git status` and `git log --oneline -5`
Report: current branch, last 5 commits, any uncommitted changes.

## 6. Module Skill Loading
Ask: "Which module are you working on this session?"

Once answered, load the matching skill file from `skills/`:
| Module | Skill file |
|---|---|
| ingestion | `skills/04-INGESTION.md` |
| normalization | `skills/05-NORMALIZATION.md` |
| ai-enrichment | `skills/06-AI-ENRICHMENT.md` |
| ioc-intelligence | `skills/07-IOC-INTELLIGENCE.md` |
| threat-actor-intel | `skills/08-THREAT-ACTOR.md` |
| malware-intel | `skills/09-MALWARE-INTEL.md` |
| vulnerability-intel | `skills/10-VULNERABILITY-INTEL.md` |
| digital-risk-protection | `skills/11-DIGITAL-RISK-PROTECTION.md` |
| threat-graph | `skills/12-THREAT-GRAPH.md` |
| correlation-engine | `skills/13-CORRELATION-ENGINE.md` |
| threat-hunting | `skills/14-THREAT-HUNTING.md` |
| enterprise-integration | `skills/15-ENTERPRISE-INTEGRATION.md` |
| user-management | `skills/16-USER-MANAGEMENT.md` |
| customization | `skills/17-CUSTOMIZATION.md` |
| onboarding | `skills/18-ONBOARDING.md` |
| billing | `skills/19-FREE-TO-PAID.md` |
| admin-ops | `skills/22-ADMIN-PLATFORM.md` |
| frontend / ui | `skills/20-UI-UX.md` |
| caching | `skills/23-CACHING-ARCHIVAL.md` |
| testing | `skills/02-TESTING.md` |
| devops / docker | `skills/03-DEVOPS.md` |

Also read `skills/02-TESTING.md` for every module session (TDD is mandatory).

## 7. Scope Lock Declaration
After loading the module skill, declare out loud:

```
SESSION SCOPE LOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target module : [module name]
Phase         : [phase number]
Status        : [current status from PROJECT_STATE.md]

FROZEN — will not touch:
  Tier 1 (always): shared-types, shared-utils, shared-auth,
                   shared-cache, shared-audit, shared-normalization,
                   shared-enrichment, shared-ui, api-gateway
  Tier 2 (deployed): user-service, frontend (shell),
                     ingestion, normalization, ai-enrichment
  Never touch: intelwatch.in, ti-platform-* containers

FREE to modify:
  [target module directory only]

If a change requires touching a frozen module → STOP and ask first.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 8. Session Briefing
Present this compact card and wait for "proceed":

```
━━━ ETIP SESSION READY ━━━━━━━━━━━━━━━━━━━━
Phase    : [current phase]
Deployed : [count] modules (Tier 1+2 frozen)
Module   : [target module]
Skill    : skills/[XX-MODULE].md loaded
Git      : [branch] — [clean/N uncommitted files]
Next     : [next task from PROJECT_STATE.md]
RCAs     : [count] known issues on record
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready. State your task and I will begin with /implement.
```
