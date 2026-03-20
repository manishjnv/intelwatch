# CLAUDE MASTER INSTRUCTIONS — Enterprise Threat Intelligence Platform
**ID:** 00-claude-instructions | **Version:** 5.0
**⚠️ READ THIS FIRST — BEFORE ANY OTHER SKILL ⚠️**

---

## WHO YOU ARE
You are the **senior architect and lead developer** of the Enterprise Threat Intelligence Platform (ETIP). You have full context of the entire codebase, architecture, and roadmap. You write production-quality code, never placeholder stubs.

---

## HOW TO START EVERY TASK

### Step 1 — Identify the task type
```
New feature?     → Read: 00-architecture-roadmap → relevant module skill → 02-testing → 01-docs
Bug fix?         → Read: relevant module skill → 02-testing
UI work?         → Read: 20-ui-ux → relevant module skill
Integration?     → Read: 15-enterprise-integration → 21-module-integration
Admin feature?   → Read: 22-admin-platform → 00-master
Testing task?    → Read: 02-testing
Deployment?      → Read: 03-devops
Docker change?   → Read: 03-devops → PROJECT_BRAIN.md (Docker rules section)
```

### Step 2 — Read the architecture roadmap
Always check `00-architecture-roadmap` to understand which phase you are in and what constraints apply.

### Step 3 — Read the module skill
Read the specific skill SKILL.md for the module you are working on.

### Step 4 — Pre-build test check
Before writing ANY implementation code, read `02-testing` and write test stubs first (TDD approach).

### Step 5 — Implement
Write complete, production-ready code. Never write `// TODO`, `// implement later`, or stub functions.

### Step 6 — Update docs
After every implementation, update the centralized documentation per `01-docs` skill.

---

## MANDATORY RULES (NON-NEGOTIABLE)

### Code Quality
- **NEVER** write placeholder code, stubs, or `// TODO` comments in deliverables
- **NEVER** hardcode secrets, API keys, or credentials
- **ALWAYS** write complete, runnable code
- **ALWAYS** use TypeScript strict mode — no `any` types without explicit justification
- **ALWAYS** validate inputs with Zod before processing
- **ALWAYS** handle errors with the project's `AppError` class
- **ALWAYS** include JSDoc comments on all exported functions and classes

### Docker & Build Rules (learned from 24 deployment failures — see docs/DEPLOYMENT_RCA.md)

**Base images:**
- **NEVER** use Alpine for Node.js images — **ALWAYS** `node:20-slim` (musl breaks Prisma, bcrypt — RCA #7)
- nginx:alpine is OK for static serving stages only (no Node native deps)

**TypeScript build (tsc -b):**
- **ALWAYS** use `pnpm exec tsc -b --force tsconfig.build.json` in Dockerfiles
- **NEVER** use `pnpm -r build` in Dockerfiles (parallel execution → race condition — RCA #19)
- **NEVER** use `pnpm --filter ... build` in Dockerfiles (same race condition via buildx — RCA #20)
- Every backend package tsconfig.json MUST have `"composite": true` + `"references"` to workspace deps
- `tsconfig.build.json` at root MUST list all backend packages (not frontend/shared-ui)
- `--force` is MANDATORY in Docker (tsc -b may skip builds without it — RCA #22)

**pnpm & lockfile:**
- **NEVER** fallback to `--no-frozen-lockfile` — **ALWAYS** strict `--frozen-lockfile` (RCA #11, #16)
- **NEVER** set `version` param in `pnpm/action-setup@v4` — it reads `packageManager` from package.json (RCA #1, #17)
- pnpm locked to **9.15.0** via `packageManager` field

**Dockerfile COPY rules:**
- **ALWAYS** include every workspace member's `package.json + tsconfig.json` in Dockerfile COPY stage
- **ALWAYS** copy `tsconfig.base.json` AND `tsconfig.build.json` in deps stage
- **ALWAYS** copy `tsconfig.base.json` in frontend Dockerfile (shared-ui extends it — RCA #24)
- Production stage: `COPY --from=build /app/ ./` (full copy — selective copy breaks pnpm symlinks — RCA #23)

**Healthchecks:**
- **ALWAYS** use `127.0.0.1` (not `localhost`) in Alpine containers (Alpine resolves localhost to ::1 IPv6 — RCA #24)
- Frontend: `wget -q -O /dev/null http://127.0.0.1/`
- API: `curl -sf http://localhost:3001/health` (slim image, curl installed)
- busybox `nc` does NOT support `-z` flag — use `wget` in Alpine

**Networking & deploy:**
- etip_nginx on `caddy_network` (external: `ti-platform_default`) — auto-joins via compose
- **NEVER** use manual `docker network connect`
- **ALWAYS** `--force-recreate etip_api etip_frontend etip_nginx` on deploy (old containers keep stale healthchecks — RCA #23)
- Deploy job: `always()` condition required when `needs` references a conditionally-skipped job (RCA #8, #21)

**CI pipeline order:** test → build (tsc -b) → typecheck → lint → audit → Docker build API → Docker build Frontend

**When adding a new workspace package:**
1. Add `"composite": true` + `"references"` to its tsconfig.json
2. Add to `tsconfig.build.json` references array
3. Add `package.json + tsconfig.json` COPY line to `Dockerfile` deps stage
4. Run `pnpm install` to update lockfile
5. Run `make docker-test` before pushing

### Pipeline Enforcement
Every intelligence entity MUST follow this exact pipeline:
```
RAW DATA → Normalize (04) → AI Enrich (06) → Store → Index (ES) → Graph (12) → Correlate (13) → Alert → Integrate (15)
```
Skipping any step is a critical bug.

### Plug-and-Play Module Design
Each module is self-contained:
- Maximum **400 lines** per file — split into smaller files if exceeded
- One responsibility per file (controller / service / schema / routes)
- No cross-module direct DB queries — always call the service API
- Each module has its own `README.md` inside its directory

### Token Efficiency
When implementing, structure code so Claude can work on one file at a time without needing full project context. Use:
- Barrel exports (`index.ts`) per module
- Shared types in `/packages/shared-types`
- Clear naming conventions (file name = what it does)

### Testing Gate (Mandatory)
```
Write tests → Implement → Tests pass → Update docs → Commit
    ↑_____________NEVER commit with failing tests___________↑
```

---

## PROJECT CONSTANTS

```typescript
// Always use these — never guess
const MODELS = {
  default: 'claude-sonnet-4-20250514',
  fast:    'claude-haiku-4-5-20251001',
  heavy:   'claude-opus-4-6'
}

const CACHE_TTL = {
  dashboard:     48 * 3600,  // 48 hours
  iocSearch:     3600,       // 1 hour
  enrichment:    { ip: 3600, domain: 86400, hash: 604800, cve: 43200 },
  userSession:   900,        // 15 min
  feedData:      1800,       // 30 min
}

const ARCHIVE_AFTER_DAYS = 60  // Move feed data to cold storage after 60 days
const MAX_FILE_LINES = 400     // Split file if exceeded
const API_VERSION = 'v1'
const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 500
```

---

## PHASED IMPLEMENTATION ORDER

Follow this order strictly — do not jump ahead:

```
Phase 1: Foundation     → 00-master, 03-devops, shared packages          ✅ COMPLETE
Phase 2: Data Pipeline  → 04-ingestion, 05-normalization, 06-ai-enrichment
Phase 3: Core Intel     → 07-ioc, 08-threat-actor, 09-malware, 10-vulnerability
Phase 4: Advanced Intel → 11-drp, 12-threat-graph, 13-correlation, 14-hunting
Phase 5: Platform       → 15-enterprise-integration, 16-user-management, 17-customization
Phase 6: Growth         → 18-onboarding, 19-free-to-paid, 22-admin-platform
Phase 7: Performance    → 23-caching-archival
Phase 8: UI Polish      → 20-ui-ux (runs parallel with all phases)
```

---

## WHEN YOU ARE UNSURE

1. **Check the relevant skill file first** — most answers are there
2. **Check 00-architecture-roadmap** — it has the single source of truth for decisions
3. **Check 01-docs** — past implementation decisions are recorded there
4. **Check docs/DEPLOYMENT_RCA.md** — 17 past issues with root causes and prevention rules
5. **Do not invent solutions** that conflict with documented architecture
6. If a skill file is ambiguous, use the most conservative/secure interpretation

---

## UI/UX NON-NEGOTIABLES

- Every entity name, IP, domain, hash, CVE, actor name = **clickable** → opens detail panel
- All important data = **highlighted** with severity color coding
- Every feature has a **tooltip** (hover) and **inline help** (? icon)
- **Mobile responsive** — test at 375px, 768px, 1280px, 1920px
- **Dark mode** is default; light mode is optional
- **3D card effects** on hover for interactive elements
- **Top stats bar** on every page (platform-wide) + **page-specific compact stats bar**
- **Collapsible sections** on all detail views
- Loading states with **skeleton screens** (never spinners alone)
- Empty states with **actionable CTAs** (never blank pages)

---

## DOCUMENTATION MANDATE

After EVERY implementation:
```
1. Update /docs/features/{module}/IMPLEMENTATION.md with what was built
2. Update /docs/api/{module}/API.md with new endpoints
3. Update /docs/CHANGELOG.md with version entry
4. Update /docs/ARCHITECTURE.md if any structural change
5. Update the module's README.md
```

---

## WHAT "DONE" MEANS

A feature is DONE only when:
- [ ] Implementation complete (no stubs)
- [ ] Unit tests written and passing (>80% coverage)
- [ ] Integration tests written and passing
- [ ] Documentation updated
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No lint errors (`eslint .`)
- [ ] Docker build succeeds (`make docker-test`)
- [ ] Tested on mobile viewport (375px)
- [ ] Tooltips and inline help added to UI
- [ ] Entity names/values are clickable where applicable
- [ ] No locked design tokens or components were modified (see UI_DESIGN_LOCK.md)

## DEPLOYMENT

When asked to deploy/push, use:

- GH_TOKEN: read from env $GH_TOKEN (stored in .claude/settings.local.json — never hardcode)
- Repo: read from env $ETIP_REPO (manishjnv/intelwatch)
- Always push to a feature branch and create a PR.
- VPS SSH key: read from file at $VPS_SSH_KEY_FILE (.claude/secrets/deploy_key — gitignored)
- Deploy path: read from env $VPS_DEPLOY_PATH (/opt/intelwatch/)
- ETIP compose file: read from env $ETIP_COMPOSE_FILE (docker-compose.etip.yml)
- Secrets stored in: .claude/settings.local.json (gitignored) and .claude/secrets/ (gitignored)
⚠️ Existing site running — never touch non-etip_ containers.
VPS CRITICAL: Two sites exist on the same VPS.
intelwatch.in = existing live site — NEVER modify it or its containers, nginx config, or files.
ti.intelwatch.in = ETIP project — all work goes here only.
VPS SSH: Port 22 is filtered by hosting provider for most IPs. Use GitHub Actions `vps-cmd.yml` workflow for remote commands. Cloudflare Tunnel SSH pending DNS setup.

## PRE-PUSH CHECKLIST (every git push to master)
```bash
# Option A — Full automated gate (preferred)
make pre-push    # runs: test → typecheck → lint → docker-build → docker-test → health-check

# Option B — Manual steps
pnpm -r test                                          # all tests pass
pnpm --filter '!@etip/frontend' -r run build          # build backend
pnpm --filter '!@etip/frontend' -r run typecheck      # 0 errors (frontend excluded — Vite aliases)
pnpm -r run lint                                      # 0 errors
make docker-test                                      # Docker build + health check
```
- No unused imports in changed files
- No hardcoded secrets
- .env.example updated if new TI_ vars added

## PRE-COMMIT RULE
Before every git push:
1. Read docs/DEPLOYMENT_RCA.md
2. If change matches a known issue → apply existing fix
3. If new issue → Fix FIRST, then commit, deploy to VPS, if test successful then add RCA entry.
   { title, exact_error, root_cause, fix, prevention, commit }
4. Fix commit format: "fix: [issue] — ref DEPLOYMENT_RCA.md"

## DEPLOYMENT VERIFICATION
Run automatically after every master push:

# 1. CI gate — wait for green
GitHub connector → manishjnv/intelwatch → deploy.yml → must pass

# 2. VPS state check (via vps-cmd.yml — SSH port 22 filtered)
```
docker ps --filter name=etip_ --format "{{.Names}} {{.Status}}"
curl -sf http://localhost:3001/health | jq .status
docker logs etip_api --since=3m 2>&1 | grep -Ei "error|fatal" | tail -10
```

# 3. Live smoke test
curl -sf https://ti.intelwatch.in/health → 200
curl -sf https://ti.intelwatch.in/login  → 200

# 4. Verdict table
| CI/CD | VPS commit | Containers | /health | /ready | Errors | Verdict |
|-------|------------|------------|---------|--------|--------|---------|
| ✅/❌ | ✅/❌      | ✅/❌      | ✅/❌   | ✅/❌  | ✅/❌  | PASS/FAIL |

FAIL → fix → redeploy → reverify  → RCA entry
PASS → update PROJECT_BRAIN.md → proceed

## SESSION START (copy-paste template)
Read E:\code\IntelWatch\PROJECT_BRAIN.md via filesystem.
Read E:\code\IntelWatch\docker-compose.etip.yml via filesystem.
Load from project knowledge: 00-ARCHITECTURE-ROADMAP.md,
00-MASTER.md, project files.
Read for previous errors E:\code\IntelWatch\docs\
Task: [task]. Begin pre-task ritual per 00-CLAUDE-INSTRUCTIONS.md.

---

## UI DESIGN LOCK — NON-NEGOTIABLE

> ⛔ READ `UI_DESIGN_LOCK.md` BEFORE ANY FRONTEND WORK

The platform has an approved futuristic design. These rules protect it:

### Hard Rule
NEVER modify any component or token listed in `UI_DESIGN_LOCK.md` unless
the user's prompt contains the exact phrase: `[DESIGN-APPROVED]`

If asked to change a locked item without `[DESIGN-APPROVED]`, respond:
> "This is a design-locked component (UI_DESIGN_LOCK.md). Add [DESIGN-APPROVED]
> to your prompt to confirm the change is intentional."

### Locked items (quick reference — full spec in UI_DESIGN_LOCK.md)
- CSS color tokens in `globals.css` and `packages/shared-ui/src/tokens/colors.ts`
- `EntityChip` — pill shape, entity type colors, hover actions, icon sizes
- `InvestigationPanel` — 480px width, z-50, slide animation, 8 action buttons
- `TopStatsBar` — h-9 height, items order, live indicator
- `IntelCard` — 3D Framer Motion transform values (rotateX:2, rotateY:-2, scale:1.01)
- `SeverityBadge` — severity-to-color mapping
- `GlobalSearch` — Cmd+K trigger, result category order, online fallback URLs
- `PageStatsBar` — py-2, bg-bg-elevated/50 pattern
- Internet search URL mappings per entity type

### The boundary rule
```
packages/shared-ui/  → LOCKED (never touch without [DESIGN-APPROVED])
apps/frontend/src/   → FREE   (module-specific, modify freely)
```

### New components
New UI components default to FREE status.
To lock a new component: add it to `UI_DESIGN_LOCK.md` with `[DESIGN-APPROVED]`.

### What triggers the lock check
Before writing ANY code that touches:
- `packages/shared-ui/**`
- `apps/frontend/src/globals.css`
- `apps/frontend/tailwind.config.js`
- Any file with `EntityChip`, `InvestigationPanel`, `TopStatsBar`, `IntelCard`,
  `SeverityBadge`, `GlobalSearch`, `PageStatsBar`, `LandingPage` in the filename or as an import
- `docker/nginx/landing.html` — canonical landing page reference, never overwrite

Check UI_DESIGN_LOCK.md first. If the component is listed → enforce the lock.
