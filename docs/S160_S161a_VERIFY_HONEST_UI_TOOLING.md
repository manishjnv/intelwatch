# S160–S161a PR A — Step 2 Verification, Honest UI Core, Local Tooling Fixes

**Date:** 2026-09-26 · **Sessions:** S160, S161a (PR A) · **Session counter:** 161
**PR:** #44 → `baaf147` (merged, deployed, 32/32 containers healthy)

This doc covers the day's second half: read-only verification that Roadmap Step 2 ("search works")
is actually correct in production, the Step 5 Honest UI core PR, and same-day local tooling fixes.
Structure follows `docs/S151_S159_STEP2_SEARCH_AND_TOOLING.md` (Step 2 build); cross-link
`docs/S161a_HONEST_UI_CORE.md` (file-level detail for PR A — not duplicated here).

---

## 1. Summary

S151–S159 built the search-index pipeline and enqueued a 12,093-row production backfill but could
not confirm it landed correctly (queue was still draining). S160 closes that loop: read-only checks
over the Cloudflare tunnel confirm Elasticsearch doc counts equal Postgres row counts, per tenant,
after the drain finished. Step 2 is now DONE. S161a PR A then shipped the first slice of Step 5
("Honest UI") — see `docs/S161a_HONEST_UI_CORE.md` for the file table. Same day, two local tooling
issues (Codex CLI, Node version) were diagnosed and fixed.

## 2. S160 — Step 2 verification

**Method:** read-only, via the Cloudflare Tunnel (`ssh.intelwatch.in`), no writes. A local polling
script looped short SSH calls every 120 seconds, checking the BullMQ wait queue, and stopped once
`wait ≤ 5`, then printed a final DB-vs-ES comparison per tenant. Verbatim script:

```bash
#!/usr/bin/env bash
# Read-only: poll etip-ioc-indexed wait queue until drained, then per-tenant DB vs ES counts.
r() { ssh -o ProxyCommand="cloudflared access ssh --hostname ssh.intelwatch.in" -o ServerAliveInterval=30 -o ConnectTimeout=30 root@ssh.intelwatch.in "cd /opt/intelwatch && set -a && . ./.env >/dev/null 2>&1 && set +a && $1"; }
Q='for k in wait active; do printf "%s=" $k; docker exec etip_redis redis-cli -a "$TI_REDIS_PASSWORD" --no-auth-warning LLEN bull:etip-ioc-indexed:$k; done'
for i in $(seq 1 40); do
  out=$(r "$Q" 2>/dev/null | tr -d '\r' | tr '\n' ' ')
  echo "$(date -u +%H:%M:%S) $out"
  w=$(echo "$out" | sed -n 's/.*wait=\([0-9]*\).*/\1/p')
  [ -n "$w" ] && [ "$w" -le 5 ] && break
  sleep 120
done
read -r -d '' FINAL <<'EOF'
echo "--- DB vs ES per tenant"
docker exec etip_postgres psql -U "${TI_POSTGRES_USER:-etip_user}" -d "${TI_POSTGRES_DB:-etip}" -At -F' ' -c "SELECT tenant_id, count(*) FROM iocs GROUP BY 1 ORDER BY 2 DESC;" | while read t c; do
  e=$(docker exec etip_elasticsearch curl -s -u "elastic:$TI_ELASTICSEARCH_PASSWORD" "localhost:9200/etip_${t}_iocs_*/_count?ignore_unavailable=true" | grep -o '"count":[0-9]*' | cut -d: -f2)
  echo "$t db=$c es=${e:-0}"
done
echo "--- ES indices"
docker exec etip_elasticsearch curl -s -u "elastic:$TI_ELASTICSEARCH_PASSWORD" "localhost:9200/_cat/indices/etip_*_iocs*?h=index,docs.count&s=index"
echo "--- failed"
docker exec etip_redis redis-cli -a "$TI_REDIS_PASSWORD" --no-auth-warning ZCARD bull:etip-ioc-indexed:failed
echo "--- indexer errors 60m"
docker logs etip_es_indexing --since 60m 2>&1 | grep -ci "IOC index job failed"
EOF
r "$FINAL" 2>&1 | tr -d '\r'
```

No secrets appear in the script — credentials come from the VPS's own `.env` via `set -a`.

**Redis key types (BullMQ v5, `etip-ioc-indexed` queue):** `wait` and `active` are LISTs, read with
`LLEN`; `failed` and `completed` are ZSETs, read with `ZCARD`; individual job records are hashes.
Mixing these up (e.g. `ZCARD` on `wait`) silently returns 0 instead of erroring.

**Drain timeline (UTC):** 12:40 wait=1,284 → 12:45 wait=969 → 12:55 wait=244 → 12:59 wait=4
(≈80 jobs/min in the final stretch). `active` held steady at 5 throughout — a small worker pool, not
a stall.

**Results — DB vs ES, per tenant:**

| Tenant | Name | Postgres `iocs` | ES `etip_<t>_iocs_*` |
|---|---|---|---|
| `e4e11c4c…` | IntelWatch HQ | 6,051 | 6,051 |
| `10c895c3…` | home pvt ltd | 6,042 | 6,042 |
| (other 8 tenants) | — | 0 | 0 |

**Per-index breakdown:**
- `10c895c3…`: cve 2,276 · domain 1,420 · email 191 · hash 1,134 · ip 1,021
- `e4e11c4c…`: cve 2,274 · domain 1,425 · email 204 · hash 1,134 · ip 1,014
- Base `etip_<t>_iocs` indices (no type suffix): 0 docs each — all documents landed in the
  type-specific indices as designed.

**Failed jobs:** `bull:etip-ioc-indexed:failed` ZSET held 6,118 entries, unchanged before and after
the drain — this is the pre-existing S154 legacy baseline (jobId collisions predating the versioned-
jobId fix), not new failures. Safe to purge once the owner confirms (not done this session).

**7 transient errors:** the indexer logged `Failed to update document <id>` for 7 `ioc-update` jobs
between 12:51 and 12:58 UTC. The failed-count ZSET didn't grow, meaning BullMQ's retry succeeded on
each. Likely cause: an enrichment `update` job racing the backfill's `index` job for the same
document. Tracked under the existing indexer-speed debt item (§5 of the prior doc), not a new bug.

**Arithmetic-slip note:** an earlier LLM-summarised pass reported 6,537 for tenant `10c895c3…`; the
actual per-index sum at that moment was 5,537 — a simple addition error, not a data problem. The
scripted count taken after the drain finished (above) is authoritative. Lesson: script the
arithmetic, don't have a model sum it by eye.

**⌘K UI check (owner, 2026-09-26):** owner primary account (lands in tenant IntelWatch HQ) searched
`3.0.21.0` and it appeared listed under "Indicators of Compromise"; owner second account (lands in
tenant home pvt ltd) searched `3.5.17.10` and it appeared the same way. The top bar showed each
tenant's own count (6,051 / 6,042 respectively) — no cross-tenant leakage. **Step 2 is fully DONE.**

**How login resolves which tenant an account lands in, when the same login exists in more than one
tenant:** `apps/user-service/src/service.ts` `login()` (~lines 98–127) loads every matching row via
`findLoginCandidatesByEmail` (`apps/user-service/src/repository.ts:68`, `orderBy createdAt asc`) and
returns the first one whose password matches. Both owner accounts exist in two tenants each, so the
older tenant wins. Search itself is tenant-scoped from the JWT (not from the login choice), so any
⌘K test needs an account whose landing tenant actually holds IOCs.

## 3. S161a PR A — Step 5 Honest UI core

Frontend-only PR shipping a shared `QueryStateView` loading/error/empty/data pattern, a fix for the
MFA enforcement toggle (its API paths were 404'ing in production), removal of demo-data fallbacks on
MFA/sessions/feature-limits/tenant-usage, `FeatureGate` locking only on an explicit `enabled:false`
(DECISION-035), and a pricing fix (W17). Full file table and rationale: `docs/S161a_HONEST_UI_CORE.md`.

- **PR:** #44 · **Commits:** `e2cc697` (feat), `4a91c0d` (comment wording), `7ff635b`
  (docs: DECISION-035) · **Merge:** `baaf147`.
- **Review gates:** Sonnet builder (TDD) → Opus diff review → adversarial review (Sonnet, standing in
  for Codex, which was unhealthy on this machine at the time) → accept → `etip-reviewer` subagent →
  PASS (123 test files, 1,856 passing, 2 skipped) → CI green in 6m18s.
- **Deploy:** run `36244794791` — test/typecheck/lint 6m20s, build & push 2m03s, deploy 2m55s. VPS
  landed on `baaf147`, 32/32 `etip_*` containers healthy (counted directly on the VPS; an earlier
  automated sweep had reported 25 — that count was wrong, not the deploy).

**Post-deploy checks:**
- `GET /api/v1/auth/settings/mfa/enforcement` → 401, `GET /api/v1/auth/admin/mfa/enforcement` → 401
  (both routes now exist; auth required is expected).
- `GET /api/v1/settings/mfa/enforcement` (old path) → 404 — confirms the bug that was fixed.
- `/`, `/iocs`, `/login`, `/health` → 200.
- Built bundle: 0 hits for the old fake MFA demo secret; new MFA route path present; new empty-state
  copy present.
- Frontend container logs: 0 errors.

## 4. Local tooling fixes (owner machine, same day)

- **Codex CLI 0.125.0 → 0.157.1** (`npm i -g @openai/codex@latest`). Root cause: the old CLI failed
  to decode the server's model list (an `unknown variant 'max'` reasoning level) and silently fell
  back to `gpt-5.5`, which 404'd; separately, a ChatGPT-authenticated Codex session rejects older
  model ids outright (`gpt-5.4`, `gpt-5.3-codex` → 400 "not supported when using Codex with a ChatGPT
  account"). After upgrading, `codex exec "Reply with exactly: OK"` returned `OK`. The stale Claude
  Code codex-plugin broker and `codex app-server` processes were stopped (they respawn on next use,
  no persistent fix needed). No model pin was added to `~/.codex/config.toml` — a pinned model would
  itself go stale as the account's supported list changes.
- **Node 20.11.1 → 20.20.2** via `winget upgrade --id OpenJS.NodeJS.20` (required a UAC prompt).
  Matches CI's `NODE_VERSION: '20'`. Root cause: frontend Vitest failed to start with
  `ERR_REQUIRE_ESM` — `jsdom`'s `html-encoding-sniffer` dependency needs `require(esm)`, which
  requires Node ≥ 20.19. Verified with `pnpm exec vitest run src/__tests__/query-state-view.test.tsx`
  → 7/7 passing. Staying on the Node 20 line deliberately — not jumping to 22 or 24, to match CI.
- `make` and Docker are not installed on this machine; `make pre-push` ran as its constituent parts
  (frontend `tsc`/eslint/vite build/tests) and the Docker build stage is covered by CI instead.

## 5. Observations (not fixed this session)

- Dashboard "IOC Trend (7d)" shows 0 total, and "Threat Score" reads "No scored IOCs yet", even
  though the active tenant holds 6,051 IOCs — likely a widget wiring gap, not a data gap (S160
  confirmed the data is there and searchable). Check when S161b touches dashboard widgets.
- ⌘K result rows show only the IOC value, with no type or severity chip — minor UX gap, not a
  blocker.
- Both owner accounts exist in two tenants each — login works (oldest matching-password tenant
  wins, see §2) but the duplication is confusing. Tidy up later, not urgent.
- `MfaEnforcement` frontend type declares fields the server doesn't send (optional, guarded, no
  crash) — tracked in `docs/S161a_HONEST_UI_CORE.md`.

## 6. Decisions

- **DECISION-035** — see `docs/DECISIONS_LOG.md`: `FeatureGate` locks a route only on an explicit
  `enabled:false` from `/billing/limits`; a fetch error or missing entry lets the page load.
- Owner chose the overall session order: finish Step 5 → one small security-reviewed session
  (owner's private notes) before Step 3 → then Step 3.

## 7. Next

S161a PR B (see `docs/SESSION_HANDOFF.md` "How to Resume" for the exact hook/screen list), then
S161b, then S162–S166, then the small security-reviewed session, then Step 3.

## 8. Rollback

- **PR A:** revert PR #44, or `git reset --hard safe-point-2026-09-26-s161a` (pre-merge only — the
  tag predates the merge commit).
- **Tooling (not recommended, but available):** `npm i -g @openai/codex@0.125.0` to roll back Codex;
  `winget install --id OpenJS.NodeJS.20 --version 20.11.1` to roll back Node — neither is recommended
  since both fixes resolve real local breakage.

## 9. Routing telemetry

Agent-utilization block, copied from `docs/SESSION_HANDOFF.md` (codex:rescue line adjusted — see
below):

- Opus: plan, seam reads (FeatureGate/limits/MFA routes), diff review, security judgment
  (DECISION-035), test-leak fix, commits/PR/merge/deploy
- Sonnet: context digest, hook map, PR A implementation (TDD), adversarial review (codex fallback),
  docs
- Haiku: 2 VPS verification sweeps (Step 2 counts, post-deploy)
- codex:rescue: n/a — CLI 0.125.0 outdated (fixed same day → 0.157.1); Sonnet takeover, verdict=accept

Routing telemetry:
- sonnet · context digest · reworked: N
- sonnet · frontend hook seam map · reworked: N
- sonnet · PR A implementation TDD · reworked: Y (couldn't run vitest locally; 6-test mock-state leak fixed by Opus)
- sonnet · adversarial review (codex fallback) · reworked: N
- haiku · Step 2 DB vs ES counts · reworked: Y (summed one tenant wrong, 6,537 vs 5,537; Opus re-polled)
- haiku · post-deploy verify · reworked: Y (reported 25 etip containers; direct count 32/32)
