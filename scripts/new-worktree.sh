#!/bin/bash
# Create a new per-session git worktree for ETIP (Step 0 dev workflow).
# Usage: scripts/new-worktree.sh <sNNN> <module> <short-task>
# Run from the main checkout (E:/code/IntelWatch). Must be run ON master.
set -euo pipefail

SESSION="${1:-}"
MODULE="${2:-}"
TASK="${3:-}"

if [[ -z "$SESSION" || -z "$MODULE" || -z "$TASK" ]]; then
  echo "usage: scripts/new-worktree.sh <sNNN> <module> <short-task>" >&2
  echo "example: scripts/new-worktree.sh s158 devtools worktree-flow" >&2
  exit 2
fi

if ! [[ "$SESSION" =~ ^s[0-9]+$ ]]; then
  echo "error: <sNNN> must look like s158, got: $SESSION" >&2
  exit 2
fi

TOPLEVEL="$(git rev-parse --show-toplevel)"
CURRENT_BRANCH="$(git branch --show-current)"

# Refuse if not run from the main checkout: a worktree's toplevel lives under
# .../IntelWatch-wt/..., the main checkout doesn't. Branch must be master too —
# together these catch "ran this from inside a worktree" (RCA S148 root cause).
if [[ "$TOPLEVEL" == *IntelWatch-wt* || "$CURRENT_BRANCH" != "master" ]]; then
  echo "error: run this from the main checkout (E:/code/IntelWatch) on master (current: $TOPLEVEL @ $CURRENT_BRANCH)" >&2
  exit 1
fi

BRANCH_NAME="$SESSION/$MODULE-$TASK"
DIR_NAME="$SESSION-$MODULE"
WORKTREE_PATH="$(dirname "$TOPLEVEL")/IntelWatch-wt/$DIR_NAME"

if [[ -d "$WORKTREE_PATH" ]]; then
  echo "error: worktree dir already exists: $WORKTREE_PATH" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  echo "error: branch already exists: $BRANCH_NAME" >&2
  exit 1
fi

git fetch origin
git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" origin/master

mkdir -p "$WORKTREE_PATH/.claude"
[[ -f ".claude/settings.local.json" ]] && cp ".claude/settings.local.json" "$WORKTREE_PATH/.claude/"
[[ -d ".claude/secrets" ]] && cp -r ".claude/secrets" "$WORKTREE_PATH/.claude/"

(
  cd "$WORKTREE_PATH"
  pnpm install --frozen-lockfile
  pnpm exec prisma generate
)

echo ""
echo "Worktree ready: $WORKTREE_PATH"
echo "Branch: $BRANCH_NAME"
echo "Next: open Claude in that directory, then run /session-start"
