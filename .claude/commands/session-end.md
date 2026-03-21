---
description: End-of-session ritual — update project state and decisions before closing. NEVER skip this.
allowed-tools: Read, Write, Edit, Bash(git:*), Grep, Glob
---

Before ending this session, perform ALL steps in order.
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

If a deployment was done this session:
- **Success**: append to Deployment Log table (already in PROJECT_STATE.md)
- **Failure**: add full RCA entry (Issue N+1) with: Error, Root Cause, Fix, Prevention, Commit
- **Fix for existing RCA**: update the existing entry status to "Fixed in session N"

## 5. Update Memory Files

### 5a. Create session memory file
Write `memory/session{N}.md` with frontmatter:
- Everything built (commits, files, tests)
- Key facts (ports, queue names, interfaces, weights)
- DO NOT REMOVE/OVERWRITE rules
- Remaining tasks

### 5b. Update memory/MEMORY.md index
Add pointer to new session file. Remove superseded entries if consolidating.

### 5c. Capture feedback patterns
If lessons were learned (CI failures, deploy issues, patterns that worked):
- Update existing feedback memory files OR create new ones
- Structure: rule → why → how to apply

## 6. Verification (NEW — prevents inconsistency)

Run these checks and fix any mismatches:

```bash
# Test count verification
pnpm -r test 2>&1 | grep -E "Tests.*passed" | tail -1
# Compare with count in PROJECT_STATE.md — must match

# Git state
git status  # must be clean after step 7
git log --oneline -3  # last commit should be session-end

# Container count (if deployed)
# Compare PROJECT_STATE.md deployment table row count with actual
```

If any mismatch found: fix the doc BEFORE committing.

## 7. Session Summary Card

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
Next: [specific task]
```

## 8. Commit + Push

```bash
git add docs/PROJECT_STATE.md docs/DECISIONS_LOG.md docs/SESSION_HANDOFF.md docs/DEPLOYMENT_RCA.md
git commit -m "docs: session [N] end — [1-line summary]"
git push origin master
```

## 9. Final Check

- `git status` — must show clean working tree
- `git log --oneline -1` — must be the session-end commit
- If uncommitted changes exist: warn user and list files

CRITICAL: Five systems depend on accurate state:
1. `/session-start` reads: PROJECT_STATE, DECISIONS_LOG, DEPLOYMENT_RCA, SESSION_HANDOFF
2. Memory system reads: MEMORY.md index → loads session{N}.md files
3. CLAUDE.md provides: rules + constants (auto-loaded every session)
4. User may paste: "How to Resume" prompt from SESSION_HANDOFF.md
5. CI/CD reads: deploy.yml, docker-compose.etip.yml, Dockerfile (already in git)
