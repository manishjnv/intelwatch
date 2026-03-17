#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# docker-lint.sh — Catch Docker build issues BEFORE building
# Checks: package.json sync, Dockerfile deps, Alpine compatibility
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

ERRORS=0
WARNINGS=0

err() { echo "  ❌ $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo "  ⚠️  $1"; WARNINGS=$((WARNINGS + 1)); }
ok() { echo "  ✅ $1"; }

echo "═══ Docker Pre-Build Lint ═══"
echo ""

# ─── Check 1: All workspace packages in Dockerfile COPY ──────
echo "=== Package inclusion in Dockerfile ==="
for pkg in packages/*/package.json; do
  dir=$(dirname "$pkg")
  name=$(basename "$dir")
  if grep -q "$dir/package.json" Dockerfile 2>/dev/null; then
    ok "$name in API Dockerfile"
  else
    # Only error if it's a shared-* package (API needs these)
    if [[ "$name" == shared-* ]]; then
      err "$name NOT in API Dockerfile COPY stage — will cause MODULE_NOT_FOUND"
    fi
  fi
done

echo ""

# ─── Check 2: pnpm-lock.yaml freshness ───────────────────────
echo "=== Lockfile freshness ==="
if [ -f pnpm-lock.yaml ]; then
  # Check if any package.json is newer than lockfile
  lock_time=$(stat -c %Y pnpm-lock.yaml 2>/dev/null || stat -f %m pnpm-lock.yaml 2>/dev/null || echo 0)
  stale=false
  for pkg in package.json packages/*/package.json apps/*/package.json; do
    if [ -f "$pkg" ]; then
      pkg_time=$(stat -c %Y "$pkg" 2>/dev/null || stat -f %m "$pkg" 2>/dev/null || echo 0)
      if [ "$pkg_time" -gt "$lock_time" ]; then
        warn "$pkg is newer than pnpm-lock.yaml — run 'pnpm install' first"
        stale=true
      fi
    fi
  done
  if [ "$stale" = "false" ]; then
    ok "pnpm-lock.yaml is up to date"
  fi
else
  err "pnpm-lock.yaml not found"
fi

echo ""

# ─── Check 3: TypeScript builds will succeed ──────────────────
echo "=== TypeScript build readiness ==="
for pkg in packages/shared-*/; do
  name=$(basename "$pkg")
  if [ -f "$pkg/tsconfig.json" ]; then
    # Check if outDir is configured
    if grep -q '"outDir"' "$pkg/tsconfig.json" 2>/dev/null || grep -q '"declaration"' "$pkg/tsconfig.json" 2>/dev/null; then
      ok "$name has tsconfig with output"
    else
      warn "$name tsconfig may not produce output files"
    fi
  else
    warn "$name has no tsconfig.json"
  fi
done

echo ""

# ─── Check 4: No Alpine-incompatible native deps ─────────────
echo "=== Alpine compatibility ==="
NATIVE_DEPS=("bcrypt" "sharp" "canvas" "sqlite3" "better-sqlite3")
for dep in "${NATIVE_DEPS[@]}"; do
  if grep -r "\"$dep\"" packages/*/package.json apps/*/package.json 2>/dev/null | grep -v node_modules | head -1 > /dev/null 2>&1; then
    found=$(grep -rl "\"$dep\"" packages/*/package.json apps/*/package.json 2>/dev/null | grep -v node_modules | head -1)
    warn "$dep found in $found — needs Alpine build deps (apk add python3 make g++)"
  fi
done
# Check prisma needs openssl
if grep -r "prisma" package.json 2>/dev/null | head -1 > /dev/null 2>&1; then
  if grep -q "apk.*openssl" Dockerfile 2>/dev/null || grep -q "node:20-alpine" Dockerfile 2>/dev/null; then
    ok "Prisma present, Alpine image should have openssl"
  else
    warn "Prisma requires openssl on Alpine — check Dockerfile"
  fi
fi

echo ""

# ─── Check 5: .env vars match .env.example ───────────────────
echo "=== Environment variables ==="
if [ -f .env ] && [ -f .env.example ]; then
  missing=0
  while IFS= read -r line; do
    var=$(echo "$line" | cut -d= -f1 | tr -d ' ')
    if [ -n "$var" ] && [[ ! "$var" =~ ^# ]]; then
      if ! grep -q "^$var=" .env 2>/dev/null; then
        warn "TI var $var in .env.example but missing from .env"
        missing=$((missing + 1))
      fi
    fi
  done < .env.example
  if [ $missing -eq 0 ]; then
    ok "All .env.example vars present in .env"
  fi
elif [ -f .env.example ]; then
  warn "No .env file found (needed for local docker-test)"
else
  ok "No .env.example to check"
fi

echo ""

# ─── Check 6: Dockerfile.frontend exists ─────────────────────
echo "=== Dockerfiles ==="
[ -f Dockerfile ] && ok "Dockerfile (API) exists" || err "Dockerfile (API) missing"
[ -f Dockerfile.frontend ] && ok "Dockerfile.frontend exists" || err "Dockerfile.frontend missing"

echo ""
echo "═══ Results: $ERRORS errors, $WARNINGS warnings ═══"

if [ $ERRORS -gt 0 ]; then
  echo "❌ FIX ERRORS BEFORE BUILDING"
  exit 1
else
  echo "✅ PRE-BUILD LINT PASSED"
  exit 0
fi
