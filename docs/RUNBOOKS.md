# Production Incident Runbooks

Quick guides for common production incidents. Follow these steps to resolve issues quickly.

## Critical: Database Unavailable

**Severity:** CRITICAL | **Expected resolution:** 5-30 minutes

### Symptoms
- API returns 503 Service Unavailable
- Health check: `GET /api/health` returns `unhealthy`
- Error logs: "database connection error"
- Users cannot create accounts or access data

### Immediate Actions (0-2 minutes)
1. [ ] Declare incident in Slack #incidents channel
2. [ ] Check Vercel/AWS dashboard for database status
3. [ ] Run: `curl -s https://api.gen3ia.com/api/health?detailed=true | jq .components.database`
4. [ ] Check database logs: `SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5;`
5. [ ] Determine if issue is: **connection pool**, **slow queries**, or **database down**

### If Connection Pool Exhausted
```bash
# Check current connections
SELECT count(*) FROM pg_stat_activity;

# Kill idle connections
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE state = 'idle' AND query_start < now() - INTERVAL '5 minutes';

# Restart connection pool (if running in container)
kubectl rollout restart deployment/gen3ia-api
```

### If Slow Queries Detected
```bash
# Find slowest queries
SELECT query, calls, mean_time FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;

# Check missing indexes
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

# Temporarily increase statement timeout (be careful!)
SET statement_timeout = '30s';
```

### If Database Actually Down
1. [ ] Check cloud provider status page
2. [ ] Attempt automatic failover (if configured)
3. [ ] Restore from backup:
   - Restore to new instance
   - Update `DATABASE_URL` env var
   - Restart application
   - Verify data integrity

### Recovery & Prevention
- [ ] Once database returns: restart all app instances
- [ ] Monitor queries for 24 hours for memory leaks
- [ ] Review slow query log and add missing indexes
- [ ] Post-mortem: What caused it? How to prevent?

---

## Critical: Redis/Cache Down

**Severity:** HIGH | **Expected resolution:** 5-15 minutes

### Symptoms
- Requests slightly slower (50-200ms increase)
- Health check: `components.redis` shows `unhealthy`
- Application still functional but degraded
- Increased database load
- Increased latency for user-facing features

### Immediate Actions
1. [ ] Declare incident in Slack #incidents
2. [ ] Run: `redis-cli PING` → should return PONG
3. [ ] Check Redis dashboard/metrics
4. [ ] Determine if: **connection issue**, **memory full**, or **service down**

### If Connection Issues
```bash
# Test connection directly
redis-cli -u $REDIS_URL PING

# Check connection pool
redis-cli INFO clients

# Restart Redis client in app
kubectl rollout restart deployment/gen3ia-api
```

### If Redis Memory Full
```bash
# Check memory usage
redis-cli INFO memory

# Check key patterns using memory
redis-cli --scan --pattern '*session*' | wc -l

# Clear unnecessary data
redis-cli FLUSHDB  # CAREFUL - will lose all cache!

# Or selectively clear old data
redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', ARGV[1])))" 0 'session:*'
```

### If Redis Down
1. [ ] Application should fallback to in-memory cache (graceful degradation)
2. [ ] Monitor database load increase
3. [ ] Restore Redis from backup
4. [ ] Reconnect application

### Prevention
- [ ] Set Redis memory eviction policy: `allkeys-lru`
- [ ] Monitor Redis memory growth daily
- [ ] Clear expired sessions regularly: `BGREWRITEAOF`

---

## High: High Error Rate (>5%)

**Severity:** HIGH | **Expected resolution:** 10-30 minutes

### Symptoms
- Error rate spike in Sentry dashboard
- Error count > normal 3σ
- Users report failures or unexpected behavior
- API response times increasing

### Diagnosis (0-5 minutes)
1. [ ] Check Sentry: What errors are spiking?
2. [ ] Run: `curl https://api.gen3ia.com/api/health`
3. [ ] Check database performance: Any slow queries?
4. [ ] Check Redis: Is it available?
5. [ ] Check external APIs: Any timeouts? (OpenAI, Stripe, etc)
6. [ ] Check recent deployments: Rollback if just deployed

### Common Causes & Fixes

**If caused by recent deployment:**
```bash
# Immediate: Rollback
kubectl rollout undo deployment/gen3ia-api

# Monitor: Error rate should drop within 5 minutes
# Then: Investigate what went wrong
```

**If caused by external API timeout:**
```bash
# Check which service is timing out (from Sentry)
# Temporary fix: Increase timeout or circuit break

# Check service status:
# - OpenAI: https://status.openai.com/
# - Anthropic: status.anthropic.com
# - Stripe: stripe.com/status

# If external service down: Switch to fallback provider
# or disable feature temporarily
```

**If caused by database load:**
```bash
# Kill long-running queries
SELECT pid FROM pg_stat_activity WHERE query_start < now() - INTERVAL '2 minutes';

# Check for missing indexes
EXPLAIN ANALYZE SELECT ...  # run slow query

# Add index if needed
CREATE INDEX idx_field ON table(field);
```

### Recovery
- [ ] Once errors reduce to < 1%: Continue monitoring
- [ ] Check logs for any data corruption
- [ ] Post-incident: Schedule performance review

---

## High: High API Latency (p99 > 1000ms)

**Severity:** HIGH | **Expected resolution:** 15-30 minutes

### Symptoms
- API requests taking > 1 second
- Users report slow experience
- Monitoring shows p99 > 1000ms
- Database CPU/memory spiking

### Quick Diagnosis
```bash
# Check slowest endpoints
tail -f logs/production.log | grep "duration:" | sort

# Check top database queries
SELECT query, calls, mean_time FROM pg_stat_statements 
ORDER BY total_time DESC LIMIT 10;

# Check system load
kubectl top nodes  # or: top command if single server
```

### Quick Fixes

**Add database index (if query plan is bad):**
```sql
-- First: analyze query
EXPLAIN ANALYZE SELECT ...

-- Then: create index on hot columns
CREATE INDEX idx_name ON table(column) WHERE condition;

-- Verify improvement
EXPLAIN ANALYZE SELECT ...  -- should show lower cost
```

**Scale horizontally:**
```bash
# Increase replicas if CPU bound
kubectl scale deployment gen3ia-api --replicas=5

# Check if it helps within 2 minutes
# If not: probably database bound, scale up database instead
```

**Clear cache if needed:**
```bash
# If cache is stale and causing slowdown
redis-cli FLUSHDB

# Better: Warm cache with critical data
# Run cache priming script
```

---

## Medium: Memory Leak / Gradual Degradation

**Severity:** MEDIUM | **Expected resolution:** 1-4 hours

### Symptoms
- Memory usage increasing over hours/days
- Application becoming slower over time
- Frequent restarts by container orchestrator
- Peak memory approaching limit

### Investigation
```bash
# Check memory usage trend
kubectl top pod  # current
kubectl logs -p $POD  # check previous pod's logs

# Check for common leaks in Node.js
# Use heap snapshot: npm install -g clinic
clinic --doctor -- node ./dist/server.js

# Check for unclosed connections
SELECT count(*) FROM pg_stat_activity;  # should be stable
redis-cli INFO clients  # should be stable
```

### Common Causes & Fixes

**Unclosed database connections:**
```typescript
// BAD: Connection not closed
const result = await db.query(...);

// GOOD: Use connection pool or proper cleanup
using const conn = await db.getConnection();
const result = await conn.query(...);
```

**Event listeners not cleaned up:**
```typescript
// BAD: Listener never removed
emitter.on('data', handler);

// GOOD: Remove on cleanup
emitter.on('data', handler);
emitter.off('data', handler);  // on component unmount
```

**Growing arrays/objects:**
```typescript
// BAD: Global array growing unbounded
const cache: DataItem[] = [];

// GOOD: Use LRU cache with size limit
import LRU from 'lru-cache';
const cache = new LRU({ max: 1000 });
```

### Short-term Fix
- [ ] Increase memory limit (temporary)
- [ ] Increase restart frequency/grace period
- [ ] Add memory alert trigger

### Long-term Fix
- [ ] Identify leak with profiler
- [ ] Fix root cause
- [ ] Test in staging for 4+ hours
- [ ] Deploy with monitoring

---

## Low: High Disk Usage (>80%)

**Severity:** MEDIUM | **Expected resolution:** 30-60 minutes

### Symptoms
- Deployment fails: "no space left on device"
- Application can't write logs
- Database replication lagging

### Quick Diagnosis
```bash
# Check disk usage
df -h

# Find what's taking space
du -sh /*
du -sh /var/log/*

# Check if logs are the issue
ls -lah /var/log
```

### Quick Fixes

**If logs are taking space:**
```bash
# Rotate logs
logrotate -f /etc/logrotate.d/gen3ia

# Clean old logs
find /var/log -name "*.log.*" -mtime +30 -delete

# Limit log size going forward
# Update logger configuration
```

**If Docker/Kubernetes temp space:**
```bash
# Clean unused images
docker image prune -a

# Clean unused volumes
docker volume prune

# In k8s: clean nodes
kubectl debug node/NODE_NAME -it --image=ubuntu
# then: rm -rf /var/lib/kubelet/pods/*/
```

**If database is the issue:**
```bash
# Check database size
SELECT pg_size_pretty(pg_database_size('gen3ia'));

# Find large tables
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) 
FROM pg_stat_user_tables 
ORDER BY pg_total_relation_size(relid) DESC;

# Archive or compress old data
-- Move old records to archive table
INSERT INTO archive_table SELECT * FROM main_table WHERE created_at < NOW() - INTERVAL '1 year';
DELETE FROM main_table WHERE created_at < NOW() - INTERVAL '1 year';
VACUUM ANALYZE main_table;
```

---

## Recovery & Post-Incident

### After Every Incident
1. [ ] Document timeline of what happened
2. [ ] Document what alerts fired (or didn't)
3. [ ] Document what you did to fix it
4. [ ] Document what could prevent this

### Create Incident Report
- **What happened?** (customer impact, duration)
- **Root cause?** (why did it happen?)
- **How was it resolved?** (steps taken)
- **What preventive measures?** (to avoid repeat)

### Schedule Post-Mortem
- [ ] Blameless post-mortem (focus on system, not people)
- [ ] Action items assigned with owners
- [ ] Follow-up in 1 week
- [ ] Document lessons learned

---

## Emergency Contacts

- **On-call engineer:** Check Slack #oncall channel
- **Database admin:** @db-team
- **Infrastructure:** @devops-team
- **Product lead:** @product-lead
- **Escalation:** @engineering-manager

## Useful Links

- Sentry: https://sentry.io/organizations/gen3ia/issues/
- Grafana: https://monitoring.gen3ia.com/
- Kubernetes dashboard: https://k8s.gen3ia.com/
- Database console: https://db.gen3ia.com/
- Status page: https://status.gen3ia.com/

---

**Last updated:** 2024-08-02  
**Review frequency:** Monthly  
**Maintained by:** Platform Team
