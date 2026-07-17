# ============================================================
# Dockerfile — Genova AI Production Build
# Multi-stage : build → production
# ============================================================

# ---- Stage 1 : Build ----
FROM node:26-alpine AS builder

# Installer les dépendances de build
RUN apk add --no-cache python3 make g++ curl openssl

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json bun.lock ./
COPY prisma ./prisma/

# Installer les dépendances
RUN npm ci

# Générer le client Prisma
RUN npx prisma generate

# Copier le code source
COPY . .

# Build l'application Next.js
RUN npm run build

# ---- Stage 2 : Production ----
FROM node:26-alpine AS production

RUN apk add --no-cache curl openssl ca-certificates tzdata

# Créer un utilisateur non-root
RUN addgroup -S genova && adduser -S genova -G genova

WORKDIR /app

# Copier le build depuis l'étape 1
COPY --from=builder /app/.next/standalone ./standalone
COPY --from=builder /app/.next/static ./standalone/.next/static
COPY --from=builder /app/public ./standalone/public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copier les scripts utiles
COPY --from=builder /app/package.json ./
COPY --from=builder /app/scripts ./scripts

# Créer les dossiers nécessaires
RUN mkdir -p /app/data /app/public/uploads && chown -R genova:genova /app

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

USER genova

EXPOSE 3000

# Santé du conteneur
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD curl -f http://localhost:3000/api/ai/health || exit 1

CMD ["node", "standalone/server.js"]
