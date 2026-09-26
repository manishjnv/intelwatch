# Step 0 — Dev workflow: one worktree per session, one deployer, review before push

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 0 · **Module:** dev tooling (`.claude/`, `.github/workflows/deploy.yml` concurrency only) · **Size:** M (1 session)
**Status:** partial — see progress below. Written 2026-09-25. All claims checked against the repo on that date.

## Progress (2026-09-26)

Done:

- Deploy `concurrency:` + `paths-ignore: docs/**, **/*.md` (Step 0B U10, commit 2d3e6e0)
- `/session-start` step 0 delegates the context digest to a Haiku/Sonnet agent (S150, commits a34ace8, eb9884e)
- Review before push is being practiced ad hoc (S149, S150 used a Sonnet adversarial review), but not yet formalised as tooling here

Not done:

- Worktree-per-session tooling (only the main checkout exists)
- Single-deployer rule formalised
- ✅ (2026-09-26) `/session-end` step 10 now `git push -u origin HEAD` + `gh pr create` when not on `master` (docs-only on master still allowed — paths-ignored); noreply author built in
- ✅ (2026-09-26) `/review` now uses `git diff --stat origin/master...HEAD`

---

## 1. Goal

- Every Claude session works in its **own git worktree** on its **own branch**. No two sessions share a working tree.
- **Only one change reaches production at a time.** One PR is merged to `master`, its CI/CD run goes green, then the next.
- A **review/test subagent** checks every branch before it is pushed.
- `/session-start` and `/session-end` know about worktrees and branches.

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

## 4. Flow

```
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

 Merge queue (one at a time, done by the owner or the one "deployer" session):
   PR A merged → CI/CD run → deploy green → /deploy-check → post-deploy docs → next PR rebased → merged …
```

## 5. Rules (plain English)

1. **One session = one worktree = one branch = one module.** Branch name: `s<NNN>/<module>-<short-task>`, e.g. `s150/normalization-index`.
2. **Never work in the main checkout.** It stays on `master` and clean.
3. **The session number is fixed when the worktree is created**, from the roadmap §4 table. Two parallel sessions never both read "148" and both call themselves 149.
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
| `CLAUDE.md` | Session Protocol: add "0. Create a worktree (see docs/roadmap/STEP_00_DEV_WORKFLOW.md)". Fix "9 steps" → "12 steps". **Needs owner OK** (CLAUDE.md is project law) |
| `scripts/new-worktree.sh` (new, optional) | Small helper: `git fetch`, `git worktree add`, copy `.claude/settings.local.json` + `.claude/secrets/`, `pnpm install --frozen-lockfile`, `prisma generate`. Commit with mode 100755 (`git update-index --chmod=+x`, see RCA S148) |

### Frontend
None.

## 7. How to run a session (copy-paste)

Windows (Git Bash) paths shown; the owner's checkout is `E:\code\IntelWatch` (from `.claude/settings.json` memory path).

```bash
# 1. From the main checkout — create the worktree
cd /e/code/IntelWatch
git fetch origin
git worktree add ../IntelWatch-wt/s150-normalization -b s150/normalization-index origin/master

# 2. Bring gitignored Claude files (DECISION-010)
cp .claude/settings.local.json ../IntelWatch-wt/s150-normalization/.claude/ 2>/dev/null
cp -r .claude/secrets ../IntelWatch-wt/s150-normalization/.claude/ 2>/dev/null

# 3. Install (pnpm store is shared, so this is fast)
cd ../IntelWatch-wt/s150-normalization
pnpm install --frozen-lockfile
pnpm exec prisma generate --schema=prisma/schema.prisma

# 4. Start Claude in the worktree
claude          # then: /session-start  → module: normalization
```

Inside the session:

```text
/session-start            → declares scope, confirms branch s150/normalization-index
(plan mode for 3+ files)  → TDD → code
"Run the etip-reviewer subagent on this branch"   → must say PASS
/pre-push                 → make pre-push (only one docker-test on the machine at a time)
/session-end              → docs updated on the branch, branch pushed, PR opened
```

Deployer (owner, or one named session), one PR at a time:

```bash
gh pr checks <N> --watch                 # CI test job green
gh pr merge <N> --squash --delete-branch # merge → CI/CD deploy starts
gh run watch                             # wait for deploy job green
# then /deploy-check and the post-deploy doc update (CLAUDE.md checklist)
```

Clean up:

```bash
cd /e/code/IntelWatch
git worktree remove ../IntelWatch-wt/s150-normalization
git worktree prune
```

If your Claude Code version has a built-in worktree option (`claude --worktree` / the EnterWorktree tool), you may use it instead of step 1. Still do steps 2–3.

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
| Session-start refuses master | Open Claude in the main checkout, run `/session-start` → it must stop with "not in a worktree" |
| Reviewer catches scope leak | On a scratch branch, touch one file in another module → subagent says FAIL and names the file |
| Reviewer catches failing test | Break one assertion → FAIL |
| Concurrency | Push two small commits to master 30 s apart (or re-run) → second run shows "waiting / pending" in Actions, not running in parallel |
| paths-ignore | Merge a docs-only PR → no CI/CD run on master (PR test run still happens) |

## 11. Acceptance checks

```bash
git worktree list                                   # main + one line per active session
grep -n "worktree" .claude/commands/session-start.md # step 0 present
grep -n "git push origin master" .claude/commands/session-end.md   # → no output
grep -n "origin/master...HEAD" .claude/commands/review.md          # → 1 line
test -f .claude/agents/etip-reviewer.md && echo ok
grep -n "concurrency:" -A2 .github/workflows/deploy.yml            # group etip-master-deploy
grep -n "paths-ignore" -A3 .github/workflows/deploy.yml
git ls-files -s scripts/new-worktree.sh             # 100755 if the helper is added
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

## 14. Owner decisions needed

1. OK to edit `CLAUDE.md` (Session Protocol + "12 steps")?
2. Who is the deployer: always the owner, or one named Claude session per day?
3. Per-session handoff files (`docs/handoffs/S<NNN>.md`) — yes or no?
4. Docs-only merges: skip deploy (`paths-ignore`)? Recommended yes. Side effect: `ETIP_Project_Stats.html` changes also won't deploy — it is not served by the app, so no impact.
5. Merge style: squash (one commit per session) — recommended.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Disk use: each worktree has its own `node_modules` | pnpm hard-links from one store; remove worktrees after merge |
| Forgetting to copy `.claude/settings.local.json` → missing env vars in the session | `/session-start` step 0 warns; helper script copies it |
| Claude auto-memory is keyed by folder path; a worktree may get a separate memory folder | Check with `/memory` in the first worktree session. If separate, keep project facts in `docs/` (the source of truth anyway) |
| `concurrency` with `cancel-in-progress: false` keeps only the **newest** pending run; an older pending run is cancelled | Fine: images are `:latest`, so the newest run contains every earlier merge |
| Two sessions edit the same module in parallel | Rule 1: one module per session; the roadmap assigns modules; deployer refuses a second open PR on the same module |
