---
description: Run ALL pre-push safety checks. MANDATORY before every push to master.
allowed-tools: Bash(make:*), Bash(pnpm:*), Bash(git:*), Read
---

Run the complete pre-push verification. ALL checks must pass.

## 1. RCA Check
Read `docs/DEPLOYMENT_RCA.md` — check if current changes match any known issue pattern.
Cross-reference with: `git diff --name-only HEAD~1..HEAD`

## 2. Scope Verification
Run: `git diff --stat HEAD~1..HEAD`
Verify: changes are limited to the module(s) being worked on.
Flag: any unexpected changes to shared packages or infrastructure.

## 3. Test Suite
Run: `make test` (pnpm -r test)
All tests MUST pass. Zero failures allowed.

## 4. TypeScript
Run: `make typecheck` (pnpm exec tsc -b --force tsconfig.build.json, then pnpm --filter '!@etip/frontend' -r run typecheck)
Zero TypeScript errors allowed.

## 5. Lint
Run: `make lint` (pnpm -r run lint)
No lint errors. Warnings acceptable but note them.

## 6. Secrets Scan
Run: `git diff HEAD~1..HEAD | grep -iE '(password|secret|token|api[_-]?key)\s*[:=]' | grep -v '\.example\|\.md\|process\.env\|\.test\.'`
ANY match = FAIL. Review manually.

## 7. Env Check
If new `TI_` variables were added: verify `.env.example` is updated.

## 8. Docker Build
Run: `make docker-test` (docker build + start + health check)
All containers must start and pass health checks.

## 9. State Files
Verify `docs/PROJECT_STATE.md` and `docs/DECISIONS_LOG.md` are committed and current.

## Results Table

```
PRE-PUSH VERIFICATION
═════════════════════
| Check          | Status | Details                    |
|----------------|--------|----------------------------|
| RCA match      | ✅/❌  |                            |
| Scope          | ✅/❌  | [modules touched]          |
| Tests          | ✅/❌  | [pass/fail count]          |
| TypeScript     | ✅/❌  | [error count]              |
| Lint           | ✅/❌  | [error/warning count]      |
| Secrets        | ✅/❌  |                            |
| Env vars       | ✅/❌  |                            |
| Docker build   | ✅/❌  |                            |
| State files    | ✅/❌  |                            |
|                |        |                            |
| VERDICT        | PASS/FAIL                           |
```

If ANY check fails: DO NOT PUSH. Fix the issue first.
If ALL pass: "Safe to push. Run: git push origin [branch]"
