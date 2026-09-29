#!/usr/bin/env bash
# Step 3 guard (docs/roadmap/STEP_03_PERSISTENCE.md §7): no business data in process memory.
# Fails when a class field holds a Map/Set/array that is neither tagged on the same line
# `// memory-ok: cache|rate-limit|buffer|derived — <why>` nor listed in scripts/memory-store-baseline.txt.
# The baseline is a ratchet: each Step 3 migration session deletes the lines it persists.
# Print the current list (to rebuild the baseline): bash scripts/check-memory-stores.sh --baseline
set -euo pipefail
export LC_ALL=C
cd "$(dirname "$0")/.."

BASELINE=scripts/memory-store-baseline.txt

# path:line-text (no line numbers, whitespace collapsed) so unrelated edits don't break the match
current=$(grep -rnE '^\s*(private|protected|public|readonly)[^=]*=\s*(new (Map|Set)\b|\[\])' apps/*/src --include='*.ts' \
  | grep -v 'memory-ok:' | tr -d '\r' | cut -d: -f1,3- | sed 's/[[:space:]]\+/ /g' | sort -u || true)

if [ "${1:-}" = "--baseline" ]; then
  printf '%s\n' "$current"
  exit 0
fi

new=$(comm -23 <(printf '%s\n' "$current") <(grep -v '^#' "$BASELINE" | tr -d '\r' | sort -u))
if [ -n "$new" ]; then
  echo "In-memory store without a 'memory-ok:' tag (persist it to Postgres/Redis, or tag a real cache):"
  echo "$new"
  exit 1
fi
echo "memory-store guard: OK"
