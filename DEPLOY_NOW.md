# Deploy Gen3ia Now - Quick Start

Quick 5-minute setup to deploy Gen3ia with production improvements.

## 🚀 Quick Deploy (5 minutes)

### 1. Prepare Environment Variables (2 min)

```bash
# Copy template
cp .env.example .env.production

# Edit with your values
nano .env.production
# REQUIRED:
# - AUTH_SECRET (openssl rand -base64 32)
# - DATABASE_URL (PostgreSQL connection)
# - REDIS_URL (Redis/Upstash connection)
# - OPENAI_API_KEY or ANTHROPIC_API_KEY
```

### 2. Build & Test (2 min)

```bash
# Validate environment
pnpm run check-env

# Build
pnpm run build

# Test health endpoint (requires running server)
# pnpm run start
# curl http://localhost:3000/api/health
```

### 3. Deploy to Vercel (1 min)

```bash
# Option A: Automatic (recommended)
# - Push to main branch
# - Vercel auto-deploys

# Option B: Manual
vercel deploy --prod
```

## ✅ Verify Deployment

```bash
# Health check
curl https://api.gen3ia.com/api/health

# Detailed check (admin)
curl -H "Authorization: Bearer $TOKEN" \
  https://api.gen3ia.com/api/health?detailed=true

# Metrics (if access configured)
curl -H "X-API-Key: $METRICS_API_KEY" \
  https://api.gen3ia.com/api/metrics
```

## 📋 Required Environment Variables

```bash
# Core
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://api.gen3ia.com
AUTH_SECRET=<use-openssl-rand-base64-32>

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/db

# Cache (Redis/Upstash)
REDIS_URL=redis://:password@host:6379

# LLM (at least one)
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

# Optional but Recommended
SENTRY_DSN=https://key@sentry.io/project
METRICS_API_KEY=<random-32-chars>
LOKI_URL=https://loki.example.com
```

## 🔍 What Changed (Production Improvements)

### Security ✅
- CSP headers (prevents XSS attacks)
- Rate limiting (prevents abuse)
- Circuit breakers (prevents cascading failures)
- Audit trail (compliance ready)

### Reliability ✅
- Health checks (database + Redis)
- Error tracking (Sentry integration)
- Comprehensive logging (structured JSON)
- Incident runbooks (for common issues)

### Observability ✅
- Prometheus metrics endpoint
- Correlation IDs (distributed tracing)
- Structured logs (for aggregation)
- Grafana-ready dashboards

### Documentation ✅
- Deployment checklist (50+ items)
- Incident runbooks (6 scenarios)
- Security audit checklist (100+ items)
- Production setup guide

## 📊 Monitoring

### Key URLs
- **Health:** https://api.gen3ia.com/api/health
- **Metrics:** https://api.gen3ia.com/api/metrics (requires API key)
- **Sentry:** https://sentry.io/organizations/gen3ia/
- **Logs:** Configured in your monitoring dashboard
- **Grafana:** https://monitoring.gen3ia.com/ (if deployed)

### Key Metrics
- **API Latency:** p99 < 1000ms (target: < 300ms)
- **Error Rate:** < 1% (target: < 0.5%)
- **Cache Hit Rate:** > 70%
- **Database Queries:** p99 < 100ms
- **Uptime:** > 99.9%

## 🚨 Alert System

### Critical (Page immediately)
- Database unavailable
- Error rate > 5%
- Payment processing failure

### High (Alert within 15 min)
- High memory usage (> 3GB)
- Circuit breaker open
- Slow database queries

### Medium (Slack alert)
- Error rate > 1%
- High API latency
- Queue backed up

See `docs/ALERTS.md` for full configuration.

## 🆘 If Something Goes Wrong

### Health check returns 503
```bash
# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check Redis
redis-cli -u $REDIS_URL PING

# Check env vars
pnpm run check-env
```

### High error rate
```bash
# Check Sentry
# https://sentry.io/organizations/gen3ia/issues/

# Check logs
vercel logs --prod --follow

# See runbook
# docs/RUNBOOKS.md
```

### Deployment fails
```bash
# Check build
pnpm run build

# Check git secrets
git secrets scan

# Check dependencies
pnpm audit

# See RUNBOOKS.md for "App won't start"
```

## 📚 Documentation

| Document | Purpose | Link |
|----------|---------|------|
| **DEPLOYMENT_CHECKLIST.md** | Step-by-step deploy | docs/DEPLOYMENT_CHECKLIST.md |
| **RUNBOOKS.md** | How to handle incidents | docs/RUNBOOKS.md |
| **ALERTS.md** | Alert configuration | docs/ALERTS.md |
| **PRODUCTION_SETUP.md** | Full infrastructure guide | docs/PRODUCTION_SETUP.md |
| **SECURITY_CHECKLIST.md** | Security audit | docs/SECURITY_CHECKLIST.md |
| **PRODUCTION_READY_SUMMARY.md** | Status & timeline | PRODUCTION_READY_SUMMARY.md |

## 🎯 Next Steps (After Deployment)

### 24 Hours
- [ ] Monitor error rate, latency, cache hit rate
- [ ] Check Sentry for errors
- [ ] Verify backups working

### 1 Week
- [ ] Review all metrics and trends
- [ ] Optimize slow queries (if found)
- [ ] Update runbooks based on experiences

### 30 Days
- [ ] Implement Phase 4 (resilience patterns)
- [ ] Implement Phase 5 (caching strategy)
- [ ] Performance audit and optimization

---

## Quick Reference

```bash
# Common Commands
vercel env ls              # List env vars
vercel logs --prod --follow # Stream logs
vercel deploy --prod       # Manual deploy
vercel rollback            # Revert to previous version

# Health & Status
curl $API_URL/api/health
curl -H "X-API-Key: $KEY" $API_URL/api/metrics

# Database
psql $DATABASE_URL -c "SELECT * FROM users LIMIT 1"

# Cache
redis-cli -u $REDIS_URL PING
redis-cli -u $REDIS_URL INFO

# Build & Test
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

---

**Deploy in 5 minutes. Monitor for life. Sleep well. 😴**

Questions? See documentation in `docs/` directory.

---

**Version:** 1.0  
**Last Updated:** 2024-08-02  
**Maintained by:** @platform-team
