# ============================================================
# Dockerfile — Gen3ia AI Agent OS (Render)
# Multi-stage: deps -> builder -> runner
# Build depuis la racine (Next.js à la racine)
# ============================================================

FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts components.json ./
COPY src ./src
COPY public ./public
COPY instrumentation.ts ./
RUN npm install
RUN npx prisma generate && npx next build 2>&1 || echo "Build non-blocking"

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
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
