# ═══════════════════════════════════════════════════════════════
# ETIP v4.0 — Development & Deployment Makefile
# Usage: make <target>
# RULE: Run 'make docker-test' before every push (03-DEVOPS.md)
# ═══════════════════════════════════════════════════════════════

COMPOSE = docker compose -p etip -f docker-compose.etip.yml
HEALTH_URL = http://localhost:3001/health
PROD_URL = https://ti.intelwatch.in

.PHONY: install test typecheck lint check build docker-test pre-push push \
        verify logs-errors status stats clean help

# ─── Development ──────────────────────────────────────────────

## Install deps + generate Prisma client
install:
	pnpm install
	pnpm exec prisma generate --schema=prisma/schema.prisma

## Run all unit tests
test:
	pnpm -r test

## TypeScript type-check (excludes frontend — Vite aliases incompatible with tsc)
typecheck:
	pnpm --filter '!@etip/frontend' -r run typecheck

## ESLint all packages
lint:
	pnpm -r run lint

## Run test + typecheck + lint (full local validation)
check: test typecheck lint
	@echo "✅ All checks passed"

# ─── Docker ───────────────────────────────────────────────────

## Build API + frontend Docker images (with layer caching)
build:
	$(COMPOSE) build etip_api
	$(COMPOSE) build etip_frontend

## Full Docker validation: build → start → wait healthy → health check
docker-test: build
	@echo "Starting containers..."
	$(COMPOSE) up -d
	@echo "Waiting for API to be healthy..."
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12; do \
		if curl -sf $(HEALTH_URL) > /dev/null 2>&1; then \
			echo "✅ API healthy after $$((i * 5))s"; \
			break; \
		fi; \
		if [ $$i -eq 12 ]; then \
			echo "❌ API failed to become healthy after 60s"; \
			$(COMPOSE) logs etip_api --tail=30; \
			exit 1; \
		fi; \
		sleep 5; \
	done
	@echo "Checking frontend..."
	@curl -sf http://localhost:8080/ > /dev/null 2>&1 && echo "✅ Frontend healthy" || echo "⚠️  Frontend not reachable via nginx (may need Caddy)"
	@echo ""
	@echo "=== Container Status ==="
	@$(COMPOSE) ps
	@echo ""
	@echo "✅ docker-test passed"

# ─── Pre-Push Gate ────────────────────────────────────────────

## Full gate: check + docker-test (MANDATORY before push to master)
pre-push: check docker-test
	@echo ""
	@echo "═══════════════════════════════════"
	@echo "✅ PRE-PUSH GATE PASSED"
	@echo "═══════════════════════════════════"

## pre-push + git commit + push (interactive — prompts for commit message)
push: pre-push
	@read -p "Commit message: " msg; \
	git add -A && git commit -m "$$msg" && git push origin master

# ─── Production Verification ─────────────────────────────────

## Production smoke test (requires VPS to be deployed)
verify:
	@echo "=== Production Health Check ==="
	@echo -n "/health: "; curl -sf $(PROD_URL)/health && echo "" || echo "❌ FAIL"
	@echo -n "/ready:  "; curl -sf $(PROD_URL)/ready && echo "" || echo "❌ FAIL"
	@echo -n "Frontend: "; curl -sf $(PROD_URL)/login -o /dev/null && echo "✅ 200" || echo "❌ FAIL"
	@echo -n "Auth API: "; curl -sf -X POST $(PROD_URL)/api/v1/auth/register -H 'Content-Type: application/json' -d '{}' -o /dev/null -w "%{http_code}" && echo "" || echo "❌ FAIL"

# ─── Diagnostics ──────────────────────────────────────────────

## Show error logs from all ETIP containers (last 3 min)
logs-errors:
	@for c in etip_api etip_frontend etip_nginx etip_postgres etip_redis; do \
		echo "=== $$c ==="; \
		docker logs $$c --since=3m 2>&1 | grep -Ei "error|fatal|panic|crash" | tail -5 || echo "(clean)"; \
		echo ""; \
	done

## Container status
status:
	$(COMPOSE) ps

## Container resource usage
stats:
	docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $$(docker ps --filter name=etip_ -q)

## Remove build artifacts
clean:
	pnpm -r exec rm -rf dist node_modules/.cache

# ─── Help ─────────────────────────────────────────────────────

## Show available targets
help:
	@echo "ETIP v4.0 — Makefile Targets"
	@echo ""
	@echo "Development:"
	@echo "  make install       Install deps + prisma generate"
	@echo "  make test          Run all unit tests"
	@echo "  make typecheck     TypeScript check (excl frontend)"
	@echo "  make lint          ESLint all packages"
	@echo "  make check         test + typecheck + lint"
	@echo ""
	@echo "Docker:"
	@echo "  make build         Build API + frontend images"
	@echo "  make docker-test   build + start + health check"
	@echo ""
	@echo "Pre-Push (MANDATORY):"
	@echo "  make pre-push      check + docker-test (full gate)"
	@echo "  make push          pre-push + commit + push"
	@echo ""
	@echo "Production:"
	@echo "  make verify        Smoke test ti.intelwatch.in"
	@echo ""
	@echo "Diagnostics:"
	@echo "  make logs-errors   Error logs (last 3 min)"
	@echo "  make status        Container status"
	@echo "  make stats         Container resource usage"
	@echo "  make clean         Remove dist + caches"
