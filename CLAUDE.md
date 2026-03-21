# ETIP — Enterprise Threat Intelligence Platform

## Identity
Monorepo: pnpm workspaces. 20+ microservices in /apps, shared packages in /packages.
Tech: Node 20, Fastify 4, Prisma 5, React 18, TypeScript strict, Zod validation.

## Session Protocol (MANDATORY)
1. Run /session-start — loads state, decisions, git status, last session handoff
2. Declare scope: "Working on {module}. Do not modify: {list}"
3. For 3+ file changes: use plan mode (Shift+Tab) before coding
4. Run /session-end before closing — updates ALL handoff documents (9 steps)
   - If user says "bye", "done", "close", "end session" → run /session-end FIRST
   - NEVER close without running /session-end — next session depends on it

## Current State
Read docs/PROJECT_STATE.md FIRST — it has what's deployed, WIP, and stable.
NEVER assume module status. Always verify from PROJECT_STATE.md.

## Decisions
Read docs/DECISIONS_LOG.md before proposing architectural alternatives.
If you want to suggest a different approach, check if it was already rejected.

## Scope Lock Rules
- EVERY task must declare a target module
- NEVER modify ✅ Deployed modules unless explicitly instructed
- NEVER modify shared packages without asking first and explaining why
- If your change list includes files outside the target module, STOP and ask
- Check docs/PROJECT_STATE.md for module statuses before any edit

## Fail-Safe Rule
If unsure about impact, scope, or correctness: STOP. Do not write code.
- Ask for clarification instead of guessing
- If risk detected: propose the approach in text, wait for approval, then implement
- Never silently assume something is safe — state assumptions explicitly
- "I'm not sure if this will affect X" is always better than silently breaking X

## Task Sizing & Change Budget
- SMALL (1-2 files, same module): proceed directly
- MEDIUM (3-5 files, same module): plan mode first, list all files, get approval
- LARGE (6+ files or cross-module): break into subtasks, one per /clear cycle
- NEVER: "build the entire service" in one session
- ALWAYS: "build the feed parser for ingestion service" as one chunk
- HARD RULE: Max 1 module per task. If a change requires touching 2+ modules, split it.
- If file count exceeds plan estimate by >50%, STOP and reassess scope.

## Critical Build Rules (24 RCA issues documented)
- Base image: `node:20-slim` — NEVER Alpine for Node stages
- Build: `pnpm exec tsc -b --force tsconfig.build.json` — NEVER `pnpm -r build`
- Lockfile: `--frozen-lockfile` always — NO fallback
- pnpm version: locked via `packageManager` field — NEVER set `version` in CI
- Production Dockerfile: `COPY --from=build /app/ ./` (full copy)
- Frontend healthcheck: `wget http://127.0.0.1/` — NEVER `localhost` (Alpine IPv6)
- All backend tsconfigs: `composite: true` + explicit `references`

## New Package Checklist
1. Add `"composite": true` to its tsconfig.json
2. Add `"references"` for workspace deps
3. Add to root `tsconfig.build.json` references
4. Add COPY line to Dockerfile deps stage
5. Update docs/PROJECT_STATE.md module table + dependency map

## VPS Safety — CRITICAL
Two sites on VPS 72.61.227.64:
- `intelwatch.in` = live site → ti-platform-* containers → NEVER TOUCH
- `ti.intelwatch.in` = ETIP → etip_* containers → our project
NEVER modify non-etip_ containers, nginx configs, or files belonging to intelwatch.in.

## Architecture Constants
- API version: v1 prefix on all routes
- Max file lines: 400 (split if exceeded)
- Cache TTL: dashboard 48hr, IOC search 1hr, sessions 15min
- Archive after: 60 days to cold storage
- Default page limit: 50, max: 500

## Data Flow (mandatory, never skip steps)
Feed → [04] Ingest → [05] Normalize → [06] AI Enrich → Store → Index → Graph → Correlate → Alert → Integrate

## Error Handling
Always use AppError class from @etip/shared-utils. Never throw raw Error().
Always validate inputs with Zod. Never use `any` type without justification.

## Module Boundaries
No cross-module direct DB queries. Always call the service API.
Service-to-service auth: JWT with 60s TTL via @etip/shared-auth.
Import queue names from @etip/shared-utils/queues — NEVER hardcode strings.
Import event types from @etip/shared-utils/events — NEVER invent event names.

## Testing
Write tests first (TDD). Never commit with failing tests.
Run `make pre-push` before every git push.

## Commands
- `make install` — pnpm install + prisma generate
- `make test` — pnpm -r test
- `make check` — test + typecheck + lint
- `make pre-push` — check + docker-test (MANDATORY before push)
- `make docker-test` — build + start + health check

## Pre-Commit
Before every push: read docs/DEPLOYMENT_RCA.md.
If change matches known issue → apply existing fix.
If new issue → fix first, add RCA entry, then push.

## Git
Push to master with /pre-push checks. Feature branches for risky or cross-module work.
Commit format: "feat|fix|chore|docs: [description]"

## Env Vars
All prefixed with `TI_`. Secrets in .env only, never committed.

## Plan Mode Rules
When in plan mode (required for 3+ file changes):
1. List every file to create/modify with purpose
2. Show dependency order (which file first)
3. Flag any shared package changes
4. Verify scope lock — no off-limits modules in the list
5. Estimate: file count, test count
6. Wait for "proceed" before writing code

## Environment Parity Rule
All changes must work identically in: local (VS Code), Docker build, CI pipeline.
Never assume behavior is the same across environments.
Before marking any task complete:
- Verify `make docker-test` passes (not just local tests)
- If changing tsconfig, Dockerfile, or package.json: run full CI-equivalent locally
- If it works locally but not in Docker: the fix goes in Docker, not a local workaround
This exists because 24 deployment failures came from environment mismatches.

## Simplicity Rule
- Do NOT introduce new libraries unless the existing stack cannot solve the problem
- Do NOT abstract prematurely — write the concrete version first, extract patterns only when 3+ copies exist
- Do NOT add configuration layers, plugin systems, or extension points until explicitly needed
- Prefer existing patterns already in the codebase over "better" alternatives
- If suggesting new technology: justify against DECISIONS_LOG.md and explain why existing tools fail
- When in doubt, write less code, not more

## Rollback Rule
For any change touching 3+ files or modifying shared packages:
- Create a restore point BEFORE starting: `git tag safe-point-YYYY-MM-DD-description`
- Include rollback command in the implementation report
- If something breaks after commit: `git reset --hard safe-point-YYYY-MM-DD-description`
- After successful verification, clean up: `git tag -d safe-point-*` (keep last 3)
