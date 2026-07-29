# Gen3ia — AI Automation Ecosystem

**L'OS de l'automatisation intelligente** — Accessible · Communautaire · Flexible

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)](https://www.prisma.io/)
[![Render](https://img.shields.io/badge/deploy-Render-46E3B7?logo=render)](https://render.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Deploiement sur Render

Le projet est deploye sur **Render** via Docker :

```yaml
# render.yaml — Blueprint Render
type: web
runtime: image
dockerfilePath: ./Dockerfile
healthCheckPath: /api/health
```

Variables d'environnement requises sur Render :
```
RENDER_DEPLOY_HOOK_URL=  # URL de deploiement auto
DATABASE_URL=             # PostgreSQL
REDIS_URL=                # Redis
AUTH_SECRET=              # JWT secret
```