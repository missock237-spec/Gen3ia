# Pre-Deployment Production Checklist

Complete this checklist before deploying to production.

## Environment & Configuration

- [ ] All environment variables are set in production
  - [ ] `AUTH_SECRET` (32+ character random string)
  - [ ] `REDIS_URL` (production Redis endpoint)
  - [ ] `DATABASE_URL` (production database)
  - [ ] `OPENAI_API_KEY` or appropriate LLM keys
  - [ ] `SENTRY_DSN` (error tracking)
  - [ ] `METRICS_API_KEY` (for Prometheus)
  - [ ] `STRIPE_SECRET_KEY` (if using payments)

- [ ] `next.config.js` is the only config file (no `next.config.ts`)
- [ ] `instrumentation.ts` validates env vars on startup
- [ ] Docker configuration is correct in `docker-compose.yml`
- [ ] `vercel.json` has correct settings

## Security

- [ ] Content Security Policy (CSP) is enabled
  - [ ] Test CSP with `curl -i https://api.prod.com`
  - [ ] Verify headers: `X-Content-Type-Options: nosniff`
  - [ ] Verify headers: `X-Frame-Options: DENY`
  - [ ] Verify headers: `Strict-Transport-Security` (production only)

- [ ] Rate limiting is configured
  - [ ] Redis is accessible from app
  - [ ] Auth endpoints have strict limits (5/15min)
  - [ ] API endpoints have moderate limits (100/min)
  - [ ] Test: trigger rate limit and verify HTTP 429

- [ ] API keys are rotated and secured
  - [ ] Old API keys are revoked
  - [ ] Keys are stored in secrets manager
  - [ ] Keys are not in git history

- [ ] HTTPS only
  - [ ] All endpoints redirect HTTP → HTTPS
  - [ ] HSTS header is set
  - [ ] Certificate is valid and not expired

- [ ] Database security
  - [ ] Connection uses SSL/TLS
  - [ ] Database has strong passwords
  - [ ] Backups are automated
  - [ ] Point-in-time recovery is configured

- [ ] Third-party integrations are secure
  - [ ] OpenAI/LLM API keys are rotated
  - [ ] Stripe keys are production keys
  - [ ] Webhook signatures are verified
  - [ ] OAuth tokens use secure storage

## Observability & Monitoring

- [ ] Logging is enabled
  - [ ] `/api/health` endpoint responds with 200
  - [ ] Detailed health check works (admin only)
  - [ ] Logs are aggregated (Loki or equivalent)
  - [ ] Correlation IDs are in all logs

- [ ] Metrics collection is working
  - [ ] `/api/metrics` endpoint responds (requires API key)
  - [ ] Prometheus scrape target is configured
  - [ ] Grafana dashboards are set up
  - [ ] Key metrics are alerting

- [ ] Error tracking is enabled
  - [ ] Sentry is capturing errors
  - [ ] Slack notifications are working
  - [ ] PagerDuty is integrated (if applicable)

- [ ] Uptime monitoring
  - [ ] Uptime checker is configured
  - [ ] /api/health is checked every 60s
  - [ ] Alerts trigger on failure
  - [ ] Status page is updated

## Performance

- [ ] Database queries are optimized
  - [ ] Run `EXPLAIN ANALYZE` on slow queries
  - [ ] Indexes are created for common queries
  - [ ] Query response times are < 100ms (p50)
  - [ ] No N+1 queries

- [ ] Caching is implemented
  - [ ] Redis is connected and healthy
  - [ ] Cache hit rates > 80% for common queries
  - [ ] Cache TTLs are appropriate
  - [ ] Stale-while-revalidate is configured

- [ ] API response times are acceptable
  - [ ] p50 latency < 200ms
  - [ ] p99 latency < 1000ms
  - [ ] Error rate < 0.1%

- [ ] Static assets are optimized
  - [ ] Images are optimized (WebP, AVIF)
  - [ ] CDN is configured
  - [ ] Cache-Control headers are set
  - [ ] Gzip compression is enabled

## Reliability

- [ ] Circuit breakers are in place
  - [ ] OpenAI API calls have circuit breaker
  - [ ] Stripe calls have circuit breaker
  - [ ] External APIs have circuit breaker
  - [ ] Test: circuit breaker triggers correctly

- [ ] Graceful degradation is working
  - [ ] App works if Redis is down
  - [ ] App works if LLM provider is down
  - [ ] Users see appropriate error messages
  - [ ] Critical operations don't fail

- [ ] Rollback plan is in place
  - [ ] Previous version is available
  - [ ] Database migrations are reversible
  - [ ] Rollback procedure is documented
  - [ ] Team is trained on rollback

- [ ] Disaster recovery is tested
  - [ ] Database backups are automated
  - [ ] Backup restoration is tested
  - [ ] Recovery time objective (RTO) is < 1 hour
  - [ ] Recovery point objective (RPO) is < 5 minutes

## Testing

- [ ] All unit tests pass
  ```bash
  pnpm test
  ```

- [ ] All integration tests pass
  ```bash
  pnpm test:integration
  ```

- [ ] All E2E tests pass
  ```bash
  pnpm test:e2e
  ```

- [ ] Build completes without warnings
  ```bash
  pnpm build
  ```

- [ ] Type checking passes
  ```bash
  pnpm typecheck
  ```

- [ ] Linting passes
  ```bash
  pnpm lint
  ```

- [ ] Manual smoke tests
  - [ ] Create a new agent
  - [ ] Execute agent
  - [ ] Check metrics endpoint
  - [ ] Check health endpoint

## Documentation

- [ ] API documentation is up-to-date
  - [ ] All endpoints are documented
  - [ ] Request/response examples are provided
  - [ ] Error codes are documented
  - [ ] Rate limits are documented

- [ ] Runbooks are in place
  - [ ] High CPU incident response
  - [ ] Database connection loss response
  - [ ] External API failure response
  - [ ] Team has read the runbooks

- [ ] Incident response plan is ready
  - [ ] On-call schedule is set up
  - [ ] Escalation procedures are documented
  - [ ] Communication plan is in place

- [ ] Deployment procedures are documented
  - [ ] Deployment steps are clear
  - [ ] Rollback steps are clear
  - [ ] Post-deployment checks are listed

## Team & Access

- [ ] Team access is configured
  - [ ] Production access is restricted
  - [ ] Only necessary team members have access
  - [ ] SSH keys are rotated
  - [ ] MFA is enabled

- [ ] Monitoring dashboards are shared
  - [ ] Grafana dashboards are accessible
  - [ ] Datadog dashboards are accessible
  - [ ] Team has read-only access

- [ ] Alert routing is configured
  - [ ] Slack channel is configured
  - [ ] PagerDuty is integrated
  - [ ] On-call person is assigned

## Compliance & Legal

- [ ] GDPR compliance is verified
  - [ ] Data deletion is working
  - [ ] Data export is working
  - [ ] Privacy policy is up-to-date
  - [ ] Terms of service are agreed

- [ ] SOC 2 compliance is verified
  - [ ] Audit logging is enabled
  - [ ] Change logs are being recorded
  - [ ] Access logs are being recorded
  - [ ] Encryption is enabled in transit and at rest

- [ ] Data retention policies are in place
  - [ ] Logs are retained for 90 days
  - [ ] Backups are retained for 30 days
  - [ ] Metrics are retained for 13 months

## Post-Deployment (First 24 Hours)

- [ ] Monitor error rates
  - [ ] Target: < 0.1% error rate
  - [ ] No spike in 500 errors

- [ ] Monitor latency
  - [ ] Target: p50 < 200ms
  - [ ] Target: p99 < 1000ms

- [ ] Monitor resource usage
  - [ ] CPU < 70%
  - [ ] Memory < 80%
  - [ ] Disk < 90%

- [ ] User testing
  - [ ] Request sample of users to test
  - [ ] Gather feedback
  - [ ] Monitor support tickets

- [ ] Final sign-off
  - [ ] QA team approves
  - [ ] Product team approves
  - [ ] Operations team approves

## Sign-Off

- [ ] QA Lead: _________________ Date: _________
- [ ] Product Lead: _________________ Date: _________
- [ ] Operations Lead: _________________ Date: _________
- [ ] Security Lead: _________________ Date: _________

**Deployment can proceed only when all items are checked and all leads have signed off.**
