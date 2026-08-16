# Security Validation Checklist

Pre-deployment security audit checklist. Must pass 100% before production deployment.

## Code Security

### Secrets & Credentials
- [ ] No hardcoded API keys in code
- [ ] No .env files committed to git
- [ ] `.gitignore` excludes all secret files
- [ ] Run `git secrets scan` returns 0 secrets
- [ ] All credentials use environment variables
- [ ] Secrets rotation plan documented

### Dependencies
- [ ] `pnpm audit` returns 0 critical/high vulnerabilities
- [ ] All dependencies pinned to exact versions
- [ ] `pnpm outdated` reviewed and approved
- [ ] Dev dependencies don't include in production bundle
- [ ] No malware/typosquatting in dependencies
- [ ] Dependency license audit passed (Apache, MIT, BSD only)

### Code Quality
- [ ] No `console.log()` statements in production code
- [ ] No `debugger` statements
- [ ] No hardcoded test data
- [ ] `pnpm lint` passes with 0 warnings
- [ ] `pnpm type-check` passes with 0 TypeScript errors
- [ ] No `@ts-ignore` in critical code paths

### Build Output
- [ ] Production build succeeds: `pnpm run build`
- [ ] No warnings in build output
- [ ] Source maps disabled: `productionBrowserSourceMaps: false`
- [ ] Build output size reasonable (< 500KB JS bundle)

---

## Authentication & Authorization

### Session Management
- [ ] `AUTH_SECRET` is 32+ characters, randomly generated
- [ ] JWT tokens have appropriate TTL (30 days max)
- [ ] Refresh token rotation implemented
- [ ] Session invalidation on logout working
- [ ] No session tokens in URL parameters
- [ ] Secure cookie flags set:
  - [ ] `httpOnly: true` (prevent XSS access)
  - [ ] `secure: true` (HTTPS only)
  - [ ] `sameSite: 'Strict'` (CSRF protection)

### Access Control
- [ ] Admin routes protected with role check
- [ ] API routes require authentication (middleware.ts enforces)
- [ ] User cannot access other user's data
- [ ] Public paths explicitly whitelisted
- [ ] Rate limiting active for auth endpoints

### OAuth/Social Login (if used)
- [ ] Client secrets stored in env vars
- [ ] Redirect URIs whitelisted
- [ ] No token leakage in redirect URL
- [ ] Token verification on backend

---

## Network & Transport Security

### HTTPS/TLS
- [ ] Enforce HTTPS everywhere (redirect HTTP → HTTPS)
- [ ] Strict-Transport-Security (HSTS) header enabled
- [ ] HSTS preload list considered
- [ ] SSL certificate valid and not expired
- [ ] TLS 1.2 or higher enforced
- [ ] Cipher suites reviewed (no weak ciphers)

### Headers
- [ ] Content-Security-Policy (CSP) configured
- [ ] CSP whitelist reviewed (no `unsafe-inline` for scripts)
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY or SAMEORIGIN
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy: camera=(), microphone=(), geolocation=()
- [ ] No server header (powered by header disabled)

### CORS
- [ ] CORS headers configured restrictively
- [ ] Only allow whitelisted origins
- [ ] Credentials not exposed unnecessarily
- [ ] Preflight requests handled

---

## Data Protection

### Encryption
- [ ] Database connection uses SSL/TLS
- [ ] Passwords hashed with bcrypt (min cost 10)
- [ ] Sensitive data encrypted at rest:
  - [ ] API keys
  - [ ] Payment tokens
  - [ ] PII (if applicable)
- [ ] Encryption keys rotated regularly
- [ ] Backups encrypted

### Input Validation
- [ ] All user inputs validated on server
- [ ] Input sanitization for database queries (prevent SQL injection)
- [ ] No user input directly in queries
- [ ] File uploads validated (type, size, content)
- [ ] Zod schemas validate all API inputs
- [ ] Request body size limited

### Output Encoding
- [ ] All user data HTML-encoded before display
- [ ] XSS protection active
- [ ] JSON responses properly formatted
- [ ] Error messages don't leak sensitive info

---

## API Security

### Rate Limiting
- [ ] Rate limiting configured for all endpoints
- [ ] Auth endpoints: 5 req/15min per IP
- [ ] Payment endpoints: 10 req/hour per user
- [ ] General API: 100 req/min per user
- [ ] Rate limiter returns 429 status
- [ ] Rate limit headers included in responses

### API Keys
- [ ] API keys generated securely (32+ chars)
- [ ] API keys rotatable by users
- [ ] API keys expire after 90 days
- [ ] Compromised keys can be revoked immediately
- [ ] API key usage logged

### Request Validation
- [ ] Accept-Language header respected (no XSS)
- [ ] User-Agent validated
- [ ] Request method validated (GET for safe operations only)
- [ ] Content-Type validated

---

## Database Security

### Access Control
- [ ] Database user has minimal required permissions
- [ ] Read-only replicas used for queries where possible
- [ ] No root database access from application
- [ ] Connection pooling with max connections limit

### Query Security
- [ ] All queries use parameterized statements (prevent SQL injection)
- [ ] No raw SQL string concatenation
- [ ] Row-level security (RLS) implemented for multi-tenant data
- [ ] User data scoped by user ID in every query

### Backup Security
- [ ] Backups encrypted
- [ ] Backups stored offline/separate region
- [ ] Backup access restricted
- [ ] Restore tested regularly
- [ ] Backup retention policy documented

---

## External Services

### API Integrations
- [ ] All external API calls use HTTPS
- [ ] API credentials stored in env vars
- [ ] Circuit breaker configured for critical services
- [ ] Timeout configured (prevent hanging)
- [ ] Error handling doesn't leak internal details

### Payment Processing
- [ ] PCI DSS compliance verified
- [ ] No credit card data stored
- [ ] Payment tokens used instead
- [ ] Stripe webhook signature verified
- [ ] Webhook secret stored in env var

### Logging & Monitoring
- [ ] Secrets not logged (redact sensitive data)
- [ ] Logs don't contain user PII
- [ ] Sentry configured with Data Scrubbing
- [ ] Log retention policy enforced
- [ ] Old logs deleted after 90 days

---

## Infrastructure

### Server Configuration
- [ ] Server time synchronized (NTP)
- [ ] Firewall configured
- [ ] Only required ports open (80, 443)
- [ ] SSH key-only authentication (no passwords)
- [ ] Unused services disabled
- [ ] OS security patches applied

### Environment Variables
- [ ] `NODE_ENV=production` set
- [ ] No debug mode in production
- [ ] Verbose logging disabled
- [ ] All required vars present
- [ ] No unused vars

### Docker (if used)
- [ ] Base image from trusted source
- [ ] Multi-stage builds to reduce image size
- [ ] No secrets in image layers
- [ ] Container runs as non-root user
- [ ] Resource limits set (memory, CPU)

---

## Monitoring & Incident Response

### Logging
- [ ] All authentication attempts logged
- [ ] All failed requests logged
- [ ] All database writes logged
- [ ] All admin actions logged
- [ ] Audit trail maintained for 90 days

### Alerting
- [ ] Alerts configured for:
  - [ ] High error rate
  - [ ] High latency
  - [ ] Database failures
  - [ ] Authentication failures
  - [ ] Rate limit violations
  - [ ] Failed payments
- [ ] Alert recipients defined
- [ ] Escalation procedure documented

### Incident Response
- [ ] Incident response plan documented
- [ ] On-call engineer assigned
- [ ] Runbooks available
- [ ] Post-mortem process defined
- [ ] Communication plan for breaches

---

## Compliance & Legal

### Data Privacy
- [ ] Privacy Policy created and published
- [ ] Terms of Service created and published
- [ ] GDPR compliance (if applicable):
  - [ ] Data export functionality
  - [ ] Deletion functionality
  - [ ] Consent management
- [ ] Cookie policy defined and communicated

### Security Policy
- [ ] Security.txt published at /.well-known/security.txt
- [ ] Vulnerability disclosure policy established
- [ ] Bug bounty program considered
- [ ] Responsible disclosure process defined

---

## Testing

### Security Testing
- [ ] OWASP Top 10 testing completed
- [ ] Penetration testing considered (for high-value systems)
- [ ] SQL injection testing passed
- [ ] XSS testing passed
- [ ] CSRF testing passed
- [ ] Authentication testing passed

### Automated Testing
- [ ] Security tests in CI/CD pipeline
- [ ] Dependency scanning enabled
- [ ] Static code analysis enabled
- [ ] Container scanning enabled

---

## Post-Deployment

### Verification
- [ ] Verify HTTPS working (https://api.gen3ia.com)
- [ ] Verify security headers present:
  ```bash
  curl -I https://api.gen3ia.com | grep -E "Strict-Transport|X-Content|CSP"
  ```
- [ ] Verify authentication working
- [ ] Verify logging working
- [ ] Verify rate limiting working

### Maintenance
- [ ] Security updates monitored
- [ ] Patch management process defined
- [ ] Zero-day response plan defined
- [ ] Regular security audits scheduled (quarterly)
- [ ] Penetration testing scheduled (annually)

---

## Sign-Off

- [ ] Security Officer: __________________ Date: __________
- [ ] Dev Lead: __________________ Date: __________
- [ ] DevOps Lead: __________________ Date: __________

**All items must be checked before production deployment.**

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/nodejs-security/)

---

**Last updated:** 2024-08-02  
**Maintained by:** @security-team  
**Review frequency:** Before each production deployment
