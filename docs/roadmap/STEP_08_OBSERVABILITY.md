# Step 8 — Observability: Grafana alerts, request-ID across services, OpenTelemetry later

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 8, §4 Phase 3 "later" row · **Module:** ops (`docker/grafana`, `docker/prometheus`, `docker/nginx`) + small per-service follow-ups · **Size:** M + M + S
**Status:** spec, not started. Written 2026-09-25. All claims checked against the repo on that date.

---

## 1. Goal

1. **Inside alerts:** Grafana sends email/Telegram when a service is down, erroring, slow, or near its memory limit. (Step 1 covers "is the site reachable from outside". This step covers "what inside is broken".)
2. **One request ID end to end:** the ID nginx creates shows up in nginx logs, every service log line for that request, service-to-service calls, BullMQ jobs, and the error the user sees. One ID → one `grep` across all containers.
3. **Later:** OpenTelemetry traces, once the runtime is smaller (Step 7).

## 2. Why now

- After Step 7 there are fewer processes, so alerts and traces are simpler to set up and cheaper to run.
- Steps 10–13 add AI agents that **act** (playbooks, approvals). Before that, we must be able to see failures and follow one request through the system.
- Today metrics are collected and dashboards exist, but **nobody is told** when something breaks inside.

## 3. Current state (verified)

### 3a. Metrics and dashboards

| Piece | Today | File / line |
|---|---|---|
| Prometheus | `prom/prometheus:v2.53.0`, 30-day retention, port 9190 on 127.0.0.1 | `docker-compose.etip.yml` lines 166–190 |
| Scrape config | Job `etip-services`: all 23 backends on `/metrics` every 15 s. Job `prometheus` (self). Job `dhanradar` (another app on the same VPS) | `docker/prometheus/prometheus.yml` |
| Alert rules / Alertmanager | **None.** No `rule_files:`, no `alerting:` block, no Alertmanager container | `prometheus.yml`; compose has no alertmanager |
| Exporters | **None** for host (node-exporter), containers (cAdvisor), Postgres, Redis, ES, Neo4j | compose service list |
| App metrics | `registerMetrics()` in shared-utils: `http_requests_total`, `http_request_duration_seconds` (labels method/route/status_code, default label `service`), plus prom-client default Node metrics (`process_resident_memory_bytes`, `nodejs_eventloop_lag_seconds`, …). Used by **all 23** services | `packages/shared-utils/src/metrics.ts` lines 66–106 |
| Grafana | `grafana/grafana:11.1.0`, provisioning mounted from `docker/grafana/provisioning`, dashboards from `docker/grafana/dashboards` | compose lines 193–223 |
| Grafana provisioning | `datasources/prometheus.yml` (uid `etip-prometheus`), `dashboards/dashboards.yml`. **No `alerting/` folder** — no contact points, no rules | `docker/grafana/provisioning/` |
| Dashboards | 6 JSON files: service-health, api-gateway, pipeline-overview, pipeline-queues, feed-health, ai-cost-tracking | `docker/grafana/dashboards/` |
| **Dead panels** | `etip-pipeline-queues.json` uses `bullmq_waiting`, `bullmq_failed`, `bullmq_completed_total`, `etip_articles_ingested_total`, `etip_iocs_extracted_total`, `etip_ai_*`. `etip-ai-cost-tracking.json` uses `etip_ai_cost_usd`, `etip_ai_tokens_total`, `etip_ai_budget_daily_usd`. **No code emits any of these** (`grep "new Gauge\|new Counter\|new Histogram"` → only the 2 in metrics.ts). These panels are always empty | dashboards + `metrics.ts` |
| Grafana access | nginx `location /grafana/` proxies to Grafana with **no `auth_request`**. `GF_SECURITY_ADMIN_PASSWORD` defaults to `etip_grafana_admin` if `TI_GRAFANA_PASSWORD` is unset. `GF_SERVER_ROOT_URL` is `http://localhost:3101` (no sub-path), so the UI is likely broken under `/grafana/`, but `/grafana/api/...` is reachable from the internet | `docker/nginx/conf.d/default.conf` lines 642–652; compose lines 198–200 |
| Email sender | admin-service uses Resend (`TI_RESEND_API_KEY`, set only on `etip_admin`) | `apps/admin-service/src/services/email-sender.ts`; compose line 1038 |

### 3b. In-app alerting that exists (not wired to the owner)

| Piece | What it does | Gap |
|---|---|---|
| gateway `error-alerting` plugin | Counts 5xx in a 5-min window (threshold 5), publishes `QUEUE_ALERT` via Redis pub/sub | In-memory counter; only the gateway's own 5xx |
| admin-service `QueueAlertEvaluator` | Reads queue depths (`llen bull:<q>:wait`, etc.), fires `QUEUE_ALERT` on red | Delivers by **`LPUSH` of raw JSON into `bull:<ALERT_EVALUATE>:wait`** (`queue-alert-evaluator.ts` line 64, ~208). A BullMQ wait list holds job IDs, not JSON, so the alerting worker most likely never processes it. **Verify** before relying on it |
| alerting-service | Tenant alert rules/channels | In-memory store (roadmap W4, fixed in Step 3). Built for tenant security alerts, not platform ops |
| ingestion `global-fetch-base` | "Emit QUEUE_ALERT (via log — actual event bus integration in future phase)" | Log line only (`global-fetch-base.ts` line 205) |

Conclusion: **no platform alert reaches a human today.** Grafana alerting is the simplest path: it already has the data.

### 3c. Request ID

| Hop | Today | File / line |
|---|---|---|
| nginx creates ID | `proxy_set_header X-Request-ID $request_id;` in **31 `/api/...` locations** | `docker/nginx/conf.d/default.conf` lines 151–625 |
| nginx gaps | Not set on `/health`, `/ready`, `/ws/`, `/grafana/`, `/` (frontend). **Not in the access log** (`log_format main` has no `$request_id`). Not returned to the browser | `default.conf` lines 124–141, 632–661; `docker/nginx/nginx.conf` lines 16–19 |
| Caddy → nginx | Caddy is outside this repo (`ti-platform` stack); unknown whether it sends its own ID | — |
| Services accept it | **All 23** Fastify apps set `requestIdHeader: 'x-request-id'` → `req.id` = nginx ID, and Fastify's request logger adds `reqId` to every `req.log` line | `grep -l requestIdHeader apps/*/src/app.ts` → 23 files; e.g. `apps/api-gateway/src/app.ts` line 64 |
| Services return it | Only the public API: `reply.header('X-Request-Id', req.id)` | `apps/api-gateway/src/routes/public/index.ts` line 25 |
| Error body | No request ID in error JSON (`{ error: { code, message } }`) | `apps/api-gateway/src/plugins/error-handler.ts` lines 12–36 |
| Logs outside a request | Services also log through module loggers (`getLogger()`), which have no `reqId` | e.g. `apps/onboarding/src/services/service-client.ts` line 32 |
| Service → service HTTP | **Not forwarded.** Clients send only `Authorization: Bearer <service JWT>` | `apps/onboarding/src/services/service-client.ts` lines 40–46; also `apps/ingestion/src/services/customization-client.ts`, `apps/correlation-engine/src/services/graph-integration.ts`, `apps/drp-service/src/services/graph-integration.ts`, `apps/hunting-service/src/services/*-integration.ts` / `ioc-pivot-chains.ts` |
| BullMQ jobs | No `requestId`/correlation field in job data | `grep requestId packages/shared-types/src` → none |
| Shared helper | **None** in shared-utils (`errors, events, queues, metrics, …` — no request context) | `packages/shared-utils/src/` |
| OpenTelemetry | **None** (`grep -r opentelemetry apps packages` → no hits outside node_modules) | — |

## 4. Flow

### 4a. Alerts

```
23 services /metrics ──▶ Prometheus (15 s) ──▶ Grafana alert rules (provisioned from git)
                                                   │ firing for N min
                                                   ▼
                                     notification policy (group by service, repeat 4 h)
                                        ├── contact point "owner-email"   (SMTP via Resend)
                                        └── contact point "owner-telegram" (bot token + chat id)
```

### 4b. Request ID

```
browser ─▶ Caddy ─▶ nginx  $request_id = abc123
                    │  log: ... rid=abc123          add_header X-Request-ID abc123 → browser
                    ▼
               etip_api  req.id = abc123   log {reqId: abc123}
                    │  service call: header x-request-id: abc123
                    ▼
               etip_xxx   req.id = abc123   log {reqId: abc123}
                    │  queue.add(..., { ..., requestId: 'abc123' })
                    ▼
               worker     log {requestId: abc123}
error to user: { error: { code, message, requestId: "abc123" } }   UI shows "Ref: abc123"

Debug:  docker compose -p etip logs --since 1h | grep abc123
```

## 5. Changes

### Infra (session S-8a: alerts)

| File | Change |
|---|---|
| `docker/grafana/provisioning/alerting/contact-points.yaml` (new) | Two contact points: `owner-email` (type email, address from env `$TI_ALERT_EMAIL`), `owner-telegram` (type telegram, `bottoken: $TI_ALERT_TELEGRAM_BOT_TOKEN`, `chatid: $TI_ALERT_TELEGRAM_CHAT_ID`). Grafana expands `$VAR` in provisioning files |
| `docker/grafana/provisioning/alerting/policies.yaml` (new) | Root policy → both contact points; `group_by: [alertname, service]`; `group_wait 30s`, `repeat_interval 4h` |
| `docker/grafana/provisioning/alerting/rules.yaml` (new) | Rules in §6 below, datasource uid `etip-prometheus`, folder `ETIP` |
| `docker-compose.etip.yml` (`etip_grafana` only) | Add `GF_SMTP_ENABLED=true`, `GF_SMTP_HOST=smtp.resend.com:465`, `GF_SMTP_USER=resend`, `GF_SMTP_PASSWORD=${TI_RESEND_API_KEY:-}`, `GF_SMTP_FROM_ADDRESS=alerts@intelwatch.in`, and pass `TI_ALERT_EMAIL`, `TI_ALERT_TELEGRAM_BOT_TOKEN`, `TI_ALERT_TELEGRAM_CHAT_ID`. Change `GF_SECURITY_ADMIN_PASSWORD` to `${TI_GRAFANA_PASSWORD:?TI_GRAFANA_PASSWORD is required}` (no weak default) |
| `docker/nginx/conf.d/default.conf` | `/grafana/`: add the existing super-admin `auth_request` (same pattern as `/_etip_auth_super_admin`, line 394) **or** remove the location and use an SSH tunnel to 127.0.0.1:3101. Owner decision |
| `docs/runbooks/ALERTS.md` (new) | One section per alert: what it means, first 3 commands to run |

### Infra (session S-8b: request ID at the edge)

| File | Change |
|---|---|
| `docker/nginx/nginx.conf` | `log_format main` → append `rid=$request_id rt=$request_time` |
| `docker/nginx/conf.d/default.conf` | Server level: `add_header X-Request-ID $request_id always;` (inherited — no location sets `add_header`, line 114 comment). Add `proxy_set_header X-Request-ID $request_id;` to `/health`, `/ready`, `/ws/`, `/` |

### Backend (session S-8c: shared helper — **shared package, needs owner OK**)

| File | Change |
|---|---|
| `packages/shared-utils/src/request-context.ts` (new, <100 lines) | Node built-in `AsyncLocalStorage` (no new library). `registerRequestContext(app)` adds an `onRequest` hook that stores `req.id`; `getRequestId()` returns it or `undefined`; `withRequestIdHeaders(headers)` adds `x-request-id` when present; `onSend` hook sets `X-Request-ID` response header. Structural types like `metrics.ts`, so shared-utils needs no fastify dependency |
| `packages/shared-utils/src/index.ts` | Export the 3 functions |
| `packages/shared-utils/src/request-context.test.ts` (new) | Tests in §7 |

### Backend (per-service adoption — as touched, one module per session)

| File | Change |
|---|---|
| `apps/api-gateway/src/app.ts` | `registerRequestContext(app)` next to `registerMetrics` (line 103) |
| `apps/api-gateway/src/plugins/error-handler.ts` | Add `requestId: req.id` to every error body (lines 12–36). Additive field; clients ignore unknown fields |
| Each `apps/*/src/app.ts` | `registerRequestContext(app)` — one line. Can go into the Step 7 consolidated entry points instead of 23 edits |
| Service clients (list in §3c) | Wrap headers with `withRequestIdHeaders({...})` |
| BullMQ producers | Add optional `requestId: getRequestId()` to job data; workers bind it to their log (`log.child({ requestId })`) |

### Metrics that dashboards expect (session S-8d — admin-service, optional)

| File | Change |
|---|---|
| `apps/admin-service/src/routes/queue-monitor.ts` or a new `services/queue-metrics.ts` | Register gauges `bullmq_waiting{queue}`, `bullmq_failed{queue}` and counter-like `bullmq_completed_total{queue}` from the depths it already reads (`fetchQueueDepths`, line 30). Names match `etip-pipeline-queues.json`, so the dashboard starts working with no JSON change. Needs `registerMetrics` to accept extra metrics (small shared-utils change) or a second registry on `/metrics/queues` + a scrape job |

### Frontend (as touched, Step 5 or later)

| File | Change |
|---|---|
| API error toast / error state component | Show "Ref: <requestId>" from the error body or `X-Request-ID` header, with a copy button |

## 6. Alert rules (first set)

Only metrics that exist today. Every rule filters `job="etip-services"` so the `dhanradar` job never alerts us.

| Alert | Expression (PromQL) | For | Severity |
|---|---|---|---|
| ServiceDown | `up{job="etip-services"} == 0` | 3m | critical |
| ScrapeMissing | `absent(up{job="etip-services"})` | 5m | critical |
| High5xxRate | `sum by (service) (rate(http_requests_total{job="etip-services",status_code=~"5.."}[5m])) / sum by (service) (rate(http_requests_total{job="etip-services"}[5m])) > 0.05` and total rate > 0.1/s | 10m | warning |
| SlowP95 | `histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket{job="etip-services",route!="/metrics"}[5m]))) > 2` | 10m | warning |
| MemoryHigh (512 MB group) | `process_resident_memory_bytes{job="etip-services",service=~"api-gateway|ingestion|normalization|…"} > 460e6` | 15m | warning |
| MemoryHigh (256 MB group) | same, other services, `> 230e6` | 15m | warning |
| EventLoopLag | `nodejs_eventloop_lag_seconds{job="etip-services"} > 0.5` | 5m | warning |
| Restarting | `changes(process_start_time_seconds{job="etip-services"}[30m]) > 2` | 0m | warning |

Service label values come from each `registerMetrics(app, '<name>')` call — confirm them in Grafana Explore (`group by (service) (up)`) before writing the regexes. The 512/256 MB groups come from `deploy.resources.limits` in `docker-compose.etip.yml`.

Later rules (need exporters or S-8d): queue backlog (`bullmq_waiting > 1000` for 15m), failed jobs growth, disk > 80 % (node-exporter), Postgres connections, Redis `evicted_keys > 0` (redis-exporter — important, see Risks).

## 7. Data model

None. No Prisma change. BullMQ job data gains an **optional** `requestId` field (backward compatible).

## 8. Tests

| Test | Where | Checks |
|---|---|---|
| Provisioning loads | local `make docker-test`, then `docker logs etip_grafana \| grep -i "alerting\|provision"` | no provisioning errors |
| Rules valid | Grafana UI → Alerting → Alert rules (via SSH tunnel) | 8 rules, state Normal |
| Contact points | Grafana → Contact points → "Test" on each | email + Telegram received |
| Fire drill | `docker stop etip_analytics` on the VPS (low-risk service) | ServiceDown alert in ~4 min; resolved after `docker start` |
| request-context unit tests | `packages/shared-utils/src/request-context.test.ts` | ID set in `onRequest` is returned by `getRequestId()` inside async code; `undefined` outside a request; two parallel requests don't mix IDs; `withRequestIdHeaders` adds the header only when an ID exists |
| error-handler test | `apps/api-gateway` tests | error body has `requestId` equal to the incoming `x-request-id` |
| Service client test | first adopting module | outbound fetch mock receives `x-request-id` |
| nginx config | `docker exec etip_nginx nginx -t` | ok |

## 9. Acceptance checks

```bash
# Alerts (owner, on VPS or through vps-cmd.yml)
ls docker/grafana/provisioning/alerting/                        # contact-points.yaml policies.yaml rules.yaml
curl -s -u "$TI_GRAFANA_USER:$TI_GRAFANA_PASSWORD" http://127.0.0.1:3101/api/v1/provisioning/alert-rules | grep -c '"title"'   # 8
curl -s http://127.0.0.1:9190/api/v1/targets | grep -o '"health":"[a-z]*"' | sort | uniq -c   # all "up"
curl -s -o /dev/null -w '%{http_code}\n' https://intelwatch.in/grafana/api/health   # 401/403/404 after lock-down, not 200

# Request ID (from anywhere)
curl -sI https://intelwatch.in/health | grep -i x-request-id                      # header present
RID=$(curl -sI https://intelwatch.in/api/v1/auth/me | awk -F': ' 'tolower($1)=="x-request-id"{print $2}' | tr -d '\r')
curl -s https://intelwatch.in/api/v1/auth/me | grep -o '"requestId":"[^"]*"'   # gateway 401 body (auth.ts line 143). Not /api/v1/iocs: that 401 comes from nginx auth_request, not JSON
# on VPS:
docker exec etip_nginx tail -1 /var/log/nginx/access.log | grep -o 'rid=[a-f0-9]*'
docker logs etip_api --since 5m 2>&1 | grep -c "$RID"                              # ≥ 1

# Unit tests
pnpm --filter @etip/shared-utils test
pnpm --filter @etip/api-gateway test
```

## 10. Rollback

- Alerts: delete `docker/grafana/provisioning/alerting/` and revert the compose env block → Grafana restarts with no rules. No app impact.
- nginx: `git revert`; `docker exec etip_nginx nginx -t` before reload.
- request-context: services ignore it if not registered; revert the shared-utils commit and the one-line registrations. Error-body `requestId` is additive — safe to leave or remove.
- Tag first for the shared-utils session (shared package + 3+ files): `git tag safe-point-2026-xx-xx-step8-request-id`.

## 11. Session breakdown

| Session | Module | Work | Size |
|---|---|---|---|
| S-8a | ops: `docker/grafana`, `etip_grafana` compose block, nginx `/grafana/` | Contact points, policy, 8 rules, SMTP env, remove weak default password, lock `/grafana/`, runbook | M |
| S-8b | ops: `docker/nginx` | `$request_id` in log + response header + missing locations | S |
| S-8c | shared-utils (**owner OK needed**) | `request-context.ts` + tests + export | S |
| S-8d | api-gateway | register context, `requestId` in error body | S |
| as touched | each service | one-line register + client headers + job `requestId` | S each |
| S-8e (optional) | admin-service | BullMQ gauges so `etip-pipeline-queues` dashboard works | S |
| later | ops | OpenTelemetry (below) | M |

Do S-8a first — it gives value with zero code change. S-8b can go in the same week.

## 12. OpenTelemetry (later — not now)

- **When:** after Step 7 (fewer processes) and after request ID works. Request ID + logs cover most debugging for one developer.
- **What:** `@opentelemetry/sdk-node` + auto-instrumentation (http, fastify, ioredis, pg/prisma, bullmq), exporting OTLP to a small **Grafana Tempo** container (Grafana already there, so no new UI). Use the nginx `$request_id` as a span attribute so logs and traces join.
- **Cost:** ~50–100 MB RAM per process for the SDK, plus Tempo storage. Sample 10 % of requests, 100 % of errors.
- **Needs:** a DECISION entry (new libraries, CLAUDE.md "Simplicity Rule"). Justify against: request ID + logs are not enough once agents chain many tool calls across services (Steps 10–13).

## 13. Owner decisions needed

1. Alert channels: email, Telegram, or both? Same bot as Step 1 is fine.
2. `/grafana/` on the public site: lock behind super-admin login, or remove and use an SSH tunnel? Recommend remove + tunnel (fewer moving parts).
3. OK to change shared-utils (S-8c)? It is a new file + export; no existing function changes.
4. Add exporters (node-exporter ~20 MB, redis-exporter ~10 MB) now, or wait for Step 7? Recommend node-exporter + redis-exporter now (disk-full and Redis eviction are real risks).
5. Keep or delete the dashboard panels that have no data (`etip_ai_*`, `etip_articles_ingested_total`, `etip_iocs_extracted_total`)? Recommend: keep, and add the metrics in the owning module sessions (ai-enrichment, ingestion).
6. Fix or remove the admin-service `LPUSH` alert path (§3b)? It should either use `queue.add()` or be removed once Grafana alerts exist.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Alert noise → owner ignores alerts | Start with 8 rules, `for:` windows of 3–15 min, `repeat_interval 4h`; tune after 2 weeks |
| Grafana itself is down → no inside alerts | Step 1's outside UptimeRobot check stays the first line. If `/grafana/` is removed from nginx, Grafana cannot be watched from outside; health-recovery (Step 1) restarts it if it exits. Accept this small gap |
| Public `/grafana/` with a default password | Fixed in S-8a (required password + lock-down). **Check today** whether `TI_GRAFANA_PASSWORD` is set in the VPS `.env` |
| Redis `allkeys-lru` (compose lines 45–47) silently evicts BullMQ jobs and DECISION-027 Redis-JSON config | Separate small ops session: `noeviction` + more memory + redis-exporter alert on `evicted_keys`. Owner decision (shared infra) |
| `AsyncLocalStorage` context lost in some callbacks (e.g. BullMQ worker threads) | Workers read `requestId` from job data, not from context |
| Clients can send their own `X-Request-ID` | nginx overwrites it with `proxy_set_header` on every proxied location; service ports are bound to 127.0.0.1 only |
| Different `service` label values than expected break the memory regexes | Check label values in Explore first (§6 note) |
