# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-23
**Session:** 39
**Session Summary:** Onboarding Service (Module 18) — core + 5 P0 improvements. 8-step wizard, data source connectors, pipeline health, module readiness, progress tracker. 32 endpoints, 190 tests. Deployed to VPS on port 3018.

---

## MANDATORY: Review These Architecture Docs Every Session

| Document | When to Load | Key Content |
|----------|-------------|-------------|
| `docs/architecture/CTI-Pipeline-Architecture-v2.0.html` | Pipeline work | 4-stage pipeline, composite confidence formula, enrichment Stage 2.5, cost model, 3-layer dedup, IOC lifecycle state machine |
| `docs/architecture/ETIP_Architecture_Blueprint_v4.html` | Phase 4+ | 22-module map, living graph with retroactive risk propagation, 3 enrichment patterns, reasoning trail schema, prompt caching, STIX/TAXII |

---

## ✅ Changes Made (Session 39)

| Commit | Files | Description |
|--------|-------|-------------|
| f11b866 | 41 | feat: add Onboarding Service (Module 18) — core + P0 improvements. 22 src files, 14 test files, package.json, tsconfig.json, vitest.config.ts, tsconfig.build.json, pnpm-lock.yaml. |
| 1695a52 | ~5 | feat: add onboarding-service to deploy pipeline (Module 18) — Dockerfile COPY, docker-compose, deploy.yml, nginx routing. (Done in separate session) |

## 📁 Files Created

| File | Purpose |
|------|---------|
| `apps/onboarding/package.json` | Package definition, deps: fastify, zod, pino, shared-* |
| `apps/onboarding/tsconfig.json` | TS config with composite:true + references |
| `apps/onboarding/vitest.config.ts` | Test config with vitest alias resolution |
| `apps/onboarding/src/config.ts` | Zod-validated env config (port 3018) |
| `apps/onboarding/src/logger.ts` | Pino logger with redaction |
| `apps/onboarding/src/app.ts` | Fastify app builder with 6 route groups |
| `apps/onboarding/src/index.ts` | Entry point, DI wiring, graceful shutdown |
| `apps/onboarding/src/plugins/error-handler.ts` | AppError + ZodError handler |
| `apps/onboarding/src/schemas/onboarding.ts` | All Zod schemas + response types (252 lines) |
| `apps/onboarding/src/services/wizard-store.ts` | In-memory wizard state (8 steps, completion %) |
| `apps/onboarding/src/services/connector-validator.ts` | 8 data source types, URL/key validation |
| `apps/onboarding/src/services/health-checker.ts` | 6-stage pipeline health monitor |
| `apps/onboarding/src/services/module-readiness.ts` | 14-module dependency checker |
| `apps/onboarding/src/services/progress-tracker.ts` | 8 readiness checks, scoring |
| `apps/onboarding/src/services/prerequisite-validator.ts` | P0 #6: transitive dep chain validation |
| `apps/onboarding/src/services/demo-seeder.ts` | P0 #7: seed 150 IOCs + actors + malware + CVEs |
| `apps/onboarding/src/services/integration-tester.ts` | P0 #8: DNS→TCP→auth→data pull test steps |
| `apps/onboarding/src/services/checklist-persistence.ts` | P0 #9: versioned snapshots (max 10) |
| `apps/onboarding/src/services/welcome-dashboard.ts` | P0 #10: quick actions, 6 tips, tour tracking |
| `apps/onboarding/src/routes/wizard.ts` | 7 endpoints (get/org/team/complete/skip/prefs/reset) |
| `apps/onboarding/src/routes/connectors.ts` | 8 endpoints (types/list/add/validate/test/integration-test) |
| `apps/onboarding/src/routes/pipeline.ts` | 3 endpoints (health/stages/readiness) |
| `apps/onboarding/src/routes/modules.ts` | 6 endpoints (list/get/enable/disable/prereqs/deps) |
| `apps/onboarding/src/routes/welcome.ts` | 8 endpoints (dashboard/tips/seed/demo-status/tour/save) |
| `apps/onboarding/src/routes/health.ts` | 2 endpoints (/health, /ready) |
| `apps/onboarding/tests/*.test.ts` | 14 test files, 190 tests total |

## 📁 Files Modified

| File | Change |
|------|--------|
| `tsconfig.build.json` | Added `apps/onboarding` reference |
| `pnpm-lock.yaml` | Updated with onboarding workspace member |

---

## 🔧 Decisions & Rationale

No new architectural decisions. Followed existing patterns:
- DECISION-012: Fastify plugin pattern (same as all services)
- DECISION-013: In-memory store (same as Phase 4-5 services)
- safeParse + AppError pattern for Zod validation in routes (improvement over .parse() which doesn't propagate correctly through Fastify error handler)

---

## 🧪 Deploy Verification

```
CI Run #23443496070 — ALL GREEN
✅ Test, Type-check, Lint & Audit
✅ Deploy to VPS

First CI run (f11b866) failed Docker build — Dockerfile missing COPY for apps/onboarding/.
Fixed in commit 1695a52 (separate session) — added Dockerfile COPY + docker-compose + nginx.
Second CI run green, deployed successfully.

Monorepo tests: 3882 passing (26 packages)
Onboarding tests: 190 passing (14 test files)
```

---

## ⚠️ Open Items / Next Steps

### Immediate — Phase 6 Continued
- Billing Service (Module 19) — Razorpay integration, usage metering, plan management (user chose Razorpay over Stripe)
- Admin Ops (Module 22) — system health, maintenance mode, backup/restore

### Short-term
- Elasticsearch IOC indexing
- Mobile responsive testing at 375px/768px for Phase 4+5 pages
- Update QA_CHECKLIST.md
- Update docs/ETIP_Project_Stats.html

### Deferred
- In-memory services → Redis/PostgreSQL migration for scaling
- CertStream production WebSocket (currently simulated)
- D3 bundle code-splitting (190KB impact)
- Git history purge for exposed secrets
- WebAuthn/Passkeys (Phase 6 P1)
- OAuth app management (Phase 6 P2)

---

## 🔁 How to Resume

### Session 40: Billing Service (Module 19)
```
/session-start

Scope: Phase 6 — Billing Service (Module 19)
Do not modify: shared-*, api-gateway, all Phase 1-5 backend services, all frontend pages, apps/onboarding/.

## Context
Session 39-40: Onboarding Service (Module 18) COMPLETE + deployed. Port 3018, 32 endpoints, 190 tests.
CI green. VPS healthy. Phase 6: 1/3 modules done.
Phases 1-5 COMPLETE. 26/27 modules built. 3882 tests.

## Task: Billing Service (Module 19) — Core + P0

### Service Definition
- Port: 3019
- Purpose: Usage metering, Razorpay billing, plan management, free-to-paid conversion
- Pattern: In-memory store (DECISION-013), Fastify plugin (DECISION-012)

### Core Features (5)
1. Plan Management — Free/Starter/Pro/Enterprise tiers with feature limits
2. Usage Metering — Track API calls, IOCs ingested, enrichments, storage per tenant
3. Razorpay Integration — Customer creation, subscription lifecycle, webhook verification
4. Invoice & Billing History — Monthly invoices, payment status, GST support
5. Upgrade/Downgrade Flow — Plan change with proration, feature gate enforcement

### P0 Improvements (5)
6. Contextual upgrade prompts — trigger when hitting plan limits
7. Usage alerts — warn at 80%/90%/100% of plan limits
8. Grace period — allow brief overage before hard cutoff
9. Billing dashboard API — revenue, MRR, churn metrics for admin
10. Coupon/discount codes — promotional pricing support
```

### Module Map (26 modules)

| Phase | Modules | Status |
|-------|---------|--------|
| 1 | api-gateway, shared-*, user-service, frontend | ✅ Deployed |
| 2 | ingestion, normalization, ai-enrichment | ✅ Deployed |
| 3 | ioc-intel, threat-actor, malware, vulnerability | ✅ Deployed |
| 4 | threat-graph, correlation, hunting, drp | ✅ Deployed |
| 5 | enterprise-integration, user-management, customization | ✅ Deployed |
| 6 | onboarding | ✅ Deployed |
| 6 | billing, admin-ops | 📋 Not started |

### Phase Roadmap

- Phases 1-5: ✅ COMPLETE (backend + frontend)
- Phase 6: SaaS features — onboarding ✅, billing next, admin-ops last
