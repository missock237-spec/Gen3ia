# ============================================================
# Gen3ia — Makefile DX
# Raccourcis pour les commandes quotidiennes
# ============================================================

.ONESHELL:
SHELL := /bin/bash

.PHONY: help dev dev:seed build start lint test test:unit test:coverage test:watch \
	test:e2e db:generate db:push db:seed db:studio db:reset \
	docker:up docker:down docker:dev docker:dev:down \
	docker:prod docker:logs reset clean format docs:api security:audit

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_/-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

# === Développement ===

dev: ## Lance le serveur de développement (http://localhost:3000)
	npm run dev

dev:seed: ## Lance le serveur + seed de la base de données
	npm run db:seed && npm run dev

# === Build ===

build: ## Build de production (Next.js standalone)
	npm run build

start: ## Lance le serveur de production
	npm start

# === Tests ===

test: ## Lance tous les tests
	npm test

test:unit: ## Tests unitaires uniquement
	npm run test:unit

test:coverage: ## Tests avec rapport de couverture
	npm run test:coverage

test:watch: ## Tests en mode watch
	npm run test:watch

test:e2e: ## Tests E2E Playwright
	npm run test:e2e

# === Base de données ===

db:generate: ## Génère le client Prisma
	npx prisma generate

db:push: ## Push le schéma Prisma vers la base
	npx prisma db push

db:seed: ## Seed la base avec des données de test
	npx tsx prisma/seed.ts

db:studio: ## Ouvre Prisma Studio (GUI base de données)
	npx prisma studio

db:reset: ## Reset complet : drop + push + seed
	npx prisma db push --force-reset && npx tsx prisma/seed.ts

db:migrate: ## Crée et applique une migration Prisma
	npx prisma migrate dev

# === Docker ===

docker:up: ## Lance la stack de production (app + postgres + redis + qdrant)
	docker compose up -d --build

docker:down: ## Arrête la stack de production
	docker compose down

docker:dev: ## Lance les services de dev (postgres + redis + qdrant uniquement)
	docker compose -f docker-compose.dev.yml up -d

docker:dev:down: ## Arrête les services de dev
	docker compose -f docker-compose.dev.yml down

docker:dev:reset: ## Reset complet des données de dev (supprime les volumes)
	docker compose -f docker-compose.dev.yml down -v

docker:prod: ## Lance la stack de production avec build
	docker compose -f docker-compose.yml up -d --build

docker:logs: ## Affiche les logs de tous les conteneurs
	docker compose logs -f

# === Qualité ===

lint: ## Vérifie le lint (ESLint)
	npm run lint

lint:fix: ## Corrige automatiquement le lint
	npm run lint:fix

format: ## Formate le code (Prettier)
	npm run format

format:check: ## Vérifie le formatage
	npm run format:check

typecheck: ## Vérifie les types TypeScript
	npm run typecheck

# === Documentation ===

docs:api: ## Génère la spec OpenAPI (public/openapi.json)
	npm run docs:api

# === Sécurité ===

security:audit: ## Audit de sécurité (npm audit)
	npm audit

security:all: ## Audit complet (npm + tests de sécurité)
	npm audit

# === Maintenance ===

clean: ## Nettoie les builds et caches
	rm -rf .next node_modules coverage
	find . -name "*.pid" -delete

reset: clean install db:reset ## Reset complet (clean + install + db)

install: ## Installe les dépendances
	npm install

update: ## Met à jour les dépendances
	npm update
