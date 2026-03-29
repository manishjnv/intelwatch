# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-29
**Session:** 116
**Session Summary:** SSO Group-to-Role Mapping (I-11) + Email Verification (I-13) — SsoConfig Prisma model with SAML/OIDC, JIT provisioning, domain validation; email verification flow with token gen/verify/resend/cleanup, login guard. 22 new tests (73 user-service total). Pushed to master.

## ✅ Changes Made
- Commit ecb327f: feat: SSO group-to-role mapping + email verification flow (I-11, I-13)

## 📁 Files / Documents Affected

### New Files (6)
| File | Purpose |
|------|---------|
| apps/user-service/src/sso-repository.ts | Prisma CRUD for SsoConfig model |
| apps/user-service/src/sso-service.ts | SSO config CRUD, group-to-role mapping, JIT provisioning, callback handler |
| apps/user-service/src/email-verification-repository.ts | Prisma queries for email verification fields |
| apps/user-service/src/email-verification-service.ts | Token generation, verify, resend, cleanup |
| apps/user-service/__tests__/sso-service.test.ts | 10 SSO test cases |
| apps/user-service/__tests__/email-verification.test.ts | 12 email verification test cases |

### Modified Files (9)
| File | Change |
|------|--------|
| prisma/schema.prisma | +SsoConfig model, +emailVerified/emailVerifyToken/emailVerifyExpires on User, +ssoConfig relation on Tenant |
| packages/shared-utils/src/queues.ts | +EMAIL_SEND queue constant (25 total) |
| packages/shared-utils/tests/constants-errors.test.ts | Queue count 24→25 |
| apps/user-service/src/service.ts | Register: active=false, emailVerified=false, queue verification email. Login: 403 if !emailVerified |
| apps/user-service/src/repository.ts | +findUserByEmailAnyStatus, +updateUserSsoFields, +createUser emailVerified/active params |
| apps/user-service/src/index.ts | +SsoService, +email verification exports, +ssoRepo, +emailVerificationRepo |
| apps/user-service/__tests__/service.test.ts | Fixed 7 tests for email verification changes |
| apps/admin-service/tests/dlq-processor.test.ts | Queue count 24→25 |
| apps/admin-service/tests/queue-monitor.test.ts | Queue count 24→25 |

## 🔧 Decisions & Rationale
No new architectural decisions. SSO follows existing MFA patterns (AES-256-GCM encryption reused from mfa-service). Email verification follows standard SHA-256 token hashing pattern.

## 🧪 E2E / Deploy Verification Results
- TypeScript build: 0 errors (`tsc -b --force`)
- All tests pass: 73 user-service, 195 admin-service, 91 shared-utils
- Deploy verified: `/health` → ok (api-gateway v1.0.0), `/ready` → ok
- Live site: intelwatch.in → 307 (expected redirect)

## ⚠️ Open Items / Next Steps

### Immediate
1. Run `prisma db push` on VPS (SsoConfig model + User email verification fields + plan models + migration 0003)
2. Set TI_MFA_ENCRYPTION_KEY env var on VPS
3. Run seed script for 4 default plans
4. Continue Command Center v2.1 — remaining I-items or Quota UI

### Deferred
5. Set Shodan/GreyNoise API keys on VPS
6. Wire fuzzyDedupeHash column in Prisma schema
7. Fix vitest alias caching for @etip/shared-normalization
8. 1 pre-existing flaky test in shared-auth (password.test.ts unique salts)

## 🔁 How to Resume
```
Session 117: Command Center v2.1 — next I-items or Quota UI

Read docs/PROJECT_STATE.md, docs/SESSION_HANDOFF.md

Session 116: SSO Group-to-Role Mapping (I-11) + Email Verification (I-13) COMPLETE.
- I-11: SsoConfig Prisma model (SAML/OIDC), group-to-role mapping (tenant_admin/analyst),
  JIT provisioning, domain validation, maxUsers enforcement, MFA passthrough
- I-13: Email verification (SHA-256 token, 24h expiry, rate-limited resend 5min,
  7-day cleanup), login guard (403 EMAIL_NOT_VERIFIED), register returns job payload
- 6 new files, 9 modified. 22 new tests (73 user-service total). Commit ecb327f.
- VPS needs: prisma db push (SsoConfig + email verification + plan models) + TI_MFA_ENCRYPTION_KEY

Scope: apps/user-service or apps/frontend
Do not modify: shared-utils queue constants, MFA code, admin-service, api-gateway quota
```
