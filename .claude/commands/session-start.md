---
description: Load full project context for a new development session. Run this FIRST.
allowed-tools: Read, Bash(git:*), Bash(docker:*)
---

Initialize development session. Follow these steps exactly:

## 1. Git State
Show: current branch, last 3 commits, uncommitted changes.

## 2. Project State (MOST IMPORTANT)
Read `docs/PROJECT_STATE.md` completely.
Summarize:
- Current phase and what's deployed
- Which modules are ✅ Deployed vs 🔨 WIP vs 📋 Not started
- The "Next task" from Work In Progress section
- Any known issues

## 3. Decisions Context
Read `docs/DECISIONS_LOG.md` — note the most recent 3 decisions.
These constrain what approaches are valid.

## 4. Docker Status
Check running ETIP containers: `docker ps --filter name=etip_ --format "table {{.Names}}\t{{.Status}}" 2>/dev/null`
Verify live site is untouched: confirm no ti-platform containers were modified.

## 5. RCA Awareness
Read `docs/DEPLOYMENT_RCA.md` if it exists — note the total issue count.

## 6. Session Briefing
Present a compact summary:
```
Phase: [current phase]
Deployed: [count] modules
WIP: [list]
Next task: [from PROJECT_STATE.md]
Git: [branch] — [clean/dirty]
Containers: [running count]/[expected count]
```

## 7. Ask
"What module/feature are you working on this session?"

Wait for the answer. Once given, acknowledge the scope:
"Scope locked to: [target module]. Will not modify: [list all ✅ Deployed modules]."
