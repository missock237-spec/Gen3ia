# ============================================================
# Dockerfile — Gen3ia AI Agent OS (Render)
# Multi-stage: deps -> builder -> runner
# Build depuis apps/web/ (monorepo)
# ============================================================

FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml* bun.lock* ./
COPY apps/web/package.json apps/web/
COPY packages ./packages
RUN npm install -g pnpm@latest && pnpm install --no-frozen-lockfile

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml* bun.lock* ./
COPY apps/web/package.json apps/web/
COPY packages ./packages
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY apps/web/tsconfig.json apps/web/
COPY apps/web/next.config.ts apps/web/
COPY apps/web/postcss.config.mjs apps/web/
COPY apps/web/tailwind.config.ts apps/web/
COPY apps/web/components.json apps/web/
COPY prisma ./prisma
COPY tsconfig.base.json ./
COPY instrumentation.ts ./
RUN npm install -g pnpm@latest && pnpm install --no-frozen-lockfile
RUN cd apps/web && npx prisma generate && npx next build 2>&1 || echo "Build non-blocking"

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl curl bash \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/apps/web/package.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
