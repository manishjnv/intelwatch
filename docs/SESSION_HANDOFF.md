# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-28
**Session:** 171
**Session Summary:** Owner direction: "no quick fixes — permanent, robust, enterprise-grade; follow recommendations/best practice." Four PRs merged and deployed. **#53 is the headline: the permanent Threat Graph data fix (RCA #52).** The graph pipeline had never produced a usable graph — node label = raw IOC type, 0 relationships, `/graph/stats` always 500 — and is now a real STIX-aligned pipeline hydrated from ioc-intelligence via service JWT, kept in sync through events plus periodic reconciliation. Production Neo4j now holds 12,171 IOC/Vulnerability nodes (exactly matching Postgres) and 26,804 relationships (was 0). **#52** built the read-only service-to-service access in ioc-intelligence that #53 depends on. **#51** cleaned up 10 empty scaffold folders (Step 6 PR 1). **#54** removed decommissioned `ti.intelwatch.in` config and, while sweeping third-party config, found and fixed the real root cause of the sign-up CAPTCHA error that RCA #50 hadn't fully closed — the Cloudflare Turnstile widget was still bound to the old hostname (RCA #53). Four DECISIONS recorded (044–047) resolving the threat-graph architecture question plus three owner-requested product decisions (AI enrichment provider path, vuln scanner import approach, Step 15 Phase 2 architecture).

## ✅ Changes Made

| Commit(s) | Description |
|---|---|
| `27c5ae2` → merge `4874864` | PR #51: Step 6 PR 1 cleanup — 10 empty scaffold folders + `scaffold.js`/`init-modules.js` removed, Folder column added to PROJECT_STATE. |
| `f0fd669` → merge `a451d4c` | PR #52: ioc-intelligence read-only service-to-service access (service JWT, `GET /ioc`/`/:id` user-or-service, service-only `GET /ioc/internal/tenants`). |
| `1ad0a6b` + `125677f` → merge `feacbae` | PR #53: permanent Threat Graph data fix (RCA #52) — real IOC hydration, STIX-aligned mapping, batched sync, 15-min/daily reconciliation, versioned migrations, Cypher allowlist guards. Deployed via manual `workflow_dispatch` (push event didn't fire). |
| → merge `04ea04d` | PR #54: removed `ti.intelwatch.in` config repo-wide; fixed Turnstile widget hostnames (RCA #53, out-of-repo). |

All 4 PRs merged to master and deployed; VPS HEAD `04ea04d`, 32/32 `etip_` containers healthy. Full detail: `docs/S171_SESSION_SUMMARY.md` (links each per-PR doc).

## 📁 Files / Documents Affected

**New files (code):** `apps/threat-graph/src/clients/ioc-client.ts`, `services/ioc-graph-mapper.ts`, `services/graph-sync.ts`, `services/graph-reconciler.ts`, `services/ioc-sync-service.ts`, `migrations/001_relabel_legacy_nodes.ts` + `002_add_constraints.ts` (paths approximate — see PR diff), `apps/ioc-intelligence/src/repository-aggregates.ts`, `apps/ioc-intelligence/tests/service-auth.test.ts` + `tests/repository-list-order.test.ts`, `apps/threat-graph/tests/` additions (91 new tests total).

**New files (docs):** `docs/S171_SESSION_SUMMARY.md`, `docs/S171_STEP6_CLEANUP.md`, `docs/S171_IOC_SERVICE_AUTH.md`, `docs/S171_GRAPH_FIXES.md`, `docs/S171_REMOVE_TI_DOMAIN.md`.

**Modified (code):** `apps/threat-graph/src/{cypher-safety.ts, schemas/graph.ts, repository.ts, repository-extended.ts, routes/graph-extended.ts}`, `apps/ioc-intelligence/src/{plugins/auth.ts, routes/iocs.ts, schemas/ioc.ts, repository.ts}`, `docker/nginx/conf.d/default.conf`, `docker-compose.etip.yml` (new env vars on `etip_ioc_intelligence` and `etip_threat_graph`), `infrastructure/nginx/` (deleted `ti.intelwatch.in`), `infrastructure/scripts/vps-setup.sh`, `Makefile`, 3 scripts, `CLAUDE.md`.

**Modified (docs, this pass):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md` (this file), `docs/DECISIONS_LOG.md` (DECISION-044…047), `docs/DEPLOYMENT_RCA.md` (Issue 53 + 4 deploy-summary rows), `docs/ETIP_Project_Stats.html`, `docs/modules/ioc-intelligence.md`, `README.md`.

## 🔧 Decisions & Rationale

- **DECISION-044:** Threat graph is a derived store reconciled from the IOC source of truth (service-JWT hydration, no cross-module DB reads, STIX 2.1 model, event + periodic reconciliation).
- **DECISION-045:** AI enrichment runs via a host-side Claude Code runner on the VPS pre-revenue; switches to a live Anthropic API key once there are paying customers (config switch).
- **DECISION-046:** Vulnerability scanner support starts with report-file import (Nessus/Qualys/OpenVAS/CSV), not live scanner API integration.
- **DECISION-047:** Step 15 Phase 2's 7 open architecture decisions accepted per the roadmap doc's own recommendation — new `exposure-service`, org profile in customization, asset/vuln data in drp-service, sightings + rule→technique mapping in integration-service, `/exposure` route.

Note: the owner-ordered next-work queue below is the owner's explicit ordering — do not resequence without asking.

## 🧪 E2E / Deploy Verification Results

```
PR #51 → 4874864 : no code change, tsc/tests unaffected, verified no references to removed folders before deletion.

PR #52 → a451d4c : CI green. VPS: internal call from threat-graph → 200 (2 tenants, 6,090 + 6,081 IOCs);
                    public internal path (curl from outside) → 404. 172 ioc-intelligence tests.

PR #53 → feacbae : deployed via manual workflow_dispatch run 36394473063 (push event didn't fire on this merge).
  docker logs etip_threat_graph: "Graph migration applied" (001, 002) once each; first reconcile both
  tenants ok=2 failed=0 (~50s each); 0 "Unhandled error" lines.
  Neo4j counts: IOC 7,599 + Vulnerability 4,572 = 12,171 (= Postgres exactly).
  ThreatActor 76, Malware 20, AttackPattern 409.
  Relationships: 26,804 total (INDICATES 21,498, USES 5,088, EXPLOITS 218) — was 0.
  399 threat-graph tests (was 308).

PR #54 → 04ea04d : grep -rn "ti\.intelwatch\.in" . (excl. node_modules) → no matches.
  Out-of-repo: Turnstile widget hostnames → intelwatch.in. Owner confirmed /register completes.

Real test total (Step 0, pnpm -r --no-bail test): 9,145 passed + 2 skipped (9,147), was 9,030 + 2.
Sensitive-content grep before commit: clean (no secrets/PII/unfixed-vuln details).
tsc / eslint: 0 errors (touched packages).
```

## ⚠️ Open Items / Next Steps

**Owner-ordered queue (one item per session):**
1. **Self-service sign-up does not complete end to end** — the verification email is not delivered and the verify/resend endpoints are not wired (api-gateway routes + `EMAIL_SEND` worker in admin-service via Resend; `intelwatch.in` is already verified in Resend). Fix with adversarial review, then a live sign-up test.
2. Graph visual redesign (ui-design-workflow skill) now that the Threat Graph shows real data (12,171 nodes, 26,804 relationships).
3. AI enrichment per DECISION-045 — build the host-side runner, wire the `AiProcessingCost` ledger, add the super-admin usage view, add the golden-set evaluation gate.
4. Owner-scheduled security fix (details in the owner's private notes) — must land before plan-tier gating.
5. Vulnerability scanner import + tiers + channels per DECISION-046; Step 15 Phase 2 MVP per DECISION-047 (architecture now settled).
6. Real tenant Clients list — replace admin-service's in-memory TenantStore (DECISION-013).
7. Step 3 — persistence (`docs/roadmap/STEP_03_PERSISTENCE.md`, ~12 sessions) — owner decisions D1–D7 needed first.
8. Step 4 — least-privilege DB + real RLS (`STEP_04_DB_ROLE_RLS.md`, after Step 3) — owner decisions E1–E7, touches shared-auth.
9. Step 6 remainder — DECISION-032 proposal/gate + as-touched >400-line file splits (38 files over limit).

**Carried forward (still open, unchanged since the prior handoff):**
- 7 Step 15 Phase 2 architecture decisions are now resolved (DECISION-047) — remove this line once P2 MVP work starts.
- `TI_AI_ENABLED` is `true` in prod `.env` with an empty Anthropic key — DECISION-045 gives the path forward (host-side runner first).
- Real user & tenant provisioning: team invite is in-memory, SCIM routes unreachable via nginx, SSO JIT callback unwired, no Prisma-backed role-change route, Command Center "Add Client" invite in-memory.
- RCA #49 error-handler sweep — only integration-service has been checked for the 4xx→500 masking bug class; other services not yet swept.
- Route-permission coverage test (RCA Issue 48 prevention item) — not yet built.
- Correlation "Create ticket" (`use-phase4-data.ts` `useCreateTicket`) sends no `integrationId`, which `POST /integrations/tickets` requires — needs a ticketing-integration picker in the UI.
- S161b PR 2–4 (alerting/reporting, phase4, remaining phase5/6 hooks) — still pending.
- S163 backend gaps (billing/admin path+shape mismatches, DECISION-036) still open.
- `useNodeNeighbors` still maps any error (not just 404) to "no neighbours" (pre-existing, minor; `apps/frontend/src/hooks/use-phase4-data.ts`).

**Deferred with reason (not forgotten, just not now):**
- Flaky under full-suite load (pass alone and on re-run): user-service `access-review-service.test.ts > scanStaleSuperAdmins` and shared-persistence `scheduleCheckpoint > debounces multiple calls`. `pnpm -r test` bails on the first failing package — use `pnpm -r --no-bail test` for a real total.
- Ops hardening beyond what's already shipped (backups, DR, monitoring polish) — no paying customers yet, functional work takes priority.

## 🔁 How to Resume

```
/session-start → Session 172. One folder (E:\code\IntelWatch), branch per task, one PR merged + deployed at a time (DECISION-034).
Use Sonnet/Haiku as much as possible (Opus for plan/review/security judgment only).

FIRST — owner-ordered queue item 1: self-service sign-up does not complete end to end. The verification email
is never delivered and the verify/resend endpoints aren't wired. Scope: api-gateway routes (verify/resend) +
the EMAIL_SEND worker in admin-service via Resend — intelwatch.in is already verified in Resend, so this is
wiring, not a new provider setup. Build with adversarial review (auth/email path — codex:rescue gate before
push per the project's hard rules), then do a live sign-up test as the owner would (real email, real click).

Queue after that (owner-ordered, one per session): (2) graph visual redesign (load the ui-design-workflow skill
first — real data now exists, 12,171 nodes / 26,804 relationships in prod); (3) AI enrichment per DECISION-045
(host-side Claude Code runner, AiProcessingCost ledger wiring, super-admin usage view, golden-set gate);
(4) owner-scheduled security fix — details in the owner's private notes, must land before plan-tier gating;
(5) vulnerability scanner import per DECISION-046 + Step 15 Phase 2 MVP per DECISION-047 (architecture is now
settled — new exposure-service, org profile in customization, asset/vuln data in drp-service, sightings +
rule→technique mapping in integration-service, /exposure route); (6) real tenant Clients list, replacing
admin-service's in-memory TenantStore (DECISION-013); (7) Step 3 persistence (~12 sessions, needs owner
decisions D1-D7 first); (8) Step 4 least-privilege DB + real RLS (~13 sessions, needs owner decisions E1-E7,
touches shared-auth, security review before push); (9) Step 6 remainder — DECISION-032 gate + >400-line file
splits (38 files over limit).

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway included) — additive
only, list every consumer before any change; intelwatch.in and ti-platform-* containers — never touch; frontend
is UI-FROZEN (design system locked, data-wiring changes only, no visual redesign without the ui-design-workflow
skill — this is why queue item 2 above explicitly calls it out).

Module → skill map: any new/modified ETIP microservice under /apps/ → etip-service-pattern skill; any test file →
etip-testing skill; before any push → pre-push skill (mandatory, runs make pre-push equivalent checks); before
proposing an architectural alternative → check docs/DECISIONS_LOG.md first (lazy-load, don't read by default);
current-step roadmap spec → read the specific STEP_NN_*.md file for whichever queue item is active, not the whole
roadmap folder.

Owner does a browser check after each deploy — CI/unit tests with correct shapes still aren't a substitute for a
live click-through (this is exactly how RCA #49, #50, and #53 were all eventually caught — the domain-move sweep
in this session is what finally found #53, months after #50's CI-side fix).

Ops note: GitHub occasionally drops the push event on a merge (happened for PR #53 this session) — check
`gh run list --workflow deploy.yml --limit 1` after merging; if nothing appears, `gh workflow run deploy.yml --ref master`.
```
