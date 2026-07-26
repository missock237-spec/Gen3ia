.PHONY: help dev build test lint audit security db-push db-migrate db-reset db-seed seed reset docker-up docker-down docker-prod clean install

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "\\033[36m%-20s\\033[0m %s\\n", $$1, $$2}'

install: ## Install dependencies
	bun install

dev: ## Start dev server
	bun run dev

build: ## Build production
	bun run build

test: ## Run unit tests
	bun run test

test-watch: ## Run tests in watch mode
	bun run test:watch

test-e2e: ## Run Playwright e2e tests
	bun run test:e2e

lint: ## Run linter
	bun run lint

audit: ## Run security audit
	bun run audit

security: ## Run full security scan
	bun run security:audit

db-push:
	bun run db:push

db-migrate:
	bun run db:migrate

db-reset:
	bun run db:reset

db-studio:
	bun run db:studio

seed:
	bun run db:seed

reset: ## Full reset (DB + node_modules)
	bun run db:reset
	rm -rf node_modules .next
	bun install

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-prod:
	docker compose -f docker-compose.prod.yml up -d --build

docker-logs:
	docker compose logs -f

clean:
	rm -rf .next node_modules
	find . -name "*.pid" -delete

coverage:
	bun x vitest run --coverage
