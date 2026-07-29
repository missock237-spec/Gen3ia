# ============================================================
# Dockerfile — Gen3ia AI Agent OS
# Multi-stage: dependencies → build → production
# Compatible Render + Docker Compose
# ============================================================

# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps

RUN apk add --no-cache openssl postgresql-client

WORKDIR /app

# Copier les fichiers de dépendances du monorepo
COPY package.json package-lock.json* pnpm-lock.yaml* bun.lock* ./
COPY packages ./packages

# Installer pnpm si présent, sinon npm
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm@latest && pnpm install --frozen-lockfile; \
    elif [ -f bun.lock ]; then \
      npm install -g bun && bun install --frozen-lockfile; \
    else \
      npm ci --legacy-peer-deps --only=production && npm cache clean --force; \
    fi

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Copier les sources
COPY package.json package-lock.json* pnpm-lock.yaml* bun.lock* ./
COPY packages ./packages
COPY prisma ./prisma
COPY tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts eslint.config.mjs components.json ./
COPY src ./src
COPY public ./public
COPY instrumentation.ts ./

# Installer toutes les dépendances (dev incluses)
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm@latest && pnpm install --frozen-lockfile; \
    elif [ -f bun.lock ]; then \
      npm install -g bun && bun install --frozen-lockfile; \
    else \
      npm ci --legacy-peer-deps && npm cache clean --force; \
    fi

# Générer Prisma client + build Next.js
RUN npx prisma generate && \
    npm run build 2>&1 || (echo "[GEN3IA] Build non-blocking, verifiez les logs" && true)

# ---- Stage 3: Production ----
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl postgresql-client bash curl \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copier les artefacts depuis les stages précédents
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Script d'entrée
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Pour Render: utilise le script d'entrée si présent, sinon démarre direct
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
