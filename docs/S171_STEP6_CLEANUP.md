# S171 — Step 6 PR 1: remove empty scaffold folders + scaffold scripts

**Date:** 2026-09-28 · **Session:** 171 · **Spec:** `docs/roadmap/STEP_06_CLEANUP.md` (PR 1) · **Owner decision:** delete both scripts (approved 2026-09-28)

## Why
- At project start `scripts/scaffold.js` created folders under the planned module names. The real services were later built under different names (`*-service`), so these folders stayed empty (only `.gitkeep`).
- They caused wrong-folder mistakes (PROJECT_STATE used the same names), and `scripts/init-modules.js` would have written `package.json`/`tsconfig.json` into them — and overwritten real packages' files — if anyone ran it.

## What changed
| Removed | Real code lives in |
|---|---|
| `apps/admin-ops` | `apps/admin-service` |
| `apps/attack-surface-management` | `apps/drp-service` (ASM engine) |
| `apps/auth` | `apps/user-service` + `apps/api-gateway` |
| `apps/billing` | `apps/billing-service` |
| `apps/digital-risk-protection` | `apps/drp-service` |
| `apps/enterprise-integration` | `apps/integration-service` |
| `apps/reporting` | `apps/reporting-service` |
| `apps/threat-hunting` | `apps/hunting-service` |
| `apps/user-management` | `apps/user-management-service` |
| `apps/websocket` | none (no websocket service; create fresh if ever needed) |

- 28 `.gitkeep` files, `scripts/scaffold.js`, `scripts/init-modules.js`, and the `"scaffold"` script in root `package.json`.
- `docs/PROJECT_STATE.md` module table gains a **Folder** column (real path per module).

## Verification
- Before removal: every folder held only `.gitkeep` (`git ls-files`, `find -type f`); no references outside the two scripts and `package.json`; `pnpm-lock.yaml` has no entries for them (not workspace packages) → lockfile unchanged.
- `ls apps` → 25 real folders.
- CI: tsc/tests unaffected (no code change).

## Rollback
`git revert <commit>` restores the folders and scripts. Nothing depends on them.
