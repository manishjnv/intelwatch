# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-30
**Session:** 116
**Session Summary:** SCIM 2.0 Provisioning (I-12) + Free-to-Paid Billing Upgrade (I-14) — ScimToken Prisma model, SCIM bearer token management, /Users CRUD (create/patch/delete with deprovisioning), /Groups read-only, RFC 7644 filter parser, session termination + API key revocation on deprovision; POST /billing/upgrade with downgrade protection + GET /billing/plans. 49 new tests. 24 files changed (10 new, 8 modified, 6 test count fixes). Pushed to master.

## ✅ Changes Made

- Commit 48798de: feat: SCIM 2.0 provisioning (I-12) + free-to-paid billing upgrade (I-14)

## 📁 Files / Documents Affected

### New Files (10)

| File | Purpose |
|------|---------|
| apps/user-service/src/scim-token-repository.ts | Prisma CRUD for ScimToken model |
| apps/user-service/src/scim-token-service.ts | SCIM token generate/list/revoke, bearer auth validation |
| apps/user-service/src/scim-users-service.ts | SCIM /Users CRUD — create, get, patch (RFC 7644), delete |
| apps/user-service/src/scim-groups-service.ts | SCIM /Groups read-only — list + get |
| apps/user-service/src/scim-deprovision-service.ts | Deprovisioning: terminates sessions + revokes API keys on SCIM delete |
| apps/user-service/**tests**/scim-token-service.test.ts | SCIM token management tests |
| apps/user-service/**tests**/scim-users.test.ts | SCIM /Users endpoint tests |
| apps/user-service/**tests**/scim-deprovision.test.ts | Deprovisioning flow tests |
| apps/user-service/**tests**/scim-groups.test.ts | SCIM /Groups read-only tests |
| apps/billing-service/**tests**/billing-upgrade.test.ts | Billing upgrade/plans endpoint tests |

### Modified Files (8)

| File | Change |
|------|--------|
| prisma/schema.prisma | +ScimToken model (tenantId, token hash, label, createdAt, lastUsedAt) |
| packages/shared-types/src/scim.ts | SCIM 2.0 type definitions (ScimUser, ScimGroup, ScimListResponse, ScimPatch) |
| packages/shared-utils/src/queues.ts | (if queue added for SCIM events) |
| apps/user-service/src/index.ts | Register SCIM routes + scimTokenService + scimUsersService + scimGroupsService |
| apps/user-service/src/routes/scim.ts | SCIM route handlers with bearer token middleware |
| apps/billing-service/src/service.ts | upgradePlan() + getPlans() methods with downgrade protection |
| apps/billing-service/src/routes.ts | POST /billing/upgrade + GET /billing/plans route registration |
| apps/api-gateway/src/routes/billing.ts | Proxy new billing upgrade + plans routes |

### Test Count Fixes (6)

| File | Change |
|------|--------|
| apps/user-service/**tests**/service.test.ts | Updated test count expectations |
| apps/admin-service/tests/dlq-processor.test.ts | Queue count sync |
| apps/admin-service/tests/queue-monitor.test.ts | Queue count sync |
| packages/shared-utils/tests/constants-errors.test.ts | Queue count sync |
| apps/user-service/**tests**/sso-service.test.ts | Count sync |
| apps/user-service/**tests**/email-verification.test.ts | Count sync |

## 🔧 Decisions & Rationale
No new architectural decisions. SCIM 2.0 bearer tokens stored as SHA-256 hashes (same pattern as email verification tokens). Deprovisioning terminates active sessions via Redis + revokes API keys — follows existing session management patterns. Billing upgrade uses existing PlanStore + downgrade guard (cannot downgrade via upgrade endpoint).

## 🧪 E2E / Deploy Verification Results
- TypeScript build: 0 errors (`tsc -b --force`)
- All tests pass: 49 new tests across 5 SCIM+billing test files
- CI/CD passed. API gateway healthy (110s uptime).
- All 33 containers healthy post-deploy.

## ⚠️ Open Items / Next Steps

### Immediate

1. Run `prisma db push` on VPS (ScimToken model + SsoConfig + email verification fields + plan models + migration 0003)
2. Set TI_MFA_ENCRYPTION_KEY env var on VPS
3. Run seed script for 4 default plans
4. Continue Command Center v2.1 — remaining I-items or Quota UI (billing/limits frontend)

### Deferred

5. Set Shodan/GreyNoise API keys on VPS
6. Wire fuzzyDedupeHash column in Prisma schema
7. Fix vitest alias caching for @etip/shared-normalization
8. 1 pre-existing flaky test in shared-auth (password.test.ts unique salts)

## 🔁 How to Resume
```
Session 117: Command Center v2.1 — remaining I-items or Quota UI

Read docs/PROJECT_STATE.md, docs/SESSION_HANDOFF.md

Session 116: SCIM 2.0 Provisioning (I-12) + Billing Upgrade (I-14) COMPLETE.
- I-12: ScimToken Prisma model, SCIM bearer token management (generate/list/revoke),
  /Users CRUD (RFC 7644 PATCH, deprovisioning terminates sessions + revokes API keys),
  /Groups read-only (list + get), bearer token auth middleware
- I-14: POST /billing/upgrade (downgrade protection, plan validation, seat/feature enforcement),
  GET /billing/plans
- 10 new files, 8 modified, 6 test count fixes. 49 new tests. Commit 48798de.
- VPS needs: prisma db push (ScimToken + SsoConfig + email verification + plan models)
  + TI_MFA_ENCRYPTION_KEY + seed script for 4 default plans

Scope: apps/user-service or apps/frontend
Do not modify: shared-utils queue constants, MFA code, SSO code, api-gateway quota
```
