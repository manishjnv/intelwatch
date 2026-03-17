#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# health-check.sh — Run health checks against local or production
# Usage: bash scripts/health-check.sh [local|production]
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

ENV=${1:-local}
PASS=0
FAIL=0

if [ "$ENV" = "production" ]; then
  BASE_URL="https://ti.intelwatch.in"
else
  BASE_URL="http://localhost:8080"
fi

check() {
  local name="$1"
  local url="$2"
  local expect_code="${3:-200}"

  code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expect_code" ]; then
    printf "  ✅ %-30s %s → %s\n" "$name" "$code" "OK"
    PASS=$((PASS + 1))
  else
    printf "  ❌ %-30s %s → expected %s\n" "$name" "$code" "$expect_code"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local name="$1"
  local url="$2"
  local field="$3"
  local expected="$4"

  resp=$(curl -sf "$url" 2>/dev/null || echo "{}")
  actual=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null || echo "")
  if [ "$actual" = "$expected" ]; then
    printf "  ✅ %-30s %s=%s\n" "$name" "$field" "$actual"
    PASS=$((PASS + 1))
  else
    printf "  ❌ %-30s %s=%s (expected %s)\n" "$name" "$field" "$actual" "$expected"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══ Health Check: $ENV ($BASE_URL) ═══"
echo ""

# Core endpoints
check "GET /health" "$BASE_URL/health"
check_json "/health status" "$BASE_URL/health" "status" "ok"

# API auth endpoints (should return 400 with empty body, not 500)
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE_URL/api/v1/auth/login" 2>/dev/null || echo "000")
if [ "$code" = "400" ]; then
  printf "  ✅ %-30s %s → %s\n" "POST /api/v1/auth/login (empty)" "$code" "OK (validation)"
  PASS=$((PASS + 1))
elif [ "$code" = "500" ]; then
  printf "  ❌ %-30s %s → %s\n" "POST /api/v1/auth/login (empty)" "$code" "INTERNAL ERROR (DB issue?)"
  FAIL=$((FAIL + 1))
else
  printf "  ⚠️  %-30s %s\n" "POST /api/v1/auth/login (empty)" "$code"
  PASS=$((PASS + 1))
fi

# Frontend (should serve HTML)
code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/login" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  printf "  ✅ %-30s %s → %s\n" "GET /login (frontend SPA)" "$code" "OK"
  PASS=$((PASS + 1))
else
  printf "  ❌ %-30s %s\n" "GET /login (frontend SPA)" "$code"
  FAIL=$((FAIL + 1))
fi

# Protected endpoint (should return 401 without token)
check "GET /api/v1/auth/me (no auth)" "$BASE_URL/api/v1/auth/me" "401"

echo ""
echo "═══ Results: $PASS passed, $FAIL failed ═══"

if [ $FAIL -gt 0 ]; then
  echo "❌ HEALTH CHECK FAILED"
  exit 1
else
  echo "✅ ALL CHECKS PASSED"
  exit 0
fi
