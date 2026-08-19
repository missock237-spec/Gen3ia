# Production Deployment Checklist

This checklist ensures a safe and reliable production deployment of Gen3ia.

## Pre-Deployment Phase (48 hours before)

### Code Review & Testing
- [ ] All code changes reviewed and approved
- [ ] Unit tests passing: `pnpm test`
- [ ] Integration tests passing: `pnpm test:integration`
- [ ] E2E tests passing: `pnpm test:e2e`
- [ ] No console errors or warnings in dev mode
- [ ] TypeScript strict mode: `pnpm type-check` passes
- [ ] Linter passing: `pnpm lint`

### Security Review
- [ ] No secrets in code (`git secrets scan`)
- [ ] Dependencies audited: `pnpm audit`
- [ ] No critical/high vulnerabilities
- [ ] `.env` file NOT committed
- [ ] API keys rotate strategy in place
- [ ] CORS and CSP headers reviewed
- [ ] Database credentials use proper secrets manager

### Database
- [ ] Schema migrations tested in staging
- [ ] Rollback plan documented
- [ ] Backup taken and tested
- [ ] Migration runs under 5 seconds
- [ ] No breaking changes to API responses
- [ ] Database indexes optimized (`EXPLAIN ANALYZE` on queries)

### Performance
- [ ] Lighthouse score > 80
- [ ] API response time p99 < 300ms (test with `k6`)
- [ ] Database queries all < 100ms (check slow query log)
- [ ] Bundle size checked (`next/bundle-analyzer`)
- [ ] Image optimization verified
- [ ] Caching headers configured

### Infrastructure
- [ ] Redis/Cache configured and tested
- [ ] Load balancer health checks passing
- [ ] Rate limiting configured
- [ ] Monitoring/Alerting enabled
- [ ] Log aggregation (Loki/CloudWatch) working
- [ ] Error tracking (Sentry) configured
- [ ] CDN cache invalidation plan ready

## Deployment Day

### Morning Standup (2 hours before)
- [ ] Team briefed on deployment plan
- [ ] On-call engineer identified
- [ ] Rollback procedure rehearsed
- [ ] Stakeholders notified of maintenance window (if needed)
- [ ] Communication channel open (Slack, War Room)

### Pre-Deployment Checks (1 hour before)
- [ ] Production database backup initiated
- [ ] Health endpoint returning 200: `GET /api/health`
- [ ] Staging environment matches production config
- [ ] Feature flags ready (if used)
- [ ] Rate limiting configured correctly
- [ ] API keys and secrets in place

### Build & Push (Start deployment)
- [ ] Clean build: `pnpm run build` succeeds
- [ ] Docker image builds successfully (if containerized)
- [ ] Image pushed to registry: `docker push ...`
- [ ] Git tag created: `git tag v1.2.3 && git push --tags`

### Deployment
- [ ] Blue-green deployment initiated
- [ ] New version spins up without errors
- [ ] Health checks passing on new version: `GET /api/health?detailed=true`
- [ ] Database migrations applied successfully
- [ ] Smoke tests on new version pass
- [ ] Traffic slowly shifted (5% → 25% → 50% → 100%)
- [ ] Monitor error rate (should stay < 1%)
- [ ] Monitor latency (should stay consistent)
- [ ] Check logs for errors: `Loki` dashboard

### Post-Deployment (1 hour after)
- [ ] Confirm all instances healthy
- [ ] API endpoints responding correctly
- [ ] Database connections healthy
- [ ] Cache warming completed (if applicable)
- [ ] All monitoring alerts green
- [ ] No spike in error rates
- [ ] No spike in response times
- [ ] No unusual memory usage

### Verification Tests
- [ ] Authentication flow working
- [ ] User creation/login working
- [ ] Payment processing working (if applicable)
- [ ] Email notifications sending (if applicable)
- [ ] External APIs integrating correctly
- [ ] Background jobs queued properly (BullMQ)
- [ ] Real user traffic flowing normally

## Post-Deployment (24 hours after)

### Stability Check
- [ ] Error rate stable and low (< 0.5%)
- [ ] Response times stable
- [ ] Database performance normal
- [ ] No memory leaks (check process memory over time)
- [ ] Log volume normal
- [ ] Cache hit ratio good (> 70%)

### User Feedback
- [ ] No critical bug reports
- [ ] Performance acceptable to users
- [ ] Feature working as expected
- [ ] No data corruption issues

### Documentation
- [ ] Deployment notes added to wiki
- [ ] Changelog updated
- [ ] Release notes published (if external)
- [ ] Known issues documented (if any)

## Rollback Plan (In case of critical issues)

### Decision to Rollback
- [ ] Error rate > 5% sustained for 5 minutes
- [ ] API response time p99 > 2000ms
- [ ] Database connectivity failing
- [ ] Critical security vulnerability discovered
- [ ] Data integrity issues detected

### Execution
1. [ ] Notify stakeholders immediately
2. [ ] Stop traffic to new version
3. [ ] Switch load balancer back to previous version
4. [ ] Monitor error rate (should drop immediately)
5. [ ] Assess and fix issues
6. [ ] Plan retry in 2-4 hours

### Post-Rollback
- [ ] Root cause analysis completed
- [ ] Fix verified in staging
- [ ] Team debriefing conducted
- [ ] Issue tracked for follow-up

## Environment Variables

**Must be configured before deployment:**

Critical (app won't start without these):
- `AUTH_SECRET` - 32+ character random string
- `DATABASE_URL` - Connection string to production database
- `NODE_ENV=production`

Important (app starts but features limited):
- `REDIS_URL` - Redis connection (optional but recommended)
- At least one: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`

Optional but recommended:
- `SENTRY_DSN` - Error tracking
- `LOKI_URL` - Log aggregation
- Payment keys if using payments
- Email service credentials

## Monitoring After Deployment

**Set these alerts:**
- Error rate > 1%
- Response time p99 > 500ms
- Database unavailable > 30s
- Redis unavailable > 30s
- Disk usage > 80%
- Memory usage > 85%
- CPU > 80% for > 5 minutes

## Useful Commands

```bash
# Check health
curl https://api.gen3ia.com/api/health?detailed=true

# Tail logs
tail -f logs/production.log

# Check database
SELECT COUNT(*) FROM users;

# Check Redis
redis-cli PING

# Monitor performance
kubectl top nodes  # if using k8s
docker stats       # if using docker

# Tail Loki logs
# Use Grafana dashboard or CLI
```

## Post-Deployment Success Criteria

✅ **Deployment is successful when:**
- Zero critical errors in first hour
- Error rate < 0.5% (normal baseline)
- Response time p99 < 300ms
- All health checks passing
- User analytics showing normal traffic
- No unusual database activity
- All background jobs processing normally
- Monitoring dashboard showing green

✅ **Ready to close war room when:**
- 4 hours have passed without incidents
- Error rate trending down
- All metrics normal
- Stakeholders informed and satisfied

---

**Last updated:** 2024-08-02  
**Maintained by:** Platform Team  
**Next review:** Quarterly or after major incident
