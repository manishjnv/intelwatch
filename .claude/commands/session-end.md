---
description: End-of-session ritual — update project state and decisions before closing. NEVER skip this.
allowed-tools: Read, Write, Bash(git:*)
---

Before ending this session, perform ALL of the following:

## 1. Update docs/PROJECT_STATE.md

Read the current file, then update:

- **"Last updated" date** → today's date
- **Module Development Status table** → update status/last-worked for any modules touched this session:
  - If a module was scaffolded: change 📋 → 🔨, set "Last Worked" date
  - If a module was completed: change 🔨 → ✅, set "Last Worked" date
  - If a new blocker was found: add to "Blockers" column
- **Deployment Status table** → update if anything was deployed
- **Module Dependency Map** → update if new packages were added
- **Work In Progress section** → rewrite completely:
  - "Current phase" — update if phase changed
  - "Last session outcome" — what was accomplished THIS session (be specific)
  - "Known issues" — any bugs, failing tests, or blockers discovered
  - "Next task" — what should the NEXT session start with

## 2. Update docs/DECISIONS_LOG.md (if applicable)

If ANY architectural decision was made this session:
- Add a new entry with next DECISION number
- Include: Date, Status, Context, Decision, Alternatives, Consequences
- Examples of what counts as a decision:
  - Chose a library over alternatives
  - Changed a data model structure
  - Modified the build pipeline
  - Added a new shared package
  - Changed an API contract

If a previous decision was revisited or reversed:
- Update its status to "Superseded" with a reference to the new decision

## 3. Session Summary

Present:
```
SESSION SUMMARY
═══════════════
Duration: [approximate]
Module: [target module]
Files created: [count] | Files modified: [count]
Tests: [passing count] / [total count]
Decisions logged: [count] (DECISION-NNN, ...)
State: [what's different from session start]
Next session should: [specific task description]
```

## 4. Commit State Files

```
git add docs/PROJECT_STATE.md docs/DECISIONS_LOG.md
git commit -m "chore: update project state — session end [date]"
```

## 5. Final Check

- Verify no uncommitted source changes are left behind
- If there are unstaged changes, warn: "You have uncommitted work in [files]. Commit or stash before closing."

CRITICAL: The next session depends on accurate state. Do not rush this.
