---
description: Check current changes against DEPLOYMENT_RCA.md known issues
allowed-tools: Read, Bash(git diff:*)
---

## 1. Load RCA Knowledge
Read `docs/DEPLOYMENT_RCA.md` completely. Note every issue pattern.

## 2. Analyze Current Changes
Get current diff: `git diff --staged` and `git diff`
Get changed files: `git diff --name-only` and `git diff --cached --name-only`

## 3. Pattern Match

Check each category:

**Dockerfile changes?** → Check RCA #1-24, especially:
- #7: Alpine vs slim
- #11, #16: frozen-lockfile
- #15: piped output
- #23: selective copy
- #24: frontend healthcheck

**tsconfig changes?** → Check RCA #18-22:
- #18: build before typecheck
- #19-21: composite + references
- #22: --force flag

**New package added?** → Verify New Package Checklist (all 5 steps)

**CI workflow changes?** → Check:
- #8: always() condition for workflow_dispatch
- #17: pnpm version in action-setup

**Frontend changes?** → Check:
- #24: healthcheck uses 127.0.0.1 not localhost

**pnpm-lock.yaml changes?** → Check:
- #11, #16: frozen-lockfile enforcement

## 4. Report

```
RCA CHECK
═════════
Changes analyzed: [file count]
Patterns checked: [RCA count]
Matches found: [count]

[If matches:]
⚠️  RCA #[N]: [title]
   Your change: [what triggered the match]
   Required fix: [from RCA entry]
   Prevention: [from RCA entry]

[If no matches:]
✅ No known RCA patterns detected. Safe to proceed.
```
