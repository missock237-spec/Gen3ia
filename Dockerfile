# ============================================================
# Gen3ia - Dockerfile de production (Monorepo)
# Build context: racine du monorepo
# Alternative: apps/web/Dockerfile pour build optimise
# ============================================================

# ---- Stage 1 : Dependencies ----
FROM node:20-alpine AS deps
LABEL stage=deps
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copier les fichiers package du monorepo (workspaces)
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/

RUN npm ci

# ---- Stage 2 : Build ----
FROM node:20-alpine AS builder
LABEL stage=builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json* ./

# Copier le code source (racine = app principale)
COPY src/ ./src/
COPY public/ ./public/
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/
COPY next.config.js tsconfig.json tsconfig.worker.json ./

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Generer Prisma + Build Next.js
RUN npx prisma generate
RUN npm run build
RUN npm prune --production

# ---- Stage 3 : Runner ----
FROM node:20-alpine AS runner
LABEL stage=runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/next.config.js ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
