# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-26
**Session:** 73
**Session Summary:** Prometheus metrics — prom-client wired to all 23 backend services, prometheus.yml scrape config, deploy.yml orphan cleanup fix. 12 new tests, 5,785 total.

## ✅ Changes Made
| Commit | Files | Description |
|--------|-------|-------------|
| 050eb58 | 29 | feat: Prometheus metrics — prom-client wired to all 23 backend services |

## 📁 Files / Documents Affected

### New Files
| File | Purpose |
|------|---------|
| packages/shared-utils/src/metrics.ts | registerMetrics() — Fastify plugin: prom-client Registry, HTTP counter + histogram, default Node.js metrics, GET /metrics endpoint |
| packages/shared-utils/tests/metrics.test.ts | 12 tests: route registration, rate-limit exempt, Prometheus text format, counter increment, histogram, route-pattern labeling, registry isolation |

### Modified Files
| File | Changes |
|------|---------|
| packages/shared-utils/package.json | +prom-client ^15.1.0 dependency |
| packages/shared-utils/src/index.ts | +export registerMetrics, MetricsCompatibleApp |
| docker/prometheus/prometheus.yml | Replaced: 1 self-scrape → 1 self-scrape + 23 service targets in `etip-services` job |
| .github/workflows/deploy.yml | Orphan cleanup moved before compose up (pre-cleanup) + post-cleanup safety net |
| 23x apps/*/src/app.ts | +import registerMetrics + await registerMetrics(app, 'service-name') after sensible |
| pnpm-lock.yaml | +prom-client resolution |

## 🔧 Decisions & Rationale
- prom-client in shared-utils (not new shared-metrics package) — additive Tier 1 change, avoids 6-step New Package Checklist
- Raw prom-client (not fastify-metrics npm package) — exact control over metric names matching existing Grafana dashboards
- Plain async function (not Fastify plugin with fastify-plugin) — avoids fp() dependency, hooks register on root app scope
- Per-service Registry (not global default) — prevents test pollution between services
- Single `etip-services` Prometheus job (not 23 separate jobs) — cleaner config, `instance` label auto-distinguishes

## 🧪 E2E / Deploy Verification Results
- CI run 23574054284: ✅ SUCCESS (test + deploy jobs)
- 33 containers healthy on VPS
- All 23 services now expose GET /metrics in Prometheus text format
- Prometheus configured to scrape all 23 targets every 15s
- Grafana service-health + api-gateway dashboards populating
- 5,785 tests passing (12 new shared-utils metrics tests)

## ⚠️ Open Items / Next Steps

### Immediate
- BullMQ custom Prometheus counters for pipeline-queues dashboard (session 74)
  - admin-service: bullmq_waiting/active/failed/completed gauges per queue
  - ingestion: etip_articles_ingested_total counter
  - normalization: etip_iocs_extracted_total counter
  - ai-enrichment: etip_ai_tokens_total + etip_ai_cost_usd_total counters
- IOC search pagination on SearchPage
- Production hardening (rate limits, input validation audit)

### Deferred
- Grafana pipeline-queues dashboard panels stay empty until session 74 custom counters
- Pre-existing TS errors in VulnerabilityListPage.tsx
- .wip files: queue-alert-evaluator.ts.wip, admin-queue-alerts.test.tsx.wip

## 🔁 How to Resume
```
/session-start
Working on: BullMQ custom Prometheus counters (session 74). Do not modify: shared-utils metrics.ts (deployed).
```
