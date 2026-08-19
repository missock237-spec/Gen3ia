# Production Setup Guide

Complete step-by-step guide for deploying Gen3ia to production with all improvements implemented.

## Prerequisites

- [ ] Node.js 20+ installed
- [ ] PostgreSQL 14+ available
- [ ] Redis 6+ available
- [ ] Vercel account (for deployment)
- [ ] GitHub repository connected
- [ ] All secrets ready (see Environment Variables section)

---

## Part 1: Infrastructure Setup

### 1.1 Database (PostgreSQL)

```bash
# Create production database
psql -U postgres -h db.example.com <<EOF
CREATE DATABASE gen3ia_prod;
CREATE USER gen3ia_prod WITH PASSWORD '<STRONG_PASSWORD>';
ALTER ROLE gen3ia_prod WITH CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE gen3ia_prod TO gen3ia_prod;
EOF

# Set connection string
export DATABASE_URL="postgresql://gen3ia_prod:<PASSWORD>@db.example.com:5432/gen3ia_prod?sslmode=require"
```

### 1.2 Redis Cache

```bash
# Option A: AWS ElastiCache
# Create Redis cluster in AWS Console, then:
export REDIS_URL="redis://:PASSWORD@redis.example.com:6379"

# Option B: Upstash (Vercel-recommended)
# Create account at upstash.com, copy connection string:
export REDIS_URL="redis://:TOKEN@redis-token.upstash.io"

# Test connection
redis-cli -u $REDIS_URL PING  # should return PONG
```

### 1.3 TLS/SSL Certificates

```bash
# Using Let's Encrypt via Certbot
sudo certbot certonly --standalone -d api.gen3ia.com -d gen3ia.com

# Or use Vercel's automatic SSL (recommended)
# Vercel handles SSL automatically for *.vercel.app and custom domains
```

---

## Part 2: Environment Variables

### 2.1 Create `.env.production` file

```bash
# Core
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://api.gen3ia.com

# Auth (generate with: openssl rand -base64 32)
AUTH_SECRET=<GENERATE_WITH_OPENSSL>

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Cache
REDIS_URL=redis://:password@host:6379

# LLM Providers (choose at least one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Payment (if using Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Monitoring
SENTRY_DSN=https://key@sentry.io/project
LOKI_URL=https://loki.example.com
METRICS_API_KEY=<STRONG_RANDOM_KEY>

# Optional: Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG....

# Optional: SMS (Twilio)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890
```

### 2.2 Validate all environment variables

```bash
# Run validation
pnpm run check-env

# Expected output:
# ✓ All environment variables validated successfully
```

---

## Part 3: Database Setup

### 3.1 Apply Prisma migrations

```bash
# Apply all pending migrations
npx prisma migrate deploy

# Verify schema
npx prisma studio  # Opens interactive database browser

# Create indexes for performance
npx prisma db execute < docs/db-indexes.sql
```

### 3.2 Seed initial data (optional)

```bash
# Seed admin user, default settings, etc
npx prisma db seed
```

---

## Part 4: Build & Test

### 4.1 Build for production

```bash
# Clean build
rm -rf .next node_modules
pnpm install --frozen-lockfile
pnpm run build

# Check for build errors
# Expected: ✓ Compiled successfully
```

### 4.2 Run tests

```bash
# Unit & integration tests
pnpm test

# E2E tests (against staging if available)
pnpm test:e2e

# All tests must pass before deployment
```

### 4.3 Type check

```bash
pnpm type-check
# Expected: No TypeScript errors
```

---

## Part 5: Deploy to Vercel

### 5.1 Connect GitHub repository

```bash
# Via Vercel Console:
# 1. vercel.com → Create New Project
# 2. Select GitHub repository: missock237-spec/Gen3ia
# 3. Import Project
```

### 5.2 Configure environment variables

```bash
# In Vercel Console:
# Settings → Environment Variables
# Paste all variables from .env.production
```

### 5.3 Deploy

```bash
# Option A: Automatic (recommended)
# Push to main branch → Vercel auto-deploys

# Option B: Manual
vercel deploy --prod
```

### 5.4 Verify deployment

```bash
# Health check
curl -s https://api.gen3ia.com/api/health | jq .

# Expected output:
# {
#   "status": "healthy",
#   "timestamp": "2024-08-02T10:00:00.000Z"
# }
```

---

## Part 6: Monitoring Setup

### 6.1 Sentry (Error Tracking)

```bash
# Create Sentry project at sentry.io
# Get DSN and set SENTRY_DSN env var
# Errors will automatically report to Sentry
```

### 6.2 Loki (Log Aggregation)

```bash
# Deploy Loki instance (or use managed service like Grafana Cloud)
# Set LOKI_URL env var
# Logs will be pushed automatically

# Query logs in Grafana
# Dashboard → Explore → Select Loki datasource
```

### 6.3 Prometheus (Metrics)

```bash
# Expose metrics endpoint
curl -H "X-API-Key: $METRICS_API_KEY" https://api.gen3ia.com/api/metrics

# Add to Prometheus scrape config:
scrape_configs:
  - job_name: 'gen3ia'
    bearer_token: $METRICS_API_KEY
    static_configs:
      - targets: ['https://api.gen3ia.com/api/metrics']
```

### 6.4 Grafana Dashboards

```bash
# Import dashboard templates from docs/grafana/
# Key dashboards:
# - API Performance
# - Database Queries
# - Error Rate
# - User Activity
# - Cost Tracking
```

---

## Part 7: Alerts & Monitoring

### 7.1 Configure PagerDuty

```bash
# pagerduty.com → Services → Create Service
# Integration type: Prometheus
# Copy service key to Prometheus AlertManager config
```

### 7.2 Configure Slack Alerts

```bash
# Slack Workspace → Apps → Create New App
# OAuth & Permissions → Add "incoming-webhook" scope
# Copy webhook URL to Prometheus AlertManager config
```

### 7.3 Load Prometheus rules

```bash
# Copy docs/prometheus-rules.yml to Prometheus server
# Reload: curl -X POST http://prometheus:9090/-/reload
```

---

## Part 8: Verify Production Ready

### 8.1 Pre-flight checks

Run the deployment checklist:

```bash
# Check health endpoint
curl -s https://api.gen3ia.com/api/health?detailed=true | jq .

# Check metrics endpoint
curl -s -H "X-API-Key: $METRICS_API_KEY" https://api.gen3ia.com/api/metrics | head -20

# Check database connectivity
# (should succeed without errors)
```

### 8.2 Smoke tests

```bash
# Test critical user paths:
# 1. User registration
# 2. User login
# 3. Create agent
# 4. Execute agent (if using AI)
# 5. Check billing (if using payments)

# All should succeed with < 1000ms response time
```

### 8.3 Load testing (optional)

```bash
# Using k6 for load testing
k6 run docs/load-test.js

# Expected results:
# - p95 latency < 500ms
# - Error rate < 1%
# - Throughput > 100 requests/sec
```

---

## Part 9: Security Hardening

### 9.1 WAF (Web Application Firewall)

```bash
# Enable Vercel Firewall Rules
# Protect against:
# - SQL injection
# - XSS attacks
# - Rate limiting abuse

# Or use Cloudflare:
# DNS → cloudflare.com → Add domain
# Security → WAF Rules → Enable Sensitivity
```

### 9.2 DDoS Protection

```bash
# Enable Vercel DDoS Protection (automatic)
# Or Cloudflare DDoS Protection (Pro+)
```

### 9.3 CORS Configuration

```javascript
// next.config.js
async headers() {
  return [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGINS || '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
      ],
    },
  ];
}
```

---

## Part 10: Backup & Recovery

### 10.1 Database Backups

```bash
# Create automated backups
# AWS RDS: Enable automated backups (retention: 30 days)
# Or manual backups:
pg_dump $DATABASE_URL > backups/gen3ia_$(date +%Y%m%d).sql

# Test restore procedure
pg_restore -d test_db backups/gen3ia_backup.sql
```

### 10.2 Disaster Recovery Plan

```
1. Database completely lost:
   → Restore from most recent backup
   → Replay transaction logs if available
   → Notify users of data recovery

2. Application completely lost:
   → Redeploy from GitHub
   → Restore from backup

3. Both lost:
   → Restore database first
   → Redeploy application
   → Run smoke tests
   → Notify users
```

---

## Part 11: Documentation & Runbooks

### 11.1 Update documentation

- [ ] Update README.md with production URL
- [ ] Document API endpoints with examples
- [ ] Add deployment troubleshooting guide
- [ ] Add incident response procedures

### 11.2 Share runbooks

- [ ] Distribute RUNBOOKS.md to ops team
- [ ] Distribute ALERTS.md to on-call engineer
- [ ] Schedule training on incident response

---

## Part 12: Post-Deployment

### 12.1 Monitor for 24 hours

```bash
# Watch Grafana dashboards
# Check Sentry for errors
# Monitor query performance in database logs
# Review API latency trends
```

### 12.2 After 1 week

- [ ] Review all metrics for anomalies
- [ ] Check error patterns
- [ ] Review user feedback
- [ ] Optimize slow queries (if any)

### 12.3 Schedule recurring tasks

- [ ] Daily: Review error rate, latency
- [ ] Weekly: Database maintenance, backup verification
- [ ] Monthly: Security audit, cost review
- [ ] Quarterly: Load testing, disaster recovery drill

---

## Useful Commands

```bash
# View application logs
vercel logs --prod

# Check deployment status
vercel status

# Redeploy immediately
vercel deploy --prod --force

# View metrics
curl -H "X-API-Key: $METRICS_API_KEY" https://api.gen3ia.com/api/metrics

# Query database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# Check Redis
redis-cli -u $REDIS_URL INFO stats

# View Sentry errors
# https://sentry.io/organizations/gen3ia/issues/

# View Loki logs
# https://grafana.com/... (configured in your Grafana)
```

---

## Troubleshooting

### App won't start

```bash
# Check env vars
pnpm run check-env

# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check build errors
pnpm run build

# Check logs
vercel logs --prod --follow
```

### High error rate

```bash
# Check Sentry dashboard for error patterns
# Check database query performance
# Check Redis availability
# Review recent deployments

# See RUNBOOKS.md for detailed procedures
```

### High latency

```bash
# Check database query performance
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;

# Check cache hit rate
curl https://api.gen3ia.com/api/metrics | grep cache_hit_rate

# Check Redis availability
redis-cli -u $REDIS_URL PING

# See RUNBOOKS.md for detailed procedures
```

---

## Success Criteria

✅ Production deployment is successful when:

- [x] App running and healthy (GET /api/health returns 200)
- [x] Error rate < 0.5%
- [x] API p99 latency < 300ms
- [x] Database queries all < 100ms
- [x] Cache hit rate > 70%
- [x] All alerts configured and tested
- [x] Backups verified and restorable
- [x] On-call team trained and ready
- [x] Documentation complete and shared
- [x] First 24 hours without critical incidents

---

**Last updated:** 2024-08-02  
**Maintained by:** @platform-team  
**Review frequency:** Quarterly or after major updates
