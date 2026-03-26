# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-26
**Session:** 77
**Session Summary:** Live OSINT feed activation — fix 3 DemoSeeder bugs (type/feedType/parseConfig), 10 real feeds configured, seed-feeds.sh script, deploy fixes.

## Changes Made
- `75c733b` feat: activate live OSINT feeds — fix seeder types + 10 real feeds configured (7 files)
- `d4799c0` fix: seed-feeds.sh uses docker exec + Node.js (VPS has no npx) (1 file)
- `e6a71a7` fix: remove unused UsageSnapshot import — unblocks Docker tsc build (1 file)
- `69e8bd1` fix: increase deploy SSH timeout 15m → 25m (1 file)
- `cd194ad` fix: seed-feeds.sh uses crypto.createHmac for JWT (no jsonwebtoken dep) (1 file)

## New Files
| File | Purpose |
|------|---------|
| `apps/onboarding/tests/feed-schema-validation.test.ts` | 12 Zod validation tests for seeded feeds |
| `scripts/seed-feeds.ts` | Node.js feed seeder for local dev (npx tsx) |
| `scripts/seed-feeds.sh` | Bash seed script for VPS (docker exec + crypto JWT) |
| `tests/e2e/live-feed-smoke.test.ts` | Live pipeline smoke test (skipped in CI) |

## Modified Files
| File | Change |
|------|--------|
| `apps/onboarding/src/services/demo-seeder.ts` | 3-bug fix: type→feedType, json→rest_api/rss/nvd, add parseConfig. 6 new feeds (total 10). |
| `apps/onboarding/tests/demo-seeder.test.ts` | Updated feed count 4→10 |
| `apps/onboarding/tests/demo-seeder-real.test.ts` | Updated feed count 4→10 |
| `apps/onboarding/tests/feed-seeding.test.ts` | Updated counts + payload assertions (feedType, parseConfig) |
| `apps/billing-service/src/repository.ts` | Removed unused UsageSnapshot import (unblocked Docker tsc) |
| `.github/workflows/deploy.yml` | SSH timeout 15m→25m |

## Decisions & Rationale
- No new DECISION-NNN entries. Deploy timeout increase is operational fix, not architectural.

## E2E / Deploy Verification Results
- Deploy: All 33 containers healthy (verified via vps-cmd.yml docker ps)
- Neo4j had transient unhealthy status during compose up (recovered within 2 min)
- Seed script: Blocked by VPS SSH timeout on final run. DB has corrupted non-UUID tenant_id rows from previous seeder runs.
- Feeds NOT yet active — need manual VPS run of seed-feeds.sh

## Open Items / Next Steps
### Immediate
1. Run seed-feeds.sh on VPS: `cd /opt/intelwatch && git pull && bash scripts/seed-feeds.sh`
2. Before seeding: TRUNCATE FeedSource table (non-UUID tenant_id corruption)
3. Verify feeds fetching: check ingestion logs for "Feed fetch + pipeline completed"

### Deferred
- Wire billing-service Prisma in index.ts (session B2)
- Persistence migration B2: alerting-service → Postgres
- registerMetrics TS errors (3 services — session 73 pre-existing)

## How to Resume
```
Working on: Live Feed Verification
Module target: ingestion (verify), onboarding (verify)
Do not modify: frontend, shared packages, any other service

Steps:
1. SSH to VPS or use vps-cmd.yml
2. TRUNCATE "FeedSource" CASCADE (corrupted rows)
3. Run: bash /opt/intelwatch/scripts/seed-feeds.sh
4. Wait 5 min for scheduler sync
5. Check: docker logs etip_ingestion --since=10m | grep "pipeline completed"
6. Verify articles: curl http://localhost:3004/api/v1/articles?limit=5
```
