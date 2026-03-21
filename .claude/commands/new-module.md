---
description: Scaffold a new ETIP microservice module with all required files and register it
allowed-tools: Read, Write, Bash(mkdir:*), Bash(pnpm:*), Bash(git diff:*)
---

Create a new ETIP service module for: $ARGUMENTS

## Pre-Check

1. Read `docs/PROJECT_STATE.md` — verify this module is 📋 Not Started
2. Read `docs/DECISIONS_LOG.md` — check for relevant decisions
3. Verify the module's phase is current or has no phase gate blockers
4. Read `apps/api-gateway/` as a reference implementation for patterns

## Scaffold

Create the following structure:

```
apps/$ARGUMENTS/
├── src/
│   ├── index.ts              # Fastify server bootstrap
│   ├── routes/
│   │   ├── index.ts          # Route barrel export
│   │   └── health.ts         # GET /health endpoint
│   ├── services/             # Business logic (empty, ready for /implement)
│   └── schemas/              # Zod schemas (empty, ready for /implement)
├── __tests__/
│   └── health.test.ts        # Health endpoint test
├── package.json              # @etip scoped, workspace deps
├── tsconfig.json             # composite: true, references to deps
├── CLAUDE.md                 # Module-specific instructions
└── README.md                 # Module documentation
```

## Configuration Updates (New Package Checklist)

1. Add `"composite": true` to the new tsconfig.json
2. Add `"references"` pointing to workspace dependencies
3. Add the package to root `tsconfig.build.json` references array
4. Add its `package.json` + `tsconfig.json` COPY lines to Dockerfile deps stage
5. Run `pnpm install` to link the new package

## Verify

1. `pnpm exec tsc -b --force tsconfig.build.json` — must compile cleanly
2. `pnpm -r test` — health test must pass
3. `git diff --stat` — review all changes

## Create Module README (single source of truth for module docs)

Create `apps/$ARGUMENTS/README.md`:
```markdown
# [Module Name]

**Port:** [port] | **Queue:** [queue name] | **Status:** 🔨 WIP | **Tests:** 0

## What It Does
[1-2 sentence description]

## Pipeline
[Data flow diagram — input queue → processing → output queue]

## Features
| Feature | File | Description |
|---------|------|-------------|
| Health check | routes/health.ts | GET /health endpoint |

## API
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |

## Config
| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_{MODULE}_PORT | [port] | Service port |
```

This README is updated automatically during `/implement` (step 6) whenever features are added.
No separate docs/features/ or docs/api/ files needed — the module README IS the documentation.

## Register in Project State

Update `docs/PROJECT_STATE.md`:
- Module Development Status table: change status from 📋 to 🔨, set "Last Worked" date
- Module Dependency Map: add the new module with its dependencies

## Register in Infrastructure (for services with HTTP endpoints)

1. Add nginx upstream + location block in `docker/nginx/conf.d/default.conf`
2. Add service definition in `docker-compose.etip.yml`
3. Add build + health check in `.github/workflows/deploy.yml`
4. Add nginx depends_on entry for the new service

## Report

```
NEW MODULE SCAFFOLDED
═════════════════════
Module: $ARGUMENTS
Files created: [count]
Dependencies: [list]
tsconfig.build.json: updated ✅
Dockerfile: updated ✅
PROJECT_STATE.md: registered ✅
docs/features/$ARGUMENTS/IMPLEMENTATION.md: created ✅
docs/api/$ARGUMENTS/API.md: created ✅
Health test: passing ✅
```

CRITICAL: Follow the New Package Checklist from root CLAUDE.md exactly.
Max 400 lines per file. Use AppError, not raw Error. JSDoc on all exports.
