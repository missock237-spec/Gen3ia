# ============================================================
# Gen3ia - Dockerfile de production (Monorepo)
# Build context: racine du monorepo
# ============================================================

FROM node:26-alpine AS base

# Installer les dépendances système nécessaires (si besoin)
RUN apk add --no-cache libc6-compat

# ===== STAGE DE BUILD =====
FROM base AS builder
WORKDIR /app

COPY package*.json ./
COPY turbo.json ./
COPY .npmrc ./

# Installer toutes les dépendances (y compris dev)
RUN npm ci

COPY . .

# Build avec Turborepo
RUN npm run build

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

CMD ["node", "server.js"]
