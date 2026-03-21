---
description: End-of-session ritual — update project state and decisions before closing. NEVER skip this.
allowed-tools: Read, Write, Edit, Bash(git:*)
---

Before ending this session, perform ALL of the following steps in order.
Every step is mandatory — skipping any step means the next session starts with stale context.

## 1. Update docs/PROJECT_STATE.md

Read the current file, then update:

- **"Last updated" date** → today's date
- **Module Development Status table** → update status/last-worked for any modules touched this session:
  - If a module was scaffolded: change 📋 → 🔨, set "Last Worked" date
  - If a module was completed: change 🔨 → ✅, set "Last Worked" date
  - If a new blocker was found: add to "Blockers" column
- **Deployment Status table** → update if anything was deployed (add new containers with ports)
- **Module Dependency Map** → update if new packages/refs were added
- **Work In Progress section** → rewrite completely:
  - "Current phase" — update if phase changed
  - "Last session outcome" — what was accomplished THIS session (be specific: commits, test counts, what's deployed)
  - "Known issues" — any bugs, failing tests, blockers, exposed secrets
  - "Next task" — what should the NEXT session start with

## 2. Update docs/DECISIONS_LOG.md (if applicable)

If ANY architectural decision was made this session:
- Add a new entry with next DECISION number
- Include: Date, Status, Context, Decision, Alternatives, Consequences
- Examples: library choice, data model change, build pipeline change, API contract change, weight/formula change

If a previous decision was revisited or reversed:
- Update its status to "Superseded" with a reference to the new decision

## 3. Update docs/SESSION_HANDOFF.md

Overwrite the entire file with the current session's handoff document:

```markdown
# SESSION HANDOFF DOCUMENT
**Date:** [today's date]
**Session:** [session number]
**Session Summary:** [1-2 line overview]

## ✅ Changes Made
[List EVERY commit with hash, file count, and description]
[For each change: what file, what was added/modified, current state]

## 📁 Files / Documents Affected
[Table of every new file with purpose]
[Table of every modified file with what changed]

## 🔧 Decisions & Rationale
[Each DECISION-NNN with why and impact]

## ⚠️ Open Items / Next Steps
[Immediate tasks for next session]
[Deferred tasks with reason]

## 🔁 How to Resume
[Exact /session-start prompt to paste in next session with full scope and context]
```

## 4. Update docs/SESSION_TEMPLATE.md

Update the "Quick reference" section at the bottom:
- Phase status (which phases are ✅ COMPLETE)
- "Start Phase N next: `module-name` service"
- Session outcome table (services, ports, tests, status)
- Pipeline diagram if changed
- FROZEN modules warning

## 5. Update Memory Files

### 5a. Create/update session memory file
Write to `memory/session{N}_{description}.md` with frontmatter:
- Everything built this session (commits, files, tests)
- Key facts about new code (ports, queue names, interfaces, weights)
- DO NOT REMOVE/OVERWRITE rules for next session
- Remaining tasks

### 5b. Update memory/MEMORY.md index
Add pointer to the new session memory file under "## Project" section.

### 5c. Capture any new feedback patterns
If lessons were learned (CI failures, deploy issues, patterns that worked):
- Update existing feedback memory files OR create new ones
- Structure: rule → why → how to apply

## 6. Session Summary

Present this card:
```
SESSION SUMMARY
═══════════════
Session: [number]
Date: [today]
Module: [target module(s)]
Commits: [count] ([list of short hashes])
Files created: [count] | Files modified: [count]
Tests: [passing count] / [total count]
Decisions logged: [count] (DECISION-NNN, ...)
Deployed: [yes/no — which containers]
State: [what's different from session start]
Next session should: [specific task description]
```

## 7. Commit All State Files

```bash
git add docs/PROJECT_STATE.md docs/DECISIONS_LOG.md docs/SESSION_HANDOFF.md docs/SESSION_TEMPLATE.md
git commit -m "docs: session [N] end — [1-line summary]"
git push origin master
```

## 8. Final Check

- Run `git status` — verify NO uncommitted source changes
- If there are unstaged changes, warn: "You have uncommitted work in [files]. Commit or stash before closing."
- Verify `git log --oneline -1` matches the session-end commit

CRITICAL: The next session depends on accurate state across ALL documents.
The `/session-start` command reads PROJECT_STATE.md, DECISIONS_LOG.md, and DEPLOYMENT_RCA.md.
The memory system reads MEMORY.md and loads relevant session files.
The user may paste the "How to Resume" prompt from SESSION_HANDOFF.md.
If any of these are stale, the next session starts with wrong assumptions and may overwrite code.
