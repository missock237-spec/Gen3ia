# Gen3ia API Documentation

## Overview

The Gen3ia API provides programmatic access to agent management, execution, and monitoring. All endpoints require authentication and support multiple versions for backward compatibility.

## Base URL

```
Production: https://api.gen3ia.com
Development: http://localhost:3000
```

## Authentication

All API endpoints (except `/health` and `/metrics`) require authentication via:

### 1. API Key (Service-to-Service)

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.gen3ia.com/api/v1/agents
```

### 2. JWT Token (User Sessions)

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.gen3ia.com/api/v1/agents
```

Get JWT token via `/auth/login`:
```bash
curl -X POST https://api.gen3ia.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'
```

## API Versions

### v1 (Stable)
- Baseline implementation
- Full agent CRUD operations
- Basic execution management
- Standard rate limiting (100 req/min)

### v2 (Stable)
- Enhanced authentication
- Improved error handling
- Advanced rate limiting (500 req/min)
- New endpoints for analytics

### v3 (Beta)
- Async execution with WebSockets
- Streaming responses
- Enhanced monitoring
- Contact support for early access

## Endpoints

### Health & Status

#### GET /api/health
Check application health.

**Request:**
```bash
curl https://api.gen3ia.com/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Detailed Report (Admin only):**
```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "https://api.gen3ia.com/api/health?detailed=true"
```

### Metrics

#### GET /api/metrics
Get Prometheus metrics (requires `METRICS_API_KEY`).

**Request:**
```bash
curl -H "X-API-Key: YOUR_METRICS_KEY" \
  https://api.gen3ia.com/api/metrics
```

**Response:** Plain text Prometheus format

## Rate Limiting

All requests include rate limit information in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705324200
```

When rate limited (HTTP 429):
```json
{
  "error": "Too many requests",
  "retryAfter": 60
}
```

### Limits by Endpoint

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/login` | 5 | 15 min |
| `/agents/*` | 100 | 1 min |
| `/execute` | 30 | 1 min |
| `/billing/*` | 10 | 1 hour |

## Error Handling

All errors follow standard HTTP status codes:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Rate Limited |
| 500 | Server Error |
| 503 | Service Unavailable |

## Request/Response Format

### Request Headers

```
Content-Type: application/json
Authorization: Bearer TOKEN
X-Correlation-ID: optional-correlation-id
X-Request-ID: optional-request-id
```

### Response Headers

```
Content-Type: application/json
X-API-Version: v1
X-API-Status: stable
X-Correlation-ID: correlation-id-from-request
X-Request-ID: request-id-from-request
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705324200
```

### Deprecation Headers

Deprecated endpoints include:

```
Deprecation: true
Warning: deprecated="v1", sunset="2024-12-31T00:00:00Z", link="<https://docs.gen3ia.com/migration>; rel=\"deprecation\""
```

## Pagination

List endpoints support pagination:

```bash
curl "https://api.gen3ia.com/api/v1/agents?page=2&limit=20"
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

## Webhooks

Subscribe to events via webhooks:

```bash
POST /api/v1/webhooks
{
  "url": "https://your-server.com/webhook",
  "events": ["agent.created", "agent.executed"],
  "retries": 3
}
```

### Webhook Events

- `agent.created`
- `agent.updated`
- `agent.executed`
- `agent.failed`
- `billing.invoice_created`

## Client Libraries

### JavaScript/TypeScript

```javascript
import { Gen3iaClient } from '@gen3ia/client';

const client = new Gen3iaClient({
  apiKey: 'YOUR_API_KEY',
  baseUrl: 'https://api.gen3ia.com'
});

const agents = await client.agents.list();
```

### Python

```python
from gen3ia import Client

client = Client(api_key='YOUR_API_KEY')
agents = client.agents.list()
```

### cURL

See examples throughout this documentation.

## Best Practices

### 1. Use Correlation IDs

Include `X-Correlation-ID` header to track requests:

```bash
curl -H "X-Correlation-ID: req-12345" \
  https://api.gen3ia.com/api/v1/agents
```

### 2. Implement Exponential Backoff

For rate-limited requests:

```
Wait: 1s, 2s, 4s, 8s, 16s...
```

### 3. Cache Responses

Use appropriate `Cache-Control` headers:

```
GET /api/v1/agents/static-list
Cache-Control: public, max-age=3600
```

### 4. Monitor Health

Periodically check `/api/health`:

```bash
# Every 30 seconds
curl https://api.gen3ia.com/api/health
```

### 5. Version Your Calls

Always specify API version:

```
❌ /api/agents
✅ /api/v1/agents
✅ /api/v2/agents
```

## Support

- Documentation: https://docs.gen3ia.com
- Status: https://status.gen3ia.com
- Email: support@gen3ia.com
- Issues: https://github.com/missock237-spec/Gen3ia/issues
