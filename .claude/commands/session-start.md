---
description: Load full project context for a new development session. Run this FIRST.
allowed-tools: Read, Bash(git:*), Agent
---

Initialize a development session. Execute every step below without skipping.

## 0a. Workspace check (one folder, one session — no worktrees)

Owner decision (2026-09-26): one working folder, `E:\code\IntelWatch`. No git worktrees. One Claude session at a time in this folder.

Run in one batch: `git rev-parse --show-toplevel`, `git status -sb`, `git worktree list`.

**STOP** (do not touch anything, ask the owner) if:
- The working tree has uncommitted changes AND those changes don't look like this session's own in-progress work (e.g. you don't recognize them from earlier in this conversation) — tell the owner: "another session may be running in this folder; check before I proceed."
- The current branch is one this session didn't create and has uncommitted changes on it.

**Warn** (do not stop) if `git worktree list` shows more than one entry — the owner rule is one folder, no worktrees; flag it and suggest `git worktree remove` on any stale ones.

Otherwise:
- If on `master` and the task is docs-only, staying on `master` is fine (docs commits can go straight to master).
- If on `master` and the task involves code, tell the user the branch you will create before editing, e.g. `git switch -c s159/normalization-index`, then create it.
- Optional: if already on a branch matching `s<NNN>/…`, you may read the session number from it — don't guess if it doesn't match, just ask.

## 0. Context digest (delegate — do NOT read these with the main model)
In your FIRST message, in parallel with `git fetch && git status`, launch ONE `Agent` call with `model: "haiku"` (use `"sonnet"` if the task is cross-module), read-only, returning a facts-only digest (< 600 words, file:line refs) of:
1. `docs/PROJECT_STATE.md` — phase, deployed/WIP modules, next task, blockers
2. `docs/SESSION_HANDOFF.md` — last session's work, open items, resume prompt
3. `docs/DECISIONS_LOG.md` — last 5 decisions
4. `docs/DEPLOYMENT_RCA.md` — total count, last 3 entries, entries relevant to the stated task
5. `docs/ROADMAP_S149_PLUS.md` §3, `docs/roadmap/README.md`, and the Status line of every `docs/roadmap/STEP_*.md`
6. Newest `docs/S1*_*.md` session doc and `docs/runbooks/*.md` (titles + key facts)
7. Newest `session*.md` and `reference_external_services.md` in `C:/Users/manis/.claude/projects/e--code-IntelWatch/memory/` (live UptimeRobot / Telegram / VPS cron state)
8. `CLAUDE.md`, `docs/CLAUDE.md`, `skills/00-CLAUDE-INSTRUCTIONS.md` — only rules that changed or are easy to miss

Steps 1–4b below are then satisfied by the digest. Read a file directly only when the digest flags it as central to today's task (e.g. the current STEP spec). Never say something "isn't set up" or "isn't known" until the digest or a grep of `docs/` + memory confirms it.

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
