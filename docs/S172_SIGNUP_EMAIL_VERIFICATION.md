# S172 — Sign-up email verification, end to end

**Date:** 2026-09-28 · **Session:** 172 · **Owner queue item:** #1 (self-service sign-up never completed)

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

Documented in the PR 2 section of this file when that PR lands.

## Verify

- `pnpm --filter @etip/admin-service test` → 203 passed (was 195); typecheck + lint clean; `pnpm install --frozen-lockfile` passes.
- After deploy: `docker logs etip_admin | grep -i "resend email sender initialised"` and no `email-send: worker error` lines.

## Rollback

Revert the PR 1 merge commit. Queued jobs (if PR 2 is live) wait in Redis until a consumer returns; nothing else depends on the worker. Restore point: tag `safe-point-2026-09-28-s172-email`.
