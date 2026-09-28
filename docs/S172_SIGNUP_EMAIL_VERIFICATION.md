# S172 — Sign-up email verification, end to end

**Date:** 2026-09-28 · **Session:** 172 · **Owner queue item:** #1 (self-service sign-up never completed)

**Status: deployed and owner-verified 2026-09-28.**

## Problem

A new self-service sign-up creates an inactive, unverified tenant admin (`apps/user-service/src/service.ts` `register()`), and login refuses unverified users (`EMAIL_NOT_VERIFIED`). The verification email that should unlock the account was never delivered, so **every new sign-up was stuck**.

`register()` builds an email job for BullMQ queue `QUEUES.EMAIL_SEND` (`etip-email-send`) and returns it to its caller "to queue". Three pieces were missing around that contract:

1. Nothing consumed `etip-email-send`.
2. The api-gateway `/register` route never enqueued the job.
3. The gateway had no `POST /auth/verify-email` or `POST /auth/resend-verification` routes, although the frontend (`VerifyEmailPage`, `use-email-verification.ts`) and the user-service logic (`verifyEmail`, `resendVerification`) already existed.

The fix ships as two PRs, one module each, deployed in this order.

## PR 1 — admin-service email consumer (`s172/email-worker`)

admin-service already owns the Resend client (invite emails), `TI_RESEND_API_KEY`, `TI_FROM_EMAIL` and `TI_PLATFORM_URL`, and its compose service already has `TI_REDIS_URL`. So the consumer lives there.

| File | Change |
|---|---|
| `apps/admin-service/package.json`, `pnpm-lock.yaml` | Add `bullmq ^5.12.0` (same range as api-gateway; resolves to the already-locked 5.71.0 — lockfile diff is the 3-line importer entry only) |
| `apps/admin-service/src/workers/email-send-worker.ts` (new) | BullMQ `Worker` on `QUEUES.EMAIL_SEND`. Zod-validates the job (`type: 'email_verification'`, `userId`, `email`, 64-hex `token`); invalid jobs throw `UnrecoverableError` (no retries). Concurrency 5, limiter 2 jobs/s (Resend's default rate limit). Logs `jobId`/`userId`/`attemptsMade` only — never job data, token, link or email address |
| `apps/admin-service/src/services/email-sender.ts` | `sendVerificationEmail({ to, token, platformUrl })` — link `${TI_PLATFORM_URL}/auth/verify-email?token=…`, same visual template as the invite email. Throws `EMAIL_NOT_CONFIGURED` (503) if Resend is not initialised and `EMAIL_SEND_FAILED` (502) when Resend returns `{ error }` (the v6 SDK does not throw), so BullMQ retries |
| `apps/admin-service/src/index.ts` | Start the worker only when `TI_RESEND_API_KEY` is set (otherwise warn; jobs stay queued); close it on shutdown |
| `apps/admin-service/tests/email-send-worker.test.ts` (new) | 8 tests: valid job → send; bad type / token / email → `UnrecoverableError`, token never in the error; send failure propagates; link format; Resend error → `EMAIL_SEND_FAILED`; not configured → `EMAIL_NOT_CONFIGURED` |

**Design notes**

- **No sign-up input in the email.** The org name and display name are typed by whoever signs up, and so is the recipient address. Echoing them would let anyone send their own text from our verified `intelwatch.in` domain (phishing relay). The email says "Welcome to IntelWatch ETIP" only.
- **Link host comes from config** (`TI_PLATFORM_URL`), never from the request.
- Deploying PR 1 alone is a no-op: the queue stays empty until PR 2.

## PR 2 — api-gateway routes (`s172/verify-routes`)

| File | Change |
|---|---|
| `apps/api-gateway/src/routes/email-queue.ts` (new) | `enqueueEmailJob()` — lazy BullMQ `Queue(QUEUES.EMAIL_SEND)` (same `TI_REDIS_URL` pattern as `search-backfill.ts`); rejects any other queue name (`INVALID_EMAIL_QUEUE`); job options `attempts: 5`, exponential backoff 30 s, `removeOnComplete: true`, `removeOnFail: { age: 86400 }` so job data does not linger in Redis; a 5 s cap (`EMAIL_QUEUE_TIMEOUT`) because `maxRetriesPerRequest: null` would otherwise make `add()` wait forever while Redis is down |
| `apps/api-gateway/src/routes/auth.ts` | `POST /register` enqueues the verification job and replies with an explicit allowlist `{ user, tenant, message }` (the internal queue payload is not returned). Enqueue failure is logged and the sign-up still returns 201 — the user can resend. New `POST /verify-email` (`token` must be 64 lowercase hex; 200 / 404 `INVALID_TOKEN` / 410 `TOKEN_EXPIRED`) and `POST /resend-verification` (`email`; always the generic message; 429 `RATE_LIMITED` inside the 5-minute cooldown) |
| `apps/api-gateway/tests/email-queue.test.ts` (new), `tests/auth-verification.test.ts` (new), `tests/auth.integration.test.ts` | 26 new tests: register reply never carries the queue payload, 201 even when enqueue fails, verify/resend status codes and body shapes, enqueue only when user-service produced a payload, queue-name guard, `CONFIG_ERROR`, timeout. The register mock now matches the real `RegisterResult` (register never returned tokens) |

No user-service or frontend change: the frontend already calls these routes and shows the "check your email" state after sign-up; `VerifyEmailPage` maps 410 → expired and anything else → invalid.

**Adversarial review** (Sonnet takeover — codex quota exhausted until 2026-09-29): accepted. Follow-ups, not blocking:

- `findUnverifiedByEmail` uses `findFirst` on a non-unique email. Safe today because only `register()` creates unverified users and it rejects an email that exists in any tenant; two concurrent sign-ups with the same address could still create two unverified rows.
- The resend cooldown is derived from `emailVerifyExpires − 24 h`; store an explicit sent-at time if the expiry ever changes.
- `markVerified` also sets `active: true`. Safe because deactivation and offboarding never reset `emailVerified`; keep that invariant.

## Verify

- `pnpm --filter @etip/admin-service test` → 203 passed (was 195); `pnpm --filter @etip/api-gateway test` → 324 passed (was 298); typecheck + lint clean on both; `pnpm install --frozen-lockfile` passes.
- After deploy of PR 1: `docker logs etip_admin | grep -i "resend email sender initialised"` and no `email-send: worker error` lines.
- After deploy of PR 2 — owner live test, fresh incognito tab: sign up with a real mailbox → email arrives from `noreply@intelwatch.in` → link opens `/auth/verify-email?token=…` → "Email verified" → log in. Also: request a resend from the login page for a stuck older sign-up.

## Rollback

Revert the PR 2 merge commit first (stops enqueueing), then PR 1 if needed. Queued jobs wait in Redis until a consumer returns; nothing else depends on the worker. Restore point: tag `safe-point-2026-09-28-s172-email`.
