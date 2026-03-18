---
description: Review current changes for code quality, scope compliance, and ETIP standards
allowed-tools: Read, Bash(git diff:*)
---

Review all changes in the current branch.

## 1. Scope Check
Run: `git diff --stat main..HEAD` (or `git diff --stat`)
List all modified files grouped by module.
Flag any files outside the declared target module.

## 2. Quality Checks

For each changed file, verify:

**Structure:**
- [ ] File under 400 lines
- [ ] One responsibility per file
- [ ] Barrel exports in index.ts

**TypeScript:**
- [ ] No `any` types without justification comment
- [ ] Strict mode compliance
- [ ] JSDoc on all exported functions/classes

**Validation:**
- [ ] Zod schemas for all API inputs
- [ ] AppError for all error handling (no raw Error)

**Security:**
- [ ] No hardcoded secrets or credentials
- [ ] RBAC middleware on routes requiring auth
- [ ] Zod validation before processing
- [ ] Audit log for mutations

**Patterns:**
- [ ] Uses AppError from @etip/shared-utils
- [ ] Queue names from @etip/shared-utils/queues
- [ ] Event types from @etip/shared-utils/events
- [ ] Service JWT for internal calls

## 3. Test Coverage
Check: does every new service file have a corresponding test?
List any untested files.

## 4. Report

```
CODE REVIEW
═══════════
Files reviewed: [count]
Modules touched: [list]
Scope: ✅ Clean / ⚠️ Cross-module

Issues found:
  Critical: [count] — must fix before merge
  Warning: [count] — should fix
  Suggestion: [count] — nice to have

[List each issue with file:line and recommendation]
```
