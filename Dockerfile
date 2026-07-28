# ============================================================
# Dockerfile — Gen3ia AI Agent OS
# Multi-stage: dependencies → build → production
# ============================================================

# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps

RUN apk add --no-cache openssl postgresql-client

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --legacy-peer-deps --only=production && \
    npm cache clean --force

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY tsconfig.json next.config.ts ./
COPY src ./src
COPY public ./public

RUN npm ci --legacy-peer-deps && \
    npx prisma generate && \
    npm run build

# ---- Stage 3: Production ----
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl postgresql-client bash curl \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
