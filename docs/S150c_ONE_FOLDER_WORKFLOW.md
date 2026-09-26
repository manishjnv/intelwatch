# S150c — One Folder, One Session Workflow

**Date:** 2026-09-26 | **Owner session, afternoon**

## Why

Two parallel Claude sessions collided in this checkout today: an owner
session found another session's branch plus uncommitted files sitting in
the root folder (`E:\code\IntelWatch`). The worktree-per-session flow
(original PR #42, `scripts/new-worktree.sh`) adds a folder and a fresh
`node_modules` per session and was the source of the confusion.

## Decision

One working folder, one session at a time (see DECISION-034):
- Work only in `E:\code\IntelWatch`. No `git worktree add`, no
  `E:\code\IntelWatch-wt\*` folders.
- One Claude session running at a time.
- Branch per task, created from an up-to-date `master`.
- One deployer merges one PR at a time.
- Docs-only commits may go straight to `master` (paths-ignored by CI deploy).

## What changed (PR #42 rewrite, commit `b9bc62c`)

- Deleted `scripts/new-worktree.sh`.
- `/session-start` step 0a now runs a workspace check before any edit.
- `/session-end` drops worktree cleanup; adds post-merge cleanup (below).
- `CLAUDE.md` Session Protocol records the one-folder rule.
- `docs/roadmap/STEP_00_DEV_WORKFLOW.md` marks worktree-per-session items
  "dropped by owner decision 2026-09-26".
- Kept: `.claude/agents/etip-reviewer.md`, `.gitattributes` (`*.sh eol=lf`),
  one-deployer rule.
- PR #42 CI was running at write time — pending merge; not re-verified here.

## How to work now (per task)

```bash
# 1. Start: make sure master is current and nobody else is mid-work
git switch master
git pull --ff-only origin master
git status -sb                 # must show only ## master, no tracked changes
git worktree list              # should show only the main worktree

# 2. Branch
git switch -c sNNN/<short-task-name>

# 3. Work, commit
git add <files>
git commit -m "feat: ..."

# 4. Push + PR
git push -u origin HEAD
gh pr create --title "..." --body "..."

# 5. After merge (deployer merges one PR at a time)
git switch master
git pull --ff-only origin master
git branch -d sNNN/<short-task-name>
```

Docs-only work (like this session) may commit directly to `master` instead
of steps 2-5.

## Checking another session isn't running

```bash
git status -sb           # tracked changes present + not yours -> STOP
git worktree list        # more than the main worktree -> investigate first
```

## Cleanup still open (as of this session)

- `s159-frontend-tsc` worktree still in use by a running session (19
  uncommitted files) — messaged to commit/push/PR and leave it clean; then
  `git worktree remove ../IntelWatch-wt/s159-frontend-tsc && git worktree prune`
  and delete `E:\code\IntelWatch-wt`.
- Leftover folder `E:\code\IntelWatch-wt\s158-devtools` (branch already
  pushed, worktree unregistered) needs manual deletion — Windows file locks
  blocked automated removal.
- `IntelWatch-wt\login-fix` and `.claude\worktrees\agent-*` leftovers: gone,
  no action needed.

## Rollback

Revert commit `b9bc62c` on the PR #42 branch to restore the worktree-per-session
flow (`scripts/new-worktree.sh` + the old `/session-start`/`/session-end`
worktree steps). Not expected to be needed — this is a process decision, not
a code change with runtime risk.
