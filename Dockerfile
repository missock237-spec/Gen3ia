# ============================================================
# Dockerfile — Gen3ia AI Agent OS
# Multi-stage: dependencies → build → production (scratch-like)
# Sécure: utilisateur non-root, pas de dev packages en prod
# ============================================================

# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps

RUN apk add --no-cache openssl postgresql-client

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/

# Installation avec audit de sécurité
RUN npm ci --legacy-peer-deps --only=production && \
    npm cache clean --force && \
    npm audit --audit-level=high || echo "Vulnerabilities found (review recommended)"

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY tsconfig.json tsconfig.base.json ./
COPY turbo.json ./
COPY prisma ./prisma
COPY next.config.ts ./
COPY apps/web/next.config.ts ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/
COPY src ./src
COPY apps/web/src ./apps/web/src
COPY packages ./packages
COPY public ./public

RUN npm ci --legacy-peer-deps && \
    npx prisma generate && \
    npm run build

# ---- Stage 3: Production (sécurisé) ----
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl postgresql-client curl \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && rm -rf /var/cache/apk/* /tmp/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Sécurité: pas de permissions superflues
RUN chmod 755 /app

COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
