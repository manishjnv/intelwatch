# SESSION HANDOFF DOCUMENT
**Date:** 2026-03-24
**Session:** 49
**Session Summary:** Demo fallbacks + client-side sort/filter for Actor/Malware/Vuln pages. ES service wired into docker-compose/nginx but removed from active deploy (Elasticsearch container not on VPS yet). Next: provision Elasticsearch on VPS.

---

## ✅ Changes Made

| Commit | Files | Description |
|--------|-------|-------------|
| 2ef750f | 2 | Demo fallbacks for actor/malware/vuln — DEMO_ACTORS_RESPONSE (6 APTs), DEMO_MALWARE_RESPONSE (6 families), DEMO_VULNS_RESPONSE (6 CVEs) in demo-data.ts; useActors/useMalware/useVulnerabilities wired to withDemoFallback |
| fffc66f | 3 | Wire ES service into deploy pipeline — docker-compose.etip.yml (service block, depends_on redis+elasticsearch), deploy.yml (build+recreate+health steps), nginx (upstream + /api/v1/search location) |
| ca11e86 | 3 | Client-side sort/filter for actor/malware/vuln pages in demo mode — useMemo rows matching IocListPage/FeedListPage pattern (ThreatActorListPage, MalwareListPage, VulnerabilityListPage) |
| 9b355bc | 2 | Remove etip_es_indexing from active deploy.yml build+up — Elasticsearch container not provisioned on VPS, health check blocks nginx and entire deploy |

---

## 📁 Files / Documents Affected

**Modified files:**
| File | Change |
|------|--------|
| apps/frontend/src/hooks/demo-data.ts | +170 lines: 3 demo response objects |
| apps/frontend/src/hooks/use-intel-data.ts | withDemoFallback for actors/malware/vulns |
| docker-compose.etip.yml | ES service block added (port 3020) |
| .github/workflows/deploy.yml | ES build+recreate steps added then removed (9b355bc) |
| docker/nginx/conf.d/default.conf | ES upstream + /api/v1/search location added |
| apps/frontend/src/pages/ThreatActorListPage.tsx | Client-side useMemo sort/filter in demo mode |
| apps/frontend/src/pages/MalwareListPage.tsx | Client-side useMemo sort/filter in demo mode |
| apps/frontend/src/pages/VulnerabilityListPage.tsx | Client-side useMemo sort/filter in demo mode |

---

## 🔧 Decisions & Rationale

No new architectural decisions. DECISION-025 (React.lazy D3) still stands.

**Key judgment call:** ES service removed from deploy.yml because VPS doesn't have Elasticsearch container. The wiring is complete in docker-compose and nginx — only deploy.yml needs re-adding after Elasticsearch is provisioned. The nginx conf and docker-compose service block are committed and ready.

---

## 🧪 E2E / Deploy Verification Results

```
VPS health check (before session 49 work began):
curl -sf https://ti.intelwatch.in/health
→ {"status":"ok","service":"api-gateway","version":"1.0.0"} ✅

CI runs (session 48 fixes): both SUCCESS ✅
CI state after session 49 commits: green (etip_es_indexing excluded from build) ✅
```

---

## ⚠️ Open Items / Next Steps

**Immediate (Session 50):**
Provision Elasticsearch on VPS and activate ES service deploy:
1. Add `etip_elasticsearch` service to docker-compose.etip.yml (image: elasticsearch:8.x, single-node, port 9200)
2. Re-add `etip_es_indexing` to deploy.yml build+recreate+health steps
3. Push and verify health check passes: `curl http://localhost:3020/health`
4. Verify ES cluster health: `curl http://localhost:9200/_cluster/health`

**Deferred:**
- Reporting service (Module 21, port 3021) — Phase 7 item 2, after ES is live
- VITE_DEMO_MODE env var gating — before production users
- Razorpay real keys in VPS .env — before billing goes live

---

## 🔁 How to Resume

```
/session-start

Working on: Provision Elasticsearch on VPS and activate ES indexing service (Module 20, port 3020).
Scope: docker-compose.etip.yml, .github/workflows/deploy.yml ONLY.
Do NOT modify app source code or nginx — those are already wired.

Context:
- docker-compose.etip.yml already has etip_es_indexing service block (port 3020)
- nginx already has /api/v1/search upstream + location block
- deploy.yml had ES steps but they were removed in 9b355bc because Elasticsearch not on VPS
- Task: add etip_elasticsearch container to docker-compose, then re-add etip_es_indexing to deploy.yml

Reference: docs/modules/elasticsearch-indexing.md
```

**Module map:**
- Phase 7 active: elasticsearch-indexing-service (🔨 WIP, port 3020) — scaffolded + wired, blocked on ES container
- All Phase 1–6 modules: ✅ deployed and FROZEN

**Phase roadmap:**
- Phase 7: Elasticsearch container → activate ES indexing deploy → Module 21 (Reporting, port 3021)
