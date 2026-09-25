# Step 7 — Consolidate the runtime (DECISION-032)

**Status:** proposed spec (written 2026-09-25). Nothing here is approved. Roadmap: `docs/ROADMAP_S149_PLUS.md` §3 step 7, §4 Phase 3, §6.
**Needs first:** step 3 (no business data in memory) for any group that holds business data, and step 6 (accept DECISION-032).

---

## 1. Goal

Run the 23 backend services as about **7 containers** instead of 23, **without rewriting any service**.
Each `apps/*` package keeps its code, its tests, its routes and its port. Only the way it is *started* changes.

## 2. Why now

- 23 backend containers + 9 infra/proxy containers on one 16 GB VPS, one developer (W9).
- Every new module (agent-service, playbooks, sandbox) would add a container. Consolidating first means steps 9–14 land in the new layout.
- The memory limits in `docker-compose.etip.yml` already add up to about **14.2 GB** on a 16 GB box that also runs the dhanradar stack and Caddy (see §3.4).
- DECISION-026 (one backend image) and DECISION-028 (CI-built image) mean every service is already in the same image. Only the `command:` differs.
- The original blueprint (`docs/architecture/ETIP_Architecture_Blueprint_v4.html`, "Deployment Architecture") planned **one Fastify API + 2 BullMQ workers**. This step moves back toward that plan.

---

## 3. Current state (verified)

### 3.1 How a service starts today
Every service has the same shape. Example `apps/analytics-service/src/index.ts`:
- L9–69 `main()`: `loadConfig(process.env)` → `initLogger` → `loadJwtConfig` / `loadServiceJwtSecret` → build stores → timers → `buildApp()` → signal handlers → `app.listen()`.
- L57–64 shutdown handler calls `app.close()` then **`process.exit(0)`**.
- L71–74 `main()` runs as soon as the file is imported.

`buildApp()` (`apps/analytics-service/src/app.ts` L26–92) creates its **own root Fastify instance** with helmet, cors, rate-limit, sensible, `registerMetrics(app, 'analytics-service')`, its own error handler and `/health` + `/ready` at the root.
Same pattern in `apps/caching-service/src/app.ts` L25–88 and `apps/admin-service/src/app.ts` L32–117.

All 23 `src/index.ts` files self-run `main()` and call `process.exit` (2–4 calls each). So **a host cannot just `import` an index.js** — it would start the service with its own signal handlers and exit logic.

### 3.2 Things that would clash in one process

| Clash | Where | Effect if merged naively |
|---|---|---|
| Same env key, different value | `TI_SERVICE_PORT` is used by alerting (3023), analytics (3024), caching (3025), reporting (3021) — compose L1113, L1151, L1192, L1228 | Two services try to bind the same port |
| Rate-limit key name differs | admin/analytics/caching read `TI_RATE_LIMIT_MAX`; api/ingestion read `TI_RATE_LIMIT_MAX_REQUESTS` | Harmless, but env must be per service |
| Root routes `/health`, `/ready`, `/metrics` | every `buildApp` | Route collision if all share one Fastify root |
| Process-wide singletons | `packages/shared-auth/src/jwt.ts` L52 `_config`, `service-jwt.ts` L18 `_serviceSecret` | Last loader wins. Safe only because every service gets the same JWT values from `.env` |
| Direct `process.env` reads outside config | ingestion (5 files), normalization (7), user-service (5), customization (4), billing (3), others 1–2. **None** in admin/analytics/caching | Later groups need identical values for those keys |
| One Prisma client per service | 13 `new PrismaClient(...)` (`apps/*/src/prisma.ts`) | Each has its own pool (Prisma default ≈ 2×CPU+1 = 9 on 4 vCPU). 13 × 9 = 117 > Postgres default `max_connections` 100 (not overridden in `docker/`). Merging and sharing *reduces* this risk |
| Hard-coded container hostnames | `apps/analytics-service/src/services/aggregator.ts` L86–97, L226–245; `apps/onboarding/src/config.ts` L16–21; `apps/api-gateway/src/routes/auth.ts` L18 | Hostnames like `etip_admin` must keep resolving |
| Default process metrics per registry | `packages/shared-utils/src/metrics.ts` L70–72 (a new `Registry` + `collectDefaultMetrics` per service) | Safe (no duplicate-registration error), but the 3 services report the **same** process RSS under 3 `service` labels. Dashboards that sum memory will triple-count |

The Prisma helper already allows sharing: `apps/ioc-intelligence/src/prisma.ts` L7–14 uses `globalThis.prisma ?? new PrismaClient()`. In production it never *writes* `globalThis.prisma`, but it always *reads* it. A host that sets `globalThis.prisma` before loading services makes 11 of 13 services share one client with no code change (`ai-enrichment` and `api-gateway` don't use this pattern).

### 3.3 Timers, crons and workers (must stop cleanly)
- analytics: `setInterval` 5 min (`index.ts` L40–46).
- caching: `cacheInvalidator.start()`, `archiveEngine.startCron()` (`TI_ARCHIVE_CRON` 02:00), `node-cron` warm task every 30 min, 6 h retention `setInterval`, BullMQ `EventListenerWorker` (`index.ts` L56–75). All stopped in its shutdown (L96–106).
- admin: no timers; queue monitor + DLQ routes open BullMQ/Redis connections per request (`app.ts` L108–114).
- Across all apps: BullMQ `Worker`s in ingestion, normalization, ai-enrichment, correlation, es-indexing, alerting, integration, reporting, caching, api-gateway, threat-graph.

### 3.4 Memory — what we know
- **No per-service memory measurement exists in the docs.** The only number is "33 containers (~3–4 GB)" on the old 8 GB VPS (`docs/DEPLOYMENT_RCA.md` L666, Issue 43).
- Compose limits today: 11 services × 512M (api, ingestion, normalization, enrichment, ioc, actor, malware, vuln, graph, correlation, hunting) = 5,632M; 12 services × 256M = 3,072M; infra + nginx + frontend = 5,868M. **Total ≈ 14.2 GB of limits.**
- The Prometheus data already has it: `process_resident_memory_bytes{service=...}` from every service (`packages/shared-utils/src/metrics.ts` L72). **Pilot session 1 must record a baseline from this and from `docker stats` before changing anything.**

### 3.5 Routing, deploy and monitoring
- nginx: one `upstream` per service by container name (`docker/nginx/conf.d/default.conf` L7–100). `/api/v1/admin` → `etip_admin:3022` (L513), `/api/v1/analytics` → `etip_analytics:3024` (L573), `/api/v1/cache` + `/api/v1/archive` → `etip_caching:3025` (L588, L602). Admin/cache/archive use the super-admin `auth_request` (L384–402); analytics uses the normal one.
- **admin, analytics and caching have no auth inside the service** — they rely on nginx `auth_request`. Anything that can reach them inside `etip_network` skips auth (see STEP_09 §Risks).
- deploy.yml: recreates a hard-coded list of 25 containers (L192), then `check_health "<name>" <port> <container>` per service (L240–262), with only 6 marked critical.
- Prometheus: static targets by container name (`docker/prometheus/prometheus.yml` L13–38).
- `scripts/health-recovery.sh` L19–44 restarts **any** `etip_*` container that is `created`/`exited` by running `compose up -d <name>`.
- `user-service` is **not** a container. It is a library inside api-gateway (`apps/api-gateway/package.json` L39). The roadmap's "gateway (api-gateway + user-service)" group already exists.
- `etip_ingestion` has **no host port** in compose (L276–332), so the deploy check on `127.0.0.1:3004` (deploy.yml L241) can never pass. It is "non-critical", so it always prints PENDING.

---

## 4. Target architecture

### 4.1 The approach: one process, many listeners
Each service keeps its own Fastify instance **and its own port**. A small host process starts several of them in one Node process.

```
                 etip_nginx  (config unchanged)
   /api/v1/admin ──► etip_admin:3022 ─┐
   /api/v1/analytics ► etip_analytics:3024 ─┤  network aliases of ONE container
   /api/v1/cache ──► etip_caching:3025 ─┘
                                      ▼
   ┌───────────── container etip_platform (etip-backend image) ─────────────┐
   │ node apps/runtime-host/dist/index.js   ETIP_SERVICES=admin,analytics,caching │
   │  ├─ admin-service      start(env) → Fastify :3022 (own helmet/cors/limits)   │
   │  ├─ analytics-service  start(env) → Fastify :3024                            │
   │  ├─ caching-service    start(env) → Fastify :3025 + crons + BullMQ worker    │
   │  └─ shared: one Node runtime, one module cache, one Prisma client (later)    │
   └─────────────────────────────────────────────────────────────────────────────┘
```

Why this and not "one Fastify root with many plugins":
- No route collisions (`/health`, `/metrics` stay per port).
- Each service keeps its own helmet/cors/rate-limit/error handler exactly as tested.
- **nginx, Prometheus targets and hard-coded hostnames need no change**: the new container carries network aliases (`etip_admin`, `etip_analytics`, `etip_caching`).
- The saving comes from one V8 runtime, one copy of loaded modules (fastify, zod, pino, bullmq, prisma) and later one Prisma pool. The per-Fastify-instance cost is small.
- A single-port version can come later if the pilot shows it is worth it. Not part of this step.

### 4.2 Proposed deployables (checked against real dependencies)

| Deployable | Services (ports) | Why together | Today's limits → proposed |
|---|---|---|---|
| `etip_api` (gateway) | api-gateway 3001 (+ user-service library) | Already one process. **No work** | 512M → 512M |
| `etip_platform` | admin 3022, analytics 3024, caching 3025, user-management 3016, customization 3017, onboarding 3018, billing 3019 | Low-traffic admin/tenant APIs. caching → analytics HTTP (compose L1241) | 7×256 = 1,792M → ~768M |
| `etip_intel` | ioc-intelligence 3007, threat-actor 3008, malware 3009, vulnerability 3010 | Four near-identical Prisma CRUD services. onboarding calls all four | 4×512 = 2,048M → ~768M |
| `etip_graph_hunt` | threat-graph 3012, correlation 3013, hunting 3014 | hunting → graph + correlation, correlation → graph (compose L706, L747–748). Neo4j stays in threat-graph only (DECISION-018) | 3×512 = 1,536M → ~1,024M |
| `etip_integrations` | integration 3015, alerting 3023, reporting 3021 | Outbound side: alerting pushes `INTEGRATION_PUSH` (`alert-worker.ts` L61), integration consumes it (`event-router.ts` L39) | 3×256 = 768M → ~512M |
| `etip_pipeline` | ingestion 3004, normalization 3005, ai-enrichment 3006, es-indexing 3020 | The feed → normalize → enrich → index chain | 3×512 + 256 = 1,792M → decide after measuring |
| `etip_drp` | drp-service 3011 | Outbound scanning of customer assets; keep isolated | 256M → 256M |

Change from the roadmap §6: **correlation moves from intel-core to graph-hunt** (its only HTTP dependency is threat-graph, and hunting depends on it). Proposed limits are guesses; set real ones from the pilot (max observed RSS × 1.5).

**Pipeline caution.** The roadmap says "scale workers by replica count". That is not safe yet:
- `FeedScheduler` enqueues with `jobId: sched-${feedId}-${Date.now()}` (`apps/ingestion/src/workers/scheduler.ts` L229), so two replicas double-enqueue.
- `GlobalFeedScheduler`, the normalization lifecycle cron and the midnight reset also run in every copy.
- normalization serves the main IOC list API (`/api/v1/iocs`, nginx L173–175), so CPU-heavy batches share an event loop with user requests.
Do the pipeline group **last**, possibly as 2 processes (ingestion alone; normalization + enrichment + indexing), and add a "scheduler runs in one copy only" flag before any replicas.

---

## 5. Changes file by file (pilot: admin + analytics + caching)

### 5.1 Each pilot service (3 × S sessions, same recipe)
`apps/<svc>/src/start.ts` (new, < 120 lines): move the body of `main()` here.
```ts
export interface ServiceHandle { name: string; port: number; close(): Promise<void> }
export async function start(env: Record<string, string | undefined>): Promise<ServiceHandle> {
  const config = loadConfig(env);           // env passed in, never process.env
  // ... same steps as main() today: logger, JWT, stores, timers, buildApp ...
  await app.listen({ port: config.TI_SERVICE_PORT, host: config.TI_SERVICE_HOST });
  return { name: 'analytics-service', port: config.TI_SERVICE_PORT,
           close: async () => { clearInterval(maintenanceInterval); await app.close(); } };
}
```
Rules: no `process.on(...)`, no `process.exit` in `start.ts`. `close()` must stop **every** timer, cron, worker and Redis client the service started (caching: copy its current shutdown list, L98–104).

`apps/<svc>/src/index.ts`: becomes ~20 lines: `start(process.env)`, then SIGTERM/SIGINT → `handle.close()` → `process.exit(0)`. Standalone behaviour is unchanged, so the old compose command still works (this is the rollback path).

Tests (`apps/<svc>/tests/start.test.ts`): `start()` with port 0 → `/health` 200 → `close()` → no open handles (vitest `--reporter=hanging-process` or check timers with fake timers). Existing tests must pass untouched.

### 5.2 New package `apps/runtime-host` (M session — new package checklist applies)
| File | Purpose |
|---|---|
| `package.json` | deps: `@etip/admin-service`, `@etip/analytics-service`, `@etip/caching-service` (`workspace:*`), `pino` |
| `tsconfig.json` | `composite: true`, `references` to the 3 apps |
| `src/services.ts` | Static table: name → `load: () => import('@etip/analytics-service/dist/start.js')` + fixed env (e.g. `TI_SERVICE_PORT: '3024'`). Deep import works: `tsconfig.base.json` uses `Node16` resolution and the apps have no `exports` map |
| `src/env.ts` | `buildEnv(base, name)`: copy `process.env`, apply the table's fixed values, then apply `<NAME>__KEY=value` overrides (e.g. `CACHING__TI_RATE_LIMIT_MAX=300`) |
| `src/index.ts` | Read `ETIP_SERVICES`. Start each service **in order**; if one fails, close the ones already started and exit 1. One SIGTERM/SIGINT handler: close in reverse order, 8 s timeout each, then exit 0. `uncaughtException` → log with service name → exit 1 (Docker restarts it) |
| `tests/*.test.ts` | env builder, start order, fail-fast, reverse shutdown, timeout (use fake `start()` modules) |

Root files (listed in CLAUDE.md "New Package Checklist"): `tsconfig.build.json` (add reference after the 3 apps), `Dockerfile` deps stage (one `COPY apps/runtime-host/package.json apps/runtime-host/tsconfig.json apps/runtime-host/` line), `pnpm-lock.yaml` (regenerated by `pnpm install`; CI uses `--frozen-lockfile`), `docs/PROJECT_STATE.md` module table.

### 5.3 Ops files (M session)
`docker-compose.etip.yml`:
```yaml
  etip_platform:
    image: etip-backend:latest
    container_name: etip_platform
    restart: unless-stopped
    command: ["node", "apps/runtime-host/dist/index.js"]
    stop_grace_period: 30s
    environment:
      ETIP_SERVICES: admin,analytics,caching
      NODE_OPTIONS: --max-old-space-size=384
      # union of the three services' current env blocks (L1027–1040, L1190–1199, L1226–1242),
      # minus TI_SERVICE_PORT / TI_ADMIN_PORT (the host sets those per service)
    ports: ["127.0.0.1:3022:3022", "127.0.0.1:3024:3024", "127.0.0.1:3025:3025"]
    depends_on: { etip_redis: {condition: service_healthy}, etip_minio: {condition: service_started}, etip_api: {condition: service_healthy} }
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://127.0.0.1:3022/health && curl -sf http://127.0.0.1:3024/health && curl -sf http://127.0.0.1:3025/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      etip_network:
        aliases: [etip_admin, etip_analytics, etip_caching]
    deploy: { resources: { limits: { memory: 512M } } }
```
- Old `etip_admin`, `etip_analytics`, `etip_caching` blocks: keep them, add `profiles: ["legacy"]` (not started by default; kept for rollback).
- `etip_nginx.depends_on` (L1313, L1321, L1323): replace the three entries with `etip_platform`.

`.github/workflows/deploy.yml`:
- L192: replace `etip_admin etip_analytics etip_caching` with `etip_platform`.
- **Before** that line add `docker compose -p etip -f docker-compose.etip.yml rm -sf etip_admin etip_analytics etip_caching || true`. The old containers must be **removed**, not just stopped: otherwise they hold host ports 3022/3024/3025, answer on the same DNS names, and `scripts/health-recovery.sh` would restart them (it restarts any exited `etip_*` container).
- L257, L261, L262: keep the port checks, change the container argument to `etip_platform` (used for `docker logs`).

`docker/prometheus/prometheus.yml`: targets stay (aliases resolve). Add a `deployable` label by moving the 3 targets into their own `static_configs` entry with `labels: { env: production, deployable: platform }`. Memory panels must then use `max by (deployable)` instead of `sum by (service)`.

nginx: **no change.** `scripts/health-recovery.sh`: no change (it will restart `etip_platform` by name).

---

## 6. Pilot plan (admin + analytics + caching)

Why these three: all 256M, no Prisma, no business data that survives today anyway (admin and analytics are in-memory per DECISION-013; caching archive manifests are W14), and they read env only in `index.ts`.

| # | Step | Done when |
|---|---|---|
| 1 | **Baseline** (before any code): on the VPS, 5 samples over 24 h of `docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' \| grep etip_`; from Prometheus the 24 h average and max of `process_resident_memory_bytes` and `nodejs_eventloop_lag_p99_seconds` per service; durations of the last 3 "Deploy via SSH" steps; `time docker compose ... up -d --force-recreate etip_admin etip_analytics etip_caching` until all 3 healthy | Numbers written in `docs/roadmap/STEP_07_PILOT_RESULTS.md` |
| 2 | Sessions 5.1 × 3 (one service each) | Tests green, standalone deploy unchanged |
| 3 | Session 5.2 (runtime-host) | Local: `ETIP_SERVICES=admin,analytics,caching node apps/runtime-host/dist/index.js` serves all 3 health URLs; `make docker-test` passes |
| 4 | Session 5.3 (ops) + deploy | `etip_platform` healthy, nginx routes work |
| 5 | Smoke list (same as baseline): `GET /api/v1/admin/system/health`, `/api/v1/admin/queues`, `/api/v1/analytics`, `/api/v1/analytics/widgets`, `/api/v1/cache/stats`, `/api/v1/archive/status` with a super-admin token | Same status codes as the baseline |
| 6 | **Rollback drill** once (§8) on the VPS, then roll forward again | Both directions < 5 min |
| 7 | Watch 7 days, then repeat the step-1 measurements | Go/no-go below |

**Go** only if all are true:
1. Combined RSS (24 h average) ≤ **75 %** of the baseline sum of the three.
2. No unplanned restart of `etip_platform` in 7 days (`docker inspect -f '{{.RestartCount}}'`).
3. Smoke list matches baseline; nginx 5xx rate for the 4 prefixes not higher than baseline.
4. Crons ran: archive log at 02:00 UTC, cache-warm every 30 min, analytics maintenance every 5 min.
5. `docker stop etip_platform` finishes in < 10 s with exit code 0 (not 137).
6. Deploy step time not worse by more than 10 %.
7. Event-loop lag p99 < 50 ms.

**No-go:** roll back (§8), write the numbers into DECISION-032 as "Rejected after pilot" or "Revised", and stop. An honest note: the pilot services are small, so the RAM saving may be modest (estimate, unmeasured: tens of MB to ~150 MB). The main payoff of the full rollout is **23 → 7 containers** to deploy, watch and restart; judge the pilot mostly on criteria 2–7.

## 7. Rollout order (one group per phase, each after the previous is green for 7 days)
1. **platform, rest:** user-management, customization, onboarding, billing (billing is 🔒 — Razorpay webhook; adversarial review). Set `globalThis.prisma` in the host so the 4 share one client. Needs step 3's S159b done for onboarding readiness.
2. **intel:** ioc, actor, malware, vuln. Biggest limit saving (4 × 512M). Shared Prisma client.
3. **integrations:** after step 3's S154–157 (alerting + integration persisted).
4. **graph-hunt:** after S159 (hunting persisted). Check the correlation Redis checkpoint still works.
5. **pipeline:** last, after a "single scheduler" flag. Measure event-loop lag under a full feed cycle before merging.
6. gateway, drp: nothing to do.

Each group = one S session per service (`start.ts`) + one M ops session (compose, deploy.yml, Prometheus labels, runtime-host table entry).

## 8. Rollback
The old per-service `command:` still works from the same image, because `index.ts` still starts the service standalone.
```bash
cd /opt/intelwatch
docker compose -p etip -f docker-compose.etip.yml rm -sf etip_platform
docker compose -p etip -f docker-compose.etip.yml --profile legacy up -d etip_admin etip_analytics etip_caching
docker restart etip_nginx     # nginx resolves upstream names once at start; refresh the IPs
curl -sf http://127.0.0.1:3022/health && curl -sf http://127.0.0.1:3024/health && curl -sf http://127.0.0.1:3025/health
```
Permanent rollback = revert the ops commit (compose + deploy.yml + prometheus). The `start.ts` refactor can stay; it is harmless.
Git: `git tag safe-point-<date>-step7-pilot` before the ops session (CLAUDE.md Rollback Rule).

## 9. Tests and acceptance checks
- Per service: `start.test.ts` (start on port 0, health 200, close leaves no handles). All existing tests unchanged and green.
- runtime-host: env builder (fixed values win over base, `NAME__KEY` overrides, other prefixes stripped), fail-fast, reverse shutdown, per-service close timeout.
- `make pre-push` + `make docker-test` green; in `docker-test`, all 3 ports answer from one container.
- Acceptance on VPS: `docker ps` shows `etip_platform` healthy and no `etip_admin/analytics/caching`; `getent hosts etip_admin` inside `etip_nginx` resolves to the `etip_platform` IP; Prometheus `up{instance=~"etip_(admin|analytics|caching).*"} == 1`; Command Center "Service health" (analytics `aggregator.ts` L226–245) shows all green.

## 10. Session breakdown
| Session | Module | Task | Size |
|---|---|---|---|
| 168 | docs | Accept/reject DECISION-032 (draft below). Record baseline (pilot step 1) | S |
| 169a | analytics-service | `start.ts` + slim `index.ts` + test | S |
| 169b | caching-service | same | S |
| 169c | admin-service | same | S |
| 170 | runtime-host (new) | package + tests + root checklist files | M |
| 171 | ops | compose, deploy.yml, prometheus; deploy; rollback drill | M |
| 172 | docs | 7-day results, go/no-go, update DECISION-032 | S |
| 173+ | per group | §7, one module per session | S/M each |

## 11. Owner decisions needed
1. Accept DECISION-032 **for the pilot only** (full rollout decided after §6).
2. Approve changes to ✅ Deployed modules (admin, analytics, caching) — small, behaviour-preserving refactor.
3. Approve new workspace package `apps/runtime-host` (touches root `tsconfig.build.json`, `Dockerfile`, lockfile).
4. Crash policy: **one service crashes → whole container restarts** (recommended; same as today per service) vs. keep others running (more code, hides failures).
5. Go/no-go thresholds in §6.
6. Pipeline group: merge into 1, 2 or keep 4 processes (decide after groups 1–4).

## 12. Risks
| Risk | Mitigation |
|---|---|
| Bigger blast radius: one crash or memory leak takes 3–7 services down | Fail fast + Docker restart; heap cap via `NODE_OPTIONS`; roll out one group at a time; watch restart count |
| Shared event loop: a slow service slows the others | Pick low-CPU groups first; alert on event-loop lag; pipeline last |
| Old containers left behind hold ports / DNS names, or get revived by `health-recovery.sh` | `compose rm -sf` in deploy.yml before `up`; `profiles: ["legacy"]` |
| nginx keeps stale upstream IPs after a swap | Deploy already recreates nginx; rollback script restarts it |
| Dashboards triple-count process memory | `deployable` label; use `max by (deployable)` |
| Env key collisions in later groups (`TI_SERVICE_PORT`, direct `process.env` reads) | Host sets per-service values; audit each service's `process.env` reads in its S session |
| In-memory data lost on restart (admin, analytics trends, caching manifests) | Not new — lost on every deploy today. Step 3 fixes it; groups with business data wait for step 3 |
| Prisma pool size changes when clients are shared | Set `connection_limit` in the group's `TI_DATABASE_URL`; watch `pg_stat_activity` |

---

## 13. DECISION-032 draft (for `docs/DECISIONS_LOG.md`)

### DECISION-032: Run backend services as ~7 multi-service processes
**Date:** 2026-09-xx | **Status:** Proposed — pilot first
**Context:** 23 backend services each run in their own container (32 containers in total) on one 16 GB VPS that also hosts another stack. Compose memory limits already add up to ~14.2 GB. Every service adds a container, port, healthcheck, nginx route, Prometheus target and deploy step, and every new feature has so far become a new service (W9). All services already ship in one image (DECISION-026, DECISION-028) and differ only in their start command. The original blueprint planned one API process plus workers.
**Decision:** Keep every `apps/*` package, its code, tests, routes and port. Add a small `apps/runtime-host` that starts several services in one Node process, each with its own Fastify instance and port. Each service exposes `start(env) → { close() }`; its `index.ts` still runs it standalone. Containers keep the old DNS names as network aliases, so nginx, Prometheus and service-to-service URLs don't change. Target ~7 deployables: api, platform, intel, graph-hunt, integrations, pipeline, drp. Pilot with admin + analytics + caching; roll out one group at a time only after a 7-day go/no-go.
**Alternatives:** (1) Keep 23 containers (status quo; grows with every feature). (2) One Fastify root with each service as a plugin on one port (route collisions on `/health`, `/metrics`; each service's helmet/cors/rate-limit/error handler must be reworked; little extra saving). (3) Rewrite into a single monolith app (large rewrite, loses module boundaries). (4) Kubernetes / bigger VPS (more cost and ops, doesn't reduce moving parts).
**Consequences:** Fewer containers, deploy steps and targets. Shared runtime saves memory (to be measured). A crash or leak now affects the whole group, and services share an event loop, so CPU-heavy pipeline services go last and may stay split. Rollback is a compose change: the old per-service commands still work from the same image. Scheduler/cron code must become "run once" before any group is scaled by replicas.
