# GEN3IA — image de production (sortie standalone)
# v3.2 — gestionnaire UNIQUE : bun (bun.lock à la racine), cohérent avec la
# CI (bun install --frozen-lockfile) et le déploiement Vercel (détection
# automatique de bun.lock). Avant : npm install --legacy-peer-deps SANS
# lockfile → divergence possible des versions installées.
FROM oven/bun:1 AS builder
WORKDIR /app

# Permet de cibler PostgreSQL au build : --build-arg DATABASE_URL=postgres://…
ARG DATABASE_URL=""
ENV DATABASE_URL=$DATABASE_URL

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate && bun run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "server.js"]
