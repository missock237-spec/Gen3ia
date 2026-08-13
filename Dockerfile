# ============================================================
# Gen3ia - Dockerfile de production (Monorepo)
# Build context: racine du monorepo
# Gestionnaire de paquets : bun (voir bun.lock)
# ============================================================

FROM oven/bun:1.3-alpine AS base

# Installer les dépendances système nécessaires (si besoin)
RUN apk add --no-cache libc6-compat

# ===== STAGE DE BUILD =====
FROM base AS builder
WORKDIR /app

COPY package.json bun.lock turbo.json ./

# Installer toutes les dépendances (y compris dev)
RUN bun install --frozen-lockfile

COPY . .

# Build avec Turborepo
RUN bun run build

# ===== STAGE DE PRODUCTION =====
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Créer un utilisateur non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copier les fichiers nécessaires depuis le build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copier les scripts de validation
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
