---
description: End-of-session ritual — update project state and decisions before closing. NEVER skip this.
allowed-tools: Read, Write, Edit, Bash(git:*), Grep, Glob
---

Before ending this session, perform ALL 12 steps in order.
Skipping ANY step = next session starts with stale/wrong context.

## 1. Update docs/PROJECT_STATE.md

Read the current file, then update:

- **"Last updated" date** → today's date
- **"Session counter"** → increment by 1
- **Module Development Status table** → update status/last-worked for modules touched:
  - Scaffolded: 📋 → 🔨, set date
  - Completed: 🔨 → ✅, set date
  - New blocker: add to Blockers column
- **Deployment Status table** → add/update containers with ports if deployed
- **Module Dependency Map** → update if new packages/refs added
- **Deployment Log** → append entry if anything was deployed:
  ```
  | Session | Date | Containers | Health | Commits | Notes |
  ```
- **E2E Verification Results** → update if E2E was run (IOC counts, feed stats, enrichment stats)
- **Work In Progress section** → rewrite completely:
  - "Current phase" — update if phase changed
  - "Last session outcome" — be specific: commits (hashes), test counts, what's deployed
  - "Known issues" — bugs, failing tests, blockers, exposed secrets
  - "Next task" — what the NEXT session should start with

## 2. Update docs/DECISIONS_LOG.md (if applicable)

If ANY architectural decision was made:
- Add entry with next DECISION number
- Include: Date, Status, Context, Decision, Alternatives, Consequences

## 3. Update docs/SESSION_HANDOFF.md

Overwrite entire file with current session's handoff:

```markdown
# SESSION HANDOFF DOCUMENT
**Date:** [today]
**Session:** [N from PROJECT_STATE.md counter]
**Session Summary:** [1-2 lines]

## ✅ Changes Made
[Every commit: hash, file count, description]

## 📁 Files / Documents Affected
[New files table] [Modified files table]

## 🔧 Decisions & Rationale
[DECISION-NNN entries if any]

## 🧪 E2E / Deploy Verification Results
[Health check results, IOC counts, API responses — paste actual output]

## ⚠️ Open Items / Next Steps
[Immediate] [Deferred with reason]

## 🔁 How to Resume
[Exact prompt to paste, module map, phase roadmap]
```

## 4. Update docs/DEPLOYMENT_RCA.md (if deploy happened)

- **Success with no issues**: append row to RCA Resolution Summary table at bottom
  ```
  | Session N | Date | No new issues. [N] containers healthy. |
  ```
- **Failure**: add full RCA entry (Issue N+1): Error, Root Cause, Fix, Prevention, Commit
- **Fix for existing RCA**: update that entry's resolution row to "Fixed in session N"
- **Session 13 note**: All 33 issues FIXED. RCA is now a living document — new deploys add entries.

## 5. Update Module READMEs (if module code changed)

For EACH module that had code changes this session, read and update `docs/modules/{module}.md`:
- **Header line**: update test count + status if changed
- **Features table**: add rows for new features (Feature | File | Description)
- **API table**: add rows for new endpoints (Method | Path | Auth | Description)
- **Config table**: add rows for new env vars (Var | Default | Purpose)
- **Pipeline diagram**: update if data flow changed

NOTE: This should already be done by `/implement` step 6. This step is a SAFETY NET
to catch any that were missed. If README was already updated during implementation, verify it's correct.

### 5b. README.md (root — quick stats only)
- Update test count badge: `![Tests](https://img.shields.io/badge/tests-NNN%20passing-00ff88)`
- Update phase badge if phase changed
- Update container count if containers added
- Update Current Status table if modules changed

## 6. Update Memory Files

### 6a. Create session memory file
Write `memory/session{N}.md` with frontmatter:
- Everything built (commits, files, tests)
- Key facts (ports, queue names, interfaces, weights)
- DO NOT REMOVE/OVERWRITE rules
- Remaining tasks

### 6b. Update memory/MEMORY.md index
Add pointer to new session file. Remove superseded entries if consolidating.

### 6c. Capture feedback patterns
If lessons were learned (CI failures, deploy issues, patterns that worked):
- Update existing feedback memory files OR create new ones
- Structure: rule → why → how to apply

## 7. Verification (prevents inconsistency)

Run these checks and fix any mismatches BEFORE committing:

```bash
# Test count — must match what you write in PROJECT_STATE.md
pnpm -r test 2>&1 | grep -E "Tests.*passed" | tail -1

# Git state — must be clean after step 9
git status
git log --oneline -3

# Docs consistency check:
# - PROJECT_STATE.md test count == actual test count
# - PROJECT_STATE.md container count == deployment table rows
# - DEPLOYMENT_RCA.md issue count matches last Issue N
# - SESSION_HANDOFF.md session number == PROJECT_STATE.md counter
```

If any mismatch: fix the doc, don't just commit the wrong number.

## 8. Update docs/ETIP_Project_Stats.html

After any deployment or milestone, update the stats HTML:

- **Executive Summary stats** → container count, test count, session count, pipeline %
- **Module Status table** → add new modules, update statuses/endpoints/tests
- **Pipeline Status table** → update WIRED/MISSING badges if pipeline links changed
- **E2E Integration Plan** → update session completion status if any A1-E2 sessions done
- **Footer** → update session number + date

This file is the project's visual dashboard — keep it accurate after every deploy.

## 9. Session Summary Card

Present to user:
```
SESSION SUMMARY
═══════════════
Session: [N]
Date: [today]
Module: [target module(s)]
Commits: [count] ([hashes])
Files created: [count] | Files modified: [count]
Tests: [passing] / [total]
Decisions: [count] (DECISION-NNN, ...)
Deployed: [yes/no — containers]
E2E verified: [yes/no — IOC count if applicable]
Docs updated: [list: PROJECT_STATE, DECISIONS_LOG, features/X, api/X, ...]
Next: [specific task]
```

## 10. Commit + Push ALL State Files

```bash
git add docs/PROJECT_STATE.md docs/DECISIONS_LOG.md docs/SESSION_HANDOFF.md \
       docs/DEPLOYMENT_RCA.md docs/ETIP_Project_Stats.html docs/modules/ README.md
git commit -m "docs: session [N] end — [1-line summary]"
git push origin master
```

## 11. Final Check

- `git status` — must show clean working tree
- `git log --oneline -1` — must be the session-end commit
- If uncommitted changes exist: warn user and list files

## 12. Document Checklist (print and verify)

Before closing, confirm ALL boxes:
- [ ] PROJECT_STATE.md — session counter incremented, module statuses current
- [ ] DECISIONS_LOG.md — any new decisions logged
- [ ] SESSION_HANDOFF.md — overwritten with this session's full handoff
- [ ] DEPLOYMENT_RCA.md — resolution table updated (success or failure entry)
- [ ] ETIP_Project_Stats.html — stats, modules, pipeline status updated
- [ ] docs/modules/{module}.md — features, API, config tables current for each module touched
- [ ] README.md — test count + phase + container count current
- [ ] memory/session{N}.md — created with key facts + frozen rules
- [ ] memory/MEMORY.md — index updated
- [ ] All committed + pushed to master
- [ ] git status clean

CRITICAL: Seven systems depend on accurate state:
1. `/session-start` reads: PROJECT_STATE, DECISIONS_LOG, DEPLOYMENT_RCA, SESSION_HANDOFF
2. Memory system reads: MEMORY.md → session{N}.md files
3. CLAUDE.md: rules + constants + architecture refs (auto-loaded every session)
4. Module READMEs: docs/modules/{module}.md — features, API, config (updated by /implement)
5. README.md: GitHub landing page (test count, phase, containers)
6. ETIP_Project_Stats.html: visual dashboard (stats, pipeline status, E2E plan progress)
7. CI/CD: deploy.yml, docker-compose, Dockerfile (already in git)

Documentation flow:
  /new-module creates → docs/modules/{module}.md (skeleton)
  /implement updates → docs/modules/{module}.md (features, API, config as code is written)
  /session-end verifies → docs/modules/{module}.md is current (safety net)
