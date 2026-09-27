# S168 — Sign-up CAPTCHA fix + Contact Sales fix

**Date:** 2026-09-28 · **Branch:** direct to `master` (docs + urgent prod fix) · **Module:** frontend + CI workflow only · **RCA:** Issue 50 (`docs/DEPLOYMENT_RCA.md`) · **Decision:** DECISION-043

## Problem

`/register` → account step → plan step → "Select Free" always failed with **"CAPTCHA verification required"**. No Cloudflare
Turnstile widget was ever shown to the user, so there was no way to complete the check — **no new tenant could sign up at all**.
Separately, on the same screens, **"Contact Sales" did nothing** when clicked.

## Root cause

Build-time vs run-time config drift. The api-gateway enforces Turnstile whenever `TI_TURNSTILE_SECRET` is set — which it is, in
the VPS `.env`. The frontend only renders the Turnstile widget when it is **built** with `VITE_TURNSTILE_SITE_KEY`
(`components/TurnstileWidget.tsx`). Frontend images moved to CI builds in RCA #43 (GHCR, DECISION-028) so the VPS never builds
the image itself — but `.github/workflows/deploy.yml` built `Dockerfile.frontend` without
`--build-arg VITE_TURNSTILE_SITE_KEY`. The site key existed only in the VPS `.env`, which CI never reads. Every production
bundle therefore shipped with no widget while the server still demanded a token.

Two secondary bugs on the same screens, both masked by the same broken flow until the primary fix let anyone reach them:
1. The sign-up form let the user advance past the CAPTCHA step without completing it, and an expired token (~5 min TTL) had no
   recovery path — the user just got the generic error again with no way to retry cleanly.
2. "Contact Sales" called `window.open('mailto:...', '_blank')`, which is popup-blocked in most browsers and a silent no-op
   without a configured mail client — indistinguishable from doing nothing.

## Fix

**CI (`.github/workflows/deploy.yml`):**
- `VITE_TURNSTILE_SITE_KEY` is now a GitHub repository **variable** (public by design — it's a site key, not a secret, safe to
  ship in a client bundle) and is passed as a Docker build arg to the frontend image build.
- The build step **fails outright** if the variable is empty, or if the key string is not actually found inside the built
  image (`grep` on the built bundle) — catching this exact class of drift before it reaches the VPS again, not just documenting
  it as a deploy-runbook step.

**Frontend (`RegisterPage.tsx`, `ClientOnboardingPage.tsx`):**
- "Choose Plan" / "Select Free" is disabled until the CAPTCHA is completed, gated on `CAPTCHA_ENABLED` (exported from
  `TurnstileWidget` — when the key is genuinely absent in a non-prod build, the gate is skipped rather than permanently
  blocking the form).
- `CAPTCHA_MISSING` / `CAPTCHA_FAILED` server responses now return the user to the account step with a clear message: "The
  security check expired or failed. Please complete it again." — instead of a dead-end generic error.
- New `components/SalesContactNote.tsx`: same-tab `mailto:` link plus an always-visible sales address with a Copy button,
  used on both sign-up pages so "Contact Sales" works even when the OS has no mail client configured.

## Files

`.github/workflows/deploy.yml` (build arg + build-time assertion), `apps/frontend/src/components/TurnstileWidget.tsx`
(`CAPTCHA_ENABLED` export), `apps/frontend/src/components/SalesContactNote.tsx` (new), `apps/frontend/src/pages/RegisterPage.tsx`,
`apps/frontend/src/pages/ClientOnboardingPage.tsx`, test `apps/frontend/src/__tests__/register-captcha.test.tsx`.

## Tests

`register-captcha.test.tsx`: CAPTCHA-enabled sign-up blocks plan selection until the widget completes; `CAPTCHA_FAILED` and
`CAPTCHA_MISSING` responses return the form to the account step with the recovery message; Contact Sales renders the copyable
address. Full suite: 1,975 passed + 2 skipped (1,977 total, was 1,969).

## Deploy facts

**Date:** 2026-09-28 · Master `ddcb6be` · CI/CD run 36358218015 green (including the new CAPTCHA build-time key guard).

- VPS HEAD `ddcb6be`, 32/32 containers healthy.
- Frontend bundle `assets/index-icIBot1J.js`.
- Turnstile site key confirmed present in the live bundle (grep against the served asset).

## Verify (owner, fresh tab)

1. `/register` → fill account details → the plan step's "Select Free" stays disabled until the Turnstile widget shows a
   completed check.
2. Complete a real sign-up through to a working login (**owner has not yet done this retest** — first item for next session;
   if no verification email arrives, check the Resend key and `etip_api`/user-management-service logs, not the CAPTCHA path).
3. Click "Contact Sales" on both the pricing/sign-up flow and the client-onboarding flow — same-tab mailto opens (or the
   address is visible with a working Copy button if no mail client is configured).
4. `curl` the live bundle and confirm the Turnstile site key string is present (already done once post-deploy; repeat after
   any future frontend CI change to this workflow file).

## Rollback

`git revert ddcb6be` (frontend + CI workflow only — no backend service, no schema, no other container affected).
