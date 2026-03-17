# ═══════════════════════════════════════════════════════════════
# ETIP v4.0 — Developer Makefile
# Eliminates "push and pray" by testing Docker builds locally
# ═══════════════════════════════════════════════════════════════

.PHONY: help install test typecheck lint audit build build-api build-frontend \
        up down logs health docker-test docker-clean push deploy verify ssh

# ─── Colors ──────────────────────────────────────────────────
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m

# ─── Config ──────────────────────────────────────────────────
COMPOSE := docker compose -p etip -f docker-compose.etip.yml
VPS_HOST := root@72.61.227.64

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(NC) %s\n", $$1, $$2}'

# ═══════════════════════════════════════════════════════════════
# LOCAL DEVELOPMENT
# ═══════════════════════════════════════════════════════════════

install: ## Install all dependencies
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	pnpm install
	pnpm exec prisma generate --schema=prisma/schema.prisma

test: ## Run all tests
	@echo "$(YELLOW)Running tests...$(NC)"
	pnpm -r test
	@echo "$(GREEN)✅ All tests passed$(NC)"

typecheck: ## TypeScript strict check
	@echo "$(YELLOW)Type-checking...$(NC)"
	pnpm -r run typecheck
	@echo "$(GREEN)✅ No type errors$(NC)"

lint: ## ESLint check
	@echo "$(YELLOW)Linting...$(NC)"
	pnpm -r run lint
	@echo "$(GREEN)✅ No lint errors$(NC)"

audit: ## Security audit
	@echo "$(YELLOW)Security audit...$(NC)"
	pnpm audit --audit-level=high || true

check: test typecheck lint ## Run test + typecheck + lint (CI gate)
	@echo "$(GREEN)✅ All CI checks passed$(NC)"

# ═══════════════════════════════════════════════════════════════
# DOCKER BUILD & TEST (the missing piece!)
# ═══════════════════════════════════════════════════════════════

docker-lint: ## Check for common Docker build issues
	@echo "$(YELLOW)Pre-build lint...$(NC)"
	@bash scripts/docker-lint.sh

build-api: docker-lint ## Build API Docker image locally
	@echo "$(YELLOW)Building etip_api image...$(NC)"
	$(COMPOSE) build --no-cache etip_api 2>&1 | tail -30
	@echo "$(GREEN)✅ API image built$(NC)"

build-frontend: docker-lint ## Build Frontend Docker image locally
	@echo "$(YELLOW)Building etip_frontend image...$(NC)"
	$(COMPOSE) build --no-cache etip_frontend 2>&1 | tail -30
	@echo "$(GREEN)✅ Frontend image built$(NC)"

build: build-api build-frontend ## Build all custom Docker images
	@echo "$(GREEN)✅ All images built$(NC)"

docker-test: build ## Build images + start + health check (FULL LOCAL DOCKER TEST)
	@echo "$(YELLOW)Starting all ETIP services...$(NC)"
	$(COMPOSE) up -d
	@echo "$(YELLOW)Waiting for services to be healthy (max 90s)...$(NC)"
	@bash scripts/wait-healthy.sh
	@echo ""
	@echo "$(YELLOW)Running health checks...$(NC)"
	@bash scripts/health-check.sh local
	@echo ""
	@echo "$(GREEN)════════════════════════════════════════$(NC)"
	@echo "$(GREEN)  ✅ LOCAL DOCKER TEST PASSED$(NC)"
	@echo "$(GREEN)  Safe to push to master$(NC)"
	@echo "$(GREEN)════════════════════════════════════════$(NC)"

docker-clean: ## Remove all ETIP containers, images, and volumes
	@echo "$(RED)Removing ETIP containers...$(NC)"
	$(COMPOSE) down -v --rmi local 2>/dev/null || true
	docker image prune -f 2>/dev/null || true
	@echo "$(GREEN)✅ Cleaned$(NC)"

up: ## Start all services (without rebuilding)
	$(COMPOSE) up -d

down: ## Stop all services
	$(COMPOSE) down

logs: ## Tail all ETIP logs
	$(COMPOSE) logs -f --tail=50

logs-api: ## Tail API logs only
	docker logs -f --tail=100 etip_api

logs-errors: ## Show only errors from all containers
	@for c in etip_api etip_frontend etip_nginx etip_postgres etip_redis; do \
		errs=$$(docker logs $$c --since=1h 2>&1 | grep -iE "error|fatal|panic" | grep -iv "no error" | tail -3); \
		if [ -n "$$errs" ]; then \
			echo "$(RED)--- $$c ---$(NC)"; \
			echo "$$errs"; echo ""; \
		fi \
	done
	@echo "$(GREEN)✅ Error scan complete$(NC)"

# ═══════════════════════════════════════════════════════════════
# DEPLOYMENT (with pre-flight checks)
# ═══════════════════════════════════════════════════════════════

pre-push: check docker-test ## Full pre-push gate: tests + Docker build + health
	@echo "$(GREEN)✅ PRE-PUSH GATE PASSED — safe to git push$(NC)"

push: pre-push ## Run all checks then push to master
	@echo "$(YELLOW)Pushing to master...$(NC)"
	git add -A
	@read -p "Commit message: " msg; \
	git commit -m "$$msg"
	git push origin master
	@echo "$(GREEN)✅ Pushed. CI/CD will deploy automatically.$(NC)"

verify: ## Verify VPS deployment health
	@bash scripts/health-check.sh production
	@echo "$(GREEN)✅ Production verification complete$(NC)"

ssh: ## SSH to VPS via cloudflared tunnel
	cloudflared access ssh --hostname ssh.intelwatch.in

# ═══════════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════════

db-migrate: ## Run Prisma migrations
	docker exec etip_api npx prisma migrate deploy --schema=prisma/schema.prisma

db-studio: ## Open Prisma Studio
	pnpm exec prisma studio --schema=prisma/schema.prisma

db-seed: ## Seed the database
	docker exec etip_api npx prisma db seed

# ═══════════════════════════════════════════════════════════════
# CONVENIENCE
# ═══════════════════════════════════════════════════════════════

status: ## Show container status
	$(COMPOSE) ps

stats: ## Show container resource usage
	docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $$(docker ps --filter name=etip_ -q)
