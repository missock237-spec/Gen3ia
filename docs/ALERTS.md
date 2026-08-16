# Production Alerts Configuration

This document defines all critical alerts that should trigger notifications to the on-call engineer.

## Alert Severity Levels

- **🔴 CRITICAL** - Service down or severe data corruption. Immediate action required.
- **🟠 HIGH** - Significant degradation. Needs attention within 15 minutes.
- **🟡 MEDIUM** - Performance issue or minor service degradation. Handle within 1 hour.
- **🟢 LOW** - Informational or non-urgent. Review during business hours.

---

## Critical Alerts (Page immediately)

### Database Unavailable
- **Metric:** `gen3ia_db_connection_failed_total > 0`
- **Threshold:** Triggered immediately
- **Duration:** 1 minute
- **Action:** See [RUNBOOKS.md - Database Unavailable](./RUNBOOKS.md#critical-database-unavailable)

```yaml
- alert: DatabaseUnavailable
  expr: up{job="postgres"} == 0
  for: 1m
  annotations:
    severity: critical
    summary: Database is down
    description: PostgreSQL connection failing for 1+ minute
```

### Redis Unavailable (Production)
- **Metric:** `gen3ia_redis_connection_failed_total > 0`
- **Threshold:** Triggered immediately
- **Duration:** 2 minutes
- **Action:** See [RUNBOOKS.md - Redis Down](./RUNBOOKS.md#critical-rediscache-down)

```yaml
- alert: RedisUnavailable
  expr: up{job="redis"} == 0
  for: 2m
  annotations:
    severity: critical
    summary: Redis cache is down
    description: Redis unreachable for 2+ minutes
```

### High Error Rate
- **Metric:** `rate(gen3ia_errors_total[5m]) > 0.05`
- **Threshold:** > 5% errors in 5 minutes
- **Duration:** 3 minutes
- **Action:** See [RUNBOOKS.md - High Error Rate](./RUNBOOKS.md#high-high-error-rate-5)

```yaml
- alert: HighErrorRate
  expr: rate(gen3ia_errors_total[5m]) > 0.05
  for: 3m
  annotations:
    severity: critical
    summary: Error rate > 5%
    description: "Error rate is {{ $value | humanizePercentage }} over last 5 minutes"
```

### API Latency Critical
- **Metric:** `histogram_quantile(0.99, gen3ia_http_request_duration_seconds) > 5`
- **Threshold:** p99 latency > 5 seconds
- **Duration:** 5 minutes
- **Action:** See [RUNBOOKS.md - High Latency](./RUNBOOKS.md#high-high-api-latency-p99--1000ms)

```yaml
- alert: HighLatencyCritical
  expr: histogram_quantile(0.99, gen3ia_http_request_duration_seconds) > 5
  for: 5m
  annotations:
    severity: critical
    summary: API p99 latency > 5s
    description: "Current p99: {{ $value | humanizeDuration }}"
```

### Payment Processing Failure
- **Metric:** `gen3ia_payment_failed_total > gen3ia_payment_success_total * 0.1`
- **Threshold:** > 10% payment failures
- **Duration:** 1 minute
- **Action:** Immediate investigation required. Notify billing team.

```yaml
- alert: PaymentProcessingFailing
  expr: rate(gen3ia_payment_failed_total[1m]) > 0.1
  for: 1m
  annotations:
    severity: critical
    summary: Payment processing failure rate critical
    description: "Failure rate: {{ $value | humanizePercentage }}"
    action: "Check Stripe API status and payment logs"
```

---

## High Priority Alerts (Page within 15 minutes)

### High Memory Usage
- **Metric:** `process_resident_memory_bytes / 1e9 > 3`
- **Threshold:** > 3GB memory
- **Duration:** 5 minutes
- **Action:** Memory leak likely. Investigate with heap snapshot.

```yaml
- alert: HighMemoryUsage
  expr: process_resident_memory_bytes > 3e9
  for: 5m
  annotations:
    severity: high
    summary: Process memory > 3GB
    description: "Memory: {{ $value | humanize }}B"
```

### Certificate Expiration Warning
- **Metric:** `ssl_cert_not_after_seconds - time() < 604800`
- **Threshold:** < 7 days
- **Duration:** Once per day at 9am
- **Action:** Renew SSL certificate before expiration.

```yaml
- alert: SSLCertificateExpiringSoon
  expr: ssl_cert_not_after_seconds - time() < 604800
  for: 1h
  annotations:
    severity: high
    summary: SSL certificate expires in < 7 days
    description: "Expires at: {{ $value | humanizeTimestamp }}"
```

### Database Query Slow
- **Metric:** `histogram_quantile(0.95, gen3ia_db_query_duration_seconds) > 1`
- **Threshold:** p95 query time > 1 second
- **Duration:** 5 minutes
- **Action:** Check for missing indexes or query optimization.

```yaml
- alert: SlowDatabaseQueries
  expr: histogram_quantile(0.95, gen3ia_db_query_duration_seconds) > 1
  for: 5m
  annotations:
    severity: high
    summary: Database queries slow
    description: "p95 latency: {{ $value | humanizeDuration }}"
```

### Circuit Breaker Open
- **Metric:** `gen3ia_circuit_breaker_state{state="open"} > 0`
- **Threshold:** Any circuit open
- **Duration:** 1 minute
- **Action:** Check external API status. See RUNBOOKS for recovery.

```yaml
- alert: CircuitBreakerOpen
  expr: gen3ia_circuit_breaker_state{state="open"} > 0
  for: 1m
  annotations:
    severity: high
    summary: "Circuit breaker OPEN: {{ $labels.service }}"
    description: "External service unavailable or failing frequently"
```

### Low Disk Space
- **Metric:** `node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15`
- **Threshold:** < 15% free disk space
- **Duration:** 5 minutes
- **Action:** Clean up old logs or increase disk size.

```yaml
- alert: LowDiskSpace
  expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15
  for: 5m
  annotations:
    severity: high
    summary: Disk space low
    description: "{{ $value | humanizePercentage }} free"
```

---

## Medium Priority Alerts

### Elevated Error Rate
- **Metric:** `rate(gen3ia_errors_total[5m]) > 0.01`
- **Threshold:** > 1% errors
- **Duration:** 10 minutes
- **Action:** Monitor and investigate root cause.

```yaml
- alert: ElevatedErrorRate
  expr: rate(gen3ia_errors_total[5m]) > 0.01
  for: 10m
  annotations:
    severity: medium
    summary: Error rate elevated at {{ $value | humanizePercentage }}
```

### API Latency High
- **Metric:** `histogram_quantile(0.95, gen3ia_http_request_duration_seconds) > 1`
- **Threshold:** p95 latency > 1 second
- **Duration:** 10 minutes
- **Action:** Check database performance and cache hit rate.

```yaml
- alert: HighLatency
  expr: histogram_quantile(0.95, gen3ia_http_request_duration_seconds) > 1
  for: 10m
  annotations:
    severity: medium
    summary: API p95 latency > 1s
```

### Queue Backed Up
- **Metric:** `gen3ia_queue_jobs_total{status="queued"} > 1000`
- **Threshold:** > 1000 jobs queued
- **Duration:** 5 minutes
- **Action:** Check BullMQ queue processor. May need to scale workers.

```yaml
- alert: QueueBackedUp
  expr: gen3ia_queue_jobs_total{status="queued"} > 1000
  for: 5m
  annotations:
    severity: medium
    summary: Queue backed up with {{ $value }} jobs
```

### Cache Hit Rate Low
- **Metric:** `gen3ia_cache_hit_rate < 0.5`
- **Threshold:** < 50% cache hits
- **Duration:** 15 minutes
- **Action:** Increase cache TTL or warm cache on startup.

```yaml
- alert: LowCacheHitRate
  expr: gen3ia_cache_hit_rate < 0.5
  for: 15m
  annotations:
    severity: medium
    summary: Cache hit rate low at {{ $value | humanizePercentage }}
```

---

## Low Priority Alerts

### Deployment in Progress
- **Annotation:** Manual notification
- **Action:** Informational - observe metrics during deployment window.

---

## Alert Routing

### Critical Alerts → Page On-Call Engineer
- Slack: #incidents (with @oncall)
- PagerDuty: High urgency (immediate)
- SMS: Phone call
- Escalate to manager after 10 minutes if unacknowledged

### High Priority → Slack Alert
- Slack: #incidents (with @team-engineering)
- Create incident ticket automatically
- Escalate to PagerDuty if not resolved in 30 minutes

### Medium Priority → Slack Channel
- Slack: #alerts (no page)
- Create ticket for follow-up
- Review in standup

### Low Priority → Metrics Dashboard
- Slack: #ops-metrics (digest hourly)
- No tickets created
- Review weekly trends

---

## Alert Notification Channels

### Slack
```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#incidents'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

### PagerDuty
```yaml
receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        description: '{{ .GroupLabels.alertname }}'
        details:
          severity: '{{ .GroupLabels.severity }}'
          summary: '{{ .Alerts.0.Annotations.summary }}'
```

### Email (For compliance audit)
```yaml
receivers:
  - name: 'email'
    email_configs:
      - to: '${ALERT_EMAIL_CRITICAL}'
        from: 'alerts@gen3ia.com'
        headers:
          Subject: '[{{ .GroupLabels.severity }}] {{ .GroupLabels.alertname }}'
```

---

## Testing Alerts

### Trigger test alert
```bash
# Send a test alert to verify routing
curl -X POST http://localhost:9093/api/v1/alerts -d '[
  {
    "labels": {
      "alertname": "TestAlert",
      "severity": "critical"
    },
    "annotations": {
      "summary": "Test alert - no action needed"
    }
  }
]'
```

### Verify alert rules
```bash
# Reload Prometheus config (without restart)
curl -X POST http://localhost:9090/-/reload

# Test PromQL query
curl 'http://localhost:9090/api/v1/query?query=up'
```

---

## Alert Maintenance

- **Review frequency:** Weekly in standup
- **Update threshold:** After incidents or performance changes
- **Sunset rule:** Remove alerts generating > 1 false positive per week
- **Documentation:** Update runbooks when alert added

---

**Last updated:** 2024-08-02  
**Maintained by:** Platform Team  
**Next review:** Monthly or after major incident
