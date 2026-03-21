---
description: Implement a feature with scope lock, plan-first, and TDD approach
allowed-tools: Read, Write, Bash(pnpm:*), Bash(make:*), Bash(git diff:*), Bash(git tag:*)
---

Implement: $ARGUMENTS

## Step 0: Scope Lock (MANDATORY — do this before anything else)

1. Identify the TARGET MODULE for this work
2. Read `docs/PROJECT_STATE.md` — identify all module statuses
3. Declare scope:
   - "Target: [module name]"
   - "Off-limits: [list every ✅ Deployed module]"
4. RULES:
   - You may ONLY create/modify files in the target module's directory
   - NEVER modify any ✅ Deployed module unless explicitly instructed
   - If you need to change a shared package (packages/*), STOP and explain:
     - WHICH package
     - WHAT change
     - WHY it's needed
     - Wait for approval before proceeding
   - If your file list includes ANY file outside the target module, STOP and ask

## Step 1: Context

1. Read the target module's CLAUDE.md (if it exists)
2. Read `docs/DECISIONS_LOG.md` — verify approach doesn't contradict past decisions
3. Check which phase this module belongs to in the architecture roadmap
4. Verify the module's dependencies from PROJECT_STATE.md dependency map

## Step 2: Plan (REQUIRED for 3+ files)

Enter plan mode and present:
```
IMPLEMENTATION PLAN
═══════════════════
Feature: [description]
Target module: [name]
Off-limits: [deployed modules list]

Files to create:
  1. [path] — [purpose]
  2. [path] — [purpose]

Files to modify:
  1. [path] — [what changes]

Shared package changes: [NONE / list with justification]
Dependency order: [which file first]
Tests to write: [count]
Estimated scope: SMALL / MEDIUM / LARGE
Rollback: git reset --hard safe-point-[tag] (if created)
```

If scope is MEDIUM or LARGE, create a restore point first:
`git tag safe-point-$(date +%Y-%m-%d)-$ARGUMENTS`

Wait for "proceed" before writing any code.

## Step 3: Test First (TDD Red Phase)

1. Create test file(s) in __tests__/ directory
2. Write test cases for expected behavior:
   - Happy path tests
   - Error/edge case tests
   - Input validation tests (Zod)
3. Run tests: `pnpm -r test` — they should FAIL
4. Confirm: "Tests written and failing as expected. Proceeding to implementation."

## Step 4: Implement (TDD Green Phase)

Write the actual code following these rules:
- Max 400 lines per file — split if exceeded
- Zod validation on ALL API inputs
- AppError for ALL error handling (never raw Error)
- JSDoc on ALL exported functions and classes
- No `any` types without explicit justification in a comment
- No `// TODO` or `// implement later` — complete code only
- No hardcoded secrets or credentials
- Import queue names from @etip/shared-utils/queues
- Import event types from @etip/shared-utils/events

## Step 5: Verify (TDD Green Confirmed)

1. Run tests: `pnpm -r test` — all should PASS
2. Run typecheck: `pnpm exec tsc -b --force tsconfig.build.json`
3. Run lint: `pnpm -r run lint` (on target module)
4. Verify scope: `git diff --stat` — confirm only target module files changed
5. If shared packages changed: flag for explicit review
6. Run `make docker-test` — verify Docker build passes (environment parity)

## Step 5.5: Self-Check (MANDATORY — answer each honestly)

Before proceeding to report, answer these questions:

1. **Scope**: Did I modify ONLY the target module? (`git diff --stat` matches plan)
2. **Protected modules**: Did I touch any Tier 1 (frozen) or Tier 2 (guarded) module?
3. **Decisions**: Does my implementation contradict anything in DECISIONS_LOG.md?
4. **Simplicity**: Did I introduce any new library or abstraction? Was it necessary?
5. **Existing modules**: Could this change break any module that imports from my changes?
6. **Environment parity**: Will this work in Docker and CI, not just locally?

If ANY answer raises concern:
→ Flag it explicitly in the report with ⚠️
→ Do not hide uncertainty — state what you're unsure about

## Step 6: Update Module README (MANDATORY)

Read `docs/modules/[module].md` and update:
- **Features table**: add row for each new feature (Feature | File | Description)
- **API table**: add row for each new endpoint (Method | Path | Auth | Description)
- **Config table**: add row for each new env var (Var | Default | Purpose)
- **Pipeline diagram**: update if data flow changed
- **Test count**: update in the header line
- **Status**: update if module status changed (🔨 → ✅)

If README.md doesn't exist (shouldn't happen after /new-module), create it.

This is NOT optional. The module README is the single source of truth for what the module does.
It gets updated HERE during implementation — not later during /session-end.

## Step 7: Report

```
IMPLEMENTATION REPORT
═════════════════════
Feature: [description]
Module: [name]
Files created: [list with line counts]
Files modified: [list]
Tests: [passing] / [total]
Docker build: ✅ / ❌ / not tested
Shared package changes: [NONE / list]
Scope verified: ✅ Only target module touched / ⚠️ Cross-module changes (explain)
Self-check: ✅ All clear / ⚠️ [flag concerns]
Module README: ✅ Updated / ❌ Not updated (explain)
New decisions to log: [NONE / list]
Rollback: git reset --hard safe-point-[tag] (if applicable)
```

If there are new decisions, note them for /session-end.
