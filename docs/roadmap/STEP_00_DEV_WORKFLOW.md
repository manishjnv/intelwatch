# Step 0 — Dev workflow: one folder + branch per task, one deployer, review before push

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 0 · **Module:** dev tooling (`.claude/`, `.github/workflows/deploy.yml` concurrency only) · **Size:** M (1 session)
**Status:** done (worktree part dropped by owner). One-deployer, reviewer subagent, `/review` + `/session-end` fixes, and LF `.gitattributes` for `*.sh` are done and stay. All §11 acceptance checks pass except the `git ls-files -s` mode bit, which the orchestrator sets at commit time, and the worktree-list check which no longer applies.

## Owner decision (2026-09-26)

**ONE working folder, `E:\code\IntelWatch`. NO git worktrees, no `E:\code\IntelWatch-wt`. One Claude session at a time.** Each task: from up-to-date `master`, `git switch -c sNNN/<short-task>` → commits → push → PR → the single deployer merges one PR at a time → `git switch master && git pull`. Docs-only commits may go straight to `master` (`deploy.yml` `paths-ignore: docs/**, **/*.md`).

This replaces the worktree-per-session design below (§1 rule 1–3, §4 flow diagram, §7 copy-paste steps, `scripts/new-worktree.sh`, and the worktree checks in `/session-start` §0a / `/session-end` §10b) — those items are **dropped by owner decision 2026-09-26 (one folder, serial sessions)**. Everything else in this doc (one-deployer rule, reviewer subagent, `/review` fix, LF `.gitattributes` for `*.sh`) stands as originally designed.

## Progress (2026-09-26)

Done:

- Deploy `concurrency:` + `paths-ignore: docs/**, **/*.md` (Step 0B U10, commit 2d3e6e0)
- `/session-start` step 0 delegates the context digest to a Haiku/Sonnet agent (S150, commits a34ace8, eb9884e)
- Review before push is being practiced ad hoc (S149, S150 used a Sonnet adversarial review), but not yet formalised as tooling here
- ✅ (2026-09-26) `/session-end` step 10 now `git push -u origin HEAD` + `gh pr create` when not on `master` (docs-only on master still allowed — paths-ignored); noreply author built in
- ✅ (2026-09-26) `/review` now uses `git diff --stat origin/master...HEAD`
- **dropped by owner decision 2026-09-26 (one folder, serial sessions)** — `/session-start` step 0a is now a workspace check (uncommitted-changes / stray-worktree guard) instead of a worktree requirement
- **dropped by owner decision 2026-09-26 (one folder, serial sessions)** — `/session-end` step 10b is now "after merge: `git switch master && git pull --ff-only`, delete the local branch" instead of worktree removal
- ✅ (2026-09-26, S158) `.claude/agents/etip-reviewer.md` created — read-only Sonnet subagent, PASS/FAIL gate before push
- **dropped by owner decision 2026-09-26 (one folder, serial sessions)** — `scripts/new-worktree.sh` deleted; no worktree helper needed
- ✅ (2026-09-26, S158) `CLAUDE.md` updated: Session Protocol step 0 is now the one-folder/one-session/branch-per-task rule, "9 steps" → "12 steps" fixed, one-deployer rule in Git section

Not done: none — see §14 for the owner decisions this session applied (§14 superseded by the 2026-09-26 one-folder decision recorded at the top of this doc).

---

## 1. Goal

- ~~Every Claude session works in its own git worktree on its own branch.~~ **dropped by owner decision 2026-09-26** — one folder (`E:\code\IntelWatch`), one session at a time, branch per task instead.
- **Only one change reaches production at a time.** One PR is merged to `master`, its CI/CD run goes green, then the next. (kept)
- A **review/test subagent** checks every branch before it is pushed. (kept)
- `/session-start` and `/session-end` know about branches and do a workspace safety check (no worktree awareness needed).

## 2. Why now

- In S148 two Claude sessions (`intelwatch-9c`, `intelwatch-e2`) ran in the same working tree (docs/SESSION_HANDOFF.md line 60, docs/PROJECT_STATE.md line 149 item e). Edits and git state got mixed.
- Every step after this one is a separate session. Some will run in parallel (e.g. the SEO track). Without isolation, each one risks the same mess.
- It costs nothing: no production change, no new library.

## 3. Current state (verified)

| Area | What is there today | File / line |
|---|---|---|
| Worktrees | None. Only the main checkout exists. No doc or command mentions worktrees except the roadmap and handoff notes | `git worktree list`; `grep -rn worktree .claude` → nothing |
| `/session-start` | Reads skills, PROJECT_STATE, DECISIONS_LOG, RCA, SESSION_HANDOFF, runs `git status` + `git log`. No branch or worktree check | `.claude/commands/session-start.md` steps 1–8 |
| `/session-end` | 12 steps (CLAUDE.md says "9 steps" — out of date). Step 10 commits docs and runs **`git push origin master`** directly | `.claude/commands/session-end.md` lines 164–171 |
| Push to master = deploy | `deploy.yml` runs on every push to `master`, including docs-only pushes. It force-recreates all 25 app containers | `.github/workflows/deploy.yml` lines 10–13, 192 |
| Deploy concurrency | **No `concurrency:` key.** Two pushes close together run two pipelines side by side. Both push `:latest` to GHCR; the older build can finish last and win | `deploy.yml` lines 105–113 (push `:latest`), no `concurrency` anywhere |
| Docs-only deploy caused S148 | PR #30 was docs only. Its deploy dropped SSH and left nginx `Created` for 46 h | `docs/S148_NGINX_OUTAGE.md` §2 |
| `/review` command | Checklist review. Uses `git diff --stat main..HEAD` but the default branch is **`master`**, so that command fails | `.claude/commands/review.md` line 10 |
| Subagents | No `.claude/agents/` folder. No review subagent exists | `ls .claude` → `commands hooks settings.json skills` |
| Local docker test | `make docker-test` uses `docker compose -p etip` with fixed `container_name: etip_*` and fixed host ports. Two worktrees cannot run it at once | `Makefile` lines 7, 45–70; `docker-compose.etip.yml` (every service has `container_name`) |
| Gitignored Claude files | `.claude/settings.local.json` and `.claude/secrets/` hold secrets (DECISION-010). They are gitignored, so a **new worktree does not have them** | `.gitignore` lines 66–68; DECISIONS_LOG DECISION-010 |
| Hooks | `validate-command.mjs` blocks `ssh root@` and `scp`, so sessions cannot touch the VPS directly — only through GitHub workflows | `.claude/hooks/validate-command.mjs` "VPS access" block |

## 4. Flow (superseded — see owner decision at top of doc; kept for history)

```
[worktree-per-session flow — dropped by owner decision 2026-09-26 (one folder, serial sessions)]
 main checkout (E:\code\IntelWatch)          stays on master, clean. Used only to create worktrees.
        │
        ├── git worktree add ..\IntelWatch-wt\s150-normalization  -b s150/normalization-index  origin/master
        │         │
        │         ├─ pnpm install --frozen-lockfile + prisma generate
        │         ├─ claude  →  /session-start  (checks: in a worktree, not on master)
        │         ├─ plan → TDD → code (one module)
        │         ├─ reviewer subagent  →  PASS / FAIL
        │         ├─ /session-end  (docs on the branch, push branch, open PR — never push master)
        │         └─ git worktree remove  (after merge)
        │
        └── git worktree add ..\IntelWatch-wt\seo-2c  -b seo/2c-feature-pages  origin/master   (parallel, another module)
```

**Current flow (owner decision 2026-09-26):** one folder `E:\code\IntelWatch`, one session at a time. `git switch -c sNNN/<task>` from up-to-date master → plan → TDD → code → reviewer subagent → `/session-end` (push branch, open PR) → deployer merges → next session `git switch master && git pull` and deletes the local branch.

```
 Merge queue (one at a time, done by the owner or the one "deployer" session):
   PR A merged → CI/CD run → deploy green → /deploy-check → post-deploy docs → next PR rebased → merged …
```

## 5. Rules (plain English)

1. **dropped by owner decision 2026-09-26** — ~~one session = one worktree = one branch = one module~~. Now: one folder (`E:\code\IntelWatch`), one session at a time, one branch per task, `git switch -c sNNN/<short-task>` from up-to-date master.
2. **dropped by owner decision 2026-09-26** — ~~never work in the main checkout~~. Now: `E:\code\IntelWatch` IS the only working folder; work there directly, on a task branch (or master for docs-only).
3. **dropped by owner decision 2026-09-26** — session numbering is no longer tied to worktree creation; pick the next free `sNNN` when branching.
4. **Only one deployer.** Only one PR is merged into `master` at a time. The next merge waits until the previous CI/CD run is green **and** `/deploy-check` passed.
5. **Only one `make docker-test` at a time** on a machine (fixed container names and ports). Before running it: `docker ps --filter name=etip_` must be empty, or belong to your own run.
6. **Review subagent before every push.** A FAIL blocks the push.
7. **Docs-only PRs do not deploy** (after the `paths-ignore` change below).

## 6. Changes

### Backend
None.

### Infra / tooling

| File | Change |
|---|---|
| `.claude/commands/session-start.md` | New step 0 "Workspace check": run `git rev-parse --show-toplevel`, `git branch --show-current`, `git worktree list`. **Stop** if branch is `master` or the path is the main checkout. Read session number from the branch name. Copy-check: warn if `.claude/settings.local.json` is missing |
| `.claude/commands/session-end.md` | Step 10: replace `git push origin master` with `git push -u origin HEAD` + `gh pr create --base master --fill`. Add step 10b: "Do not merge. Merge is done by the deployer, one PR at a time." Keep all other steps. Fix the "12 steps" wording to match CLAUDE.md |
| `.claude/commands/review.md` | Line 10: `main..HEAD` → `origin/master...HEAD` |
| `.claude/agents/etip-reviewer.md` (new) | Subagent definition. Tools: Read, Grep, Glob, Bash (read-only git + `pnpm --filter <module> test` + `pnpm exec tsc -b tsconfig.build.json`). Steps: (1) run the `/review` checklist on `git diff origin/master...HEAD`, (2) run the `/rca-check` checklist, (3) run tests + typecheck for the touched module, (4) check every changed file is inside the declared module, (5) check no file over 400 lines was made longer. Output: `PASS` or `FAIL` + list. It must not edit files |
| `.github/workflows/deploy.yml` | Add at top level: `concurrency: { group: etip-master-deploy, cancel-in-progress: false }` so push runs never overlap (build-images and deploy both). Add `paths-ignore: ['docs/**', '**/*.md']` under `on.push` so docs-only merges don't redeploy. PRs still run tests |
| `CLAUDE.md` | Session Protocol step 0: **dropped by owner decision 2026-09-26** the worktree line; replaced with the one-folder/one-session/branch-per-task rule. Fix "9 steps" → "12 steps" (kept) |
| `scripts/new-worktree.sh` | **dropped by owner decision 2026-09-26** — deleted; no worktree helper needed under the one-folder model |

### Frontend
None.

## 7. How to run a session (copy-paste) — updated for owner decision 2026-09-26

Windows (Git Bash) paths shown; the owner's checkout is `E:\code\IntelWatch` — the only working folder, no worktrees.

```bash
# 1. In the one working folder — start from up-to-date master, branch per task
cd /e/code/IntelWatch
git switch master && git pull --ff-only
git switch -c s159/normalization-index

# 2. Install if lockfile/schema changed
pnpm install --frozen-lockfile
pnpm exec prisma generate --schema=prisma/schema.prisma

# 3. Start Claude in this folder
claude          # then: /session-start  → module: normalization
```

Inside the session:

```text
/session-start            → declares scope, confirms branch s159/normalization-index
(plan mode for 3+ files)  → TDD → code
"Run the etip-reviewer subagent on this branch"   → must say PASS
/pre-push                 → make pre-push
/session-end              → docs updated on the branch, branch pushed, PR opened
```

(The old worktree-per-session copy-paste — `git worktree add ../IntelWatch-wt/...`, copying `.claude/settings.local.json` into a second folder, `git worktree remove` — is **dropped by owner decision 2026-09-26**. `.claude/settings.local.json` and `.claude/secrets/` already live in the one folder; nothing to copy.)

Deployer (owner, or one named session), one PR at a time:

```bash
gh pr checks <N> --watch                 # CI test job green
gh pr merge <N> --squash --delete-branch # merge → CI/CD deploy starts
gh run watch                             # wait for deploy job green
# then /deploy-check and the post-deploy doc update (CLAUDE.md checklist)
```

Clean up (next session in the one folder, after merge):

```bash
git switch master && git pull --ff-only
git branch -d s159/normalization-index
```

(`dropped by owner decision 2026-09-26`: no worktree to remove, no `EnterWorktree` tool use — one folder only.)

## 8. Handling shared docs (conflicts)

Every `/session-end` edits `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md`, `docs/DEPLOYMENT_RCA.md`, `docs/ETIP_Project_Stats.html`. Two open PRs will conflict there.

| Rule | Why |
|---|---|
| The deployer rebases the next PR on `master` right before merging and fixes doc conflicts by keeping both entries | Merges happen one at a time anyway |
| Session counter and "Last updated" are set by the **deployer at merge time**, not by the session | Avoids two sessions writing the same counter |
| Optional (owner decision): write each handoff to `docs/handoffs/S<NNN>.md` and keep `SESSION_HANDOFF.md` as a one-line pointer | New files never conflict |

## 9. Data model

None.

## 10. Tests

| Test | How |
|---|---|
| Session-start flags a dirty/stray workspace | With uncommitted changes not from this session, or a stray branch, run `/session-start` → it must stop and warn "another session may be running in this folder" (**dropped**: the old "must be in a worktree" check) |
| Reviewer catches scope leak | On a scratch branch, touch one file in another module → subagent says FAIL and names the file |
| Reviewer catches failing test | Break one assertion → FAIL |
| Concurrency | Push two small commits to master 30 s apart (or re-run) → second run shows "waiting / pending" in Actions, not running in parallel |
| paths-ignore | Merge a docs-only PR → no CI/CD run on master (PR test run still happens) |

## 11. Acceptance checks

```bash
git worktree list                                   # main only — no worktree entries (owner decision 2026-09-26)
grep -n "workspace check" .claude/commands/session-start.md # step 0a present
grep -n "git push origin master" .claude/commands/session-end.md   # → no output
grep -n "origin/master...HEAD" .claude/commands/review.md          # → 1 line
test -f .claude/agents/etip-reviewer.md && echo ok
grep -n "concurrency:" -A2 .github/workflows/deploy.yml            # group etip-master-deploy
grep -n "paths-ignore" -A3 .github/workflows/deploy.yml
test -f scripts/new-worktree.sh && echo "should not exist"         # dropped, expect no output
```

## 12. Rollback

- All changes are text in `.claude/`, `CLAUDE.md` and one YAML block. `git revert <sha>` restores the old behaviour.
- Tag first (CLAUDE.md rollback rule, 3+ files): `git tag safe-point-2026-09-xx-step0-workflow`.
- If `paths-ignore` ever hides a needed deploy, trigger by hand: `gh workflow run deploy.yml` (workflow_dispatch still deploys).

## 13. Session breakdown

| Session | Module | Work | Size |
|---|---|---|---|
| S149-0 (before S149) | dev tooling (`.claude/`, deploy.yml `concurrency` + `paths-ignore`) | Everything in §6. One PR | M |

Note: `deploy.yml` is also touched in Step 1. Do Step 0 first and merge it, then start Step 1 from the new `master`.

## 14. Owner decisions (settled 2026-09-26, applied in S158)

1. **CLAUDE.md edit** — OK. Applied: Session Protocol step 0 (worktree rule), "9 steps" → "12 steps" fix, one-deployer line in Git section.
2. **Deployer** — the owner, or the one session the owner names for that day. Only one PR merged at a time; the next merge waits until the previous PR's CI/CD deploy is green and `/deploy-check` passes.
3. **Per-session handoff files** — **no**. Keep the single `SESSION_HANDOFF.md` (overwritten each session-end, as today). Not adopting the `docs/handoffs/S<NNN>.md` split from §8.
4. **Docs-only merges skip deploy** — yes, already implemented via `paths-ignore` (see Progress above).
5. **Merge style** — unchanged (not mandating squash); whatever the deployer already does.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Disk use: each worktree has its own `node_modules` | pnpm hard-links from one store; remove worktrees after merge |
| Forgetting to copy `.claude/settings.local.json` → missing env vars in the session | `/session-start` step 0 warns; helper script copies it |
| Claude auto-memory is keyed by folder path; a worktree may get a separate memory folder | Check with `/memory` in the first worktree session. If separate, keep project facts in `docs/` (the source of truth anyway) |
| `concurrency` with `cancel-in-progress: false` keeps only the **newest** pending run; an older pending run is cancelled | Fine: images are `:latest`, so the newest run contains every earlier merge |
| Two sessions edit the same module in parallel | Rule 1: one module per session; the roadmap assigns modules; deployer refuses a second open PR on the same module |
