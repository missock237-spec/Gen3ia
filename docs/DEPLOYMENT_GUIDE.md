# Deployment & Setup Guide

Complete guide for deploying the advanced audio/voice/image system to production.

## Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Hugging Face account (free)
- Vercel account (optional, for hosting)

## Local Development Setup

### 1. Install Dependencies

```bash
npm install @huggingface/inference
npm install prisma @prisma/client
```

### 2. Environment Configuration

Create `.env.local`:

```env
# Hugging Face
HUGGINGFACE_API_KEY=hf_your_api_key_here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/voice_audio_db

# Node
NODE_ENV=development

# Optional: Vercel
VERCEL_PROJECT_ID=your_project_id
```

### 3. Database Setup

```bash
# Create database
createdb voice_audio_db

# Run migrations
npx prisma db push

# Generate Prisma client
npx prisma generate

# (Optional) Seed database
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run dev
```

Access at `http://localhost:3000`

## Getting Hugging Face API Key

1. Go to https://huggingface.co/
2. Sign up (free) or log in
3. Click profile → Settings → Access Tokens
4. Click "New token"
5. Name it "Audio Voice System"
6. Select "read" access
7. Copy the token
8. Add to `.env.local` as `HUGGINGFACE_API_KEY`

## Production Deployment

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Set environment variables
vercel env add HUGGINGFACE_API_KEY
vercel env add DATABASE_URL

# Redeploy with env vars
vercel --prod
```

### Option 2: Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy files
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Build app
RUN npm run build

# Migrations
RUN npx prisma db push

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t voice-system .
docker run -p 3000:3000 \
  -e HUGGINGFACE_API_KEY=your_key \
  -e DATABASE_URL=postgresql://... \
  voice-system
```

### Option 3: Traditional Server (Ubuntu/Debian)

```bash
# SSH into server
ssh user@your-server.com

# Install Node
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Clone repository
git clone your-repo-url
cd your-repo

# Setup environment
echo "HUGGINGFACE_API_KEY=..." > .env.local
echo "DATABASE_URL=..." >> .env.local

# Install dependencies
npm install --production

# Build
npm run build

# Run migrations
npx prisma db push

# Start with PM2
npm i -g pm2
pm2 start npm --name "voice-system" -- start
pm2 save
```

## Database Backup & Recovery

### PostgreSQL Backup

```bash
# Create backup
pg_dump voice_audio_db > backup.sql

# Restore from backup
psql voice_audio_db < backup.sql
```

### Cloud Backup (Vercel Postgres)

```bash
# Using Vercel CLI
vercel env pull .env.production.local

# Then use Prisma for backups
npx prisma db execute --stdin < backup.sql
```

## Monitoring & Logging

### Application Logs

```bash
# View logs (Vercel)
vercel logs

# View logs (PM2)
pm2 logs voice-system

# View logs (Docker)
docker logs container-id
```

### Performance Monitoring

```typescript
// Add to API routes
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Your code
    const duration = Date.now() - startTime;
    console.log(`[PERF] Operation took ${duration}ms`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ERROR]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

### Database Monitoring

```bash
# Check database size
SELECT pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
WHERE datname = 'voice_audio_db';

# Check slow queries
SET log_min_duration_statement = 1000; -- Log queries > 1s
```

## Performance Optimization

### 1. Caching Strategy

```typescript
// Cache voice profiles
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 600 }); // 10 minutes

export async function getVoiceProfile(userId: string) {
  const cacheKey = `profile-${userId}`;
  const cached = cache.get(cacheKey);
  
  if (cached) return cached;
  
  const profile = await db.voiceProfile.findUnique({
    where: { userId },
  });
  
  cache.set(cacheKey, profile);
  return profile;
}
```

### 2. Database Indexing

Indexes already configured in schema:

```prisma
@@index([userId, isDefault])
@@index([fingerprintId])
@@index([userId, voiceProfileId])
@@index([language])
@@index([detectedEmotion])
```

### 3. API Rate Limiting

```typescript
import { RateLimit } from 'async-rate-limiter';

const limiter = new RateLimit({
  interval: 60 * 1000, // 1 minute
  maxInInterval: 30, // Max 30 requests per minute
});

export async function POST(request: NextRequest) {
  await limiter.removeTokens(1);
  // Your code
}
```

### 4. Image Optimization

```typescript
// Compress generated images
import sharp from 'sharp';

const buffer = await generateImage(options);
const optimized = await sharp(buffer.image)
  .resize(512, 512, { fit: 'cover' })
  .webp({ quality: 80 })
  .toBuffer();
```

## Security Hardening

### 1. Environment Variables

```bash
# Never commit .env files
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore
```

### 2. API Key Rotation

```bash
# Rotate Hugging Face API key quarterly
# 1. Generate new key in Hugging Face settings
# 2. Update in Vercel/Server
# 3. Test endpoints
# 4. Delete old key
```

### 3. Database Security

```sql
-- Create read-only user for backups
CREATE USER backup_user WITH PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;

-- Encrypt sensitive data
CREATE EXTENSION pgcrypto;
ALTER TABLE voice_recording ADD COLUMN audio_encrypted BYTEA;
```

### 4. CORS Configuration

```typescript
// next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ALLOWED_ORIGINS || '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
        ],
      },
    ];
  },
};
```

## Troubleshooting Production Issues

### Issue: "Cannot connect to database"

```bash
# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check credentials
# Verify DATABASE_URL format:
# postgresql://user:password@host:port/dbname
```

### Issue: "Hugging Face API quota exceeded"

```bash
# Check Hugging Face usage
# https://huggingface.co/account-settings/billing/overview

# Implement request queuing
import Queue from 'bull';
const ttQueue = new Queue('text-to-speech');

ttQueue.process(async (job) => {
  return await synthesizeText(job.data.text);
});
```

### Issue: "High memory usage"

```typescript
// Clear old voice recordings
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

await db.voiceRecording.deleteMany({
  where: {
    createdAt: { lt: thirtyDaysAgo }
  }
});
```

### Issue: "Slow image generation"

```typescript
// Implement background job processing
import Bull from 'bull';

const imageQueue = new Bull('image-generation');

// Queue job
imageQueue.add({ prompt, userId }, { delay: 1000 });

// Process jobs
imageQueue.process(async (job) => {
  return await generateImage(job.data);
});

// Get result
const job = await imageQueue.getJob(jobId);
if (job.isCompleted()) {
  return await job.progress();
}
```

## Backup & Disaster Recovery

### Daily Backups

```bash
# Create backup script (backup.sh)
#!/bin/bash

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_$DATE.sql"

pg_dump $DATABASE_URL > $BACKUP_FILE
gzip $BACKUP_FILE

# Upload to S3
aws s3 cp $BACKUP_FILE.gz s3://your-bucket/backups/

# Keep only last 30 days
find . -name "backup_*.sql.gz" -mtime +30 -delete
```

### Recovery Procedure

```bash
# 1. Stop application
pm2 stop voice-system

# 2. Restore database
gunzip backup_20240101_120000.sql.gz
psql $DATABASE_URL < backup_20240101_120000.sql

# 3. Run migrations
npx prisma migrate deploy

# 4. Start application
pm2 start voice-system
```

## Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Load test voice endpoints
ab -n 1000 -c 10 http://your-server/api/health

# Use k6 for complex scenarios
# https://k6.io/

# Load test voice generation
k6 run loadtest.js
```

loadtest.js:
```javascript
import http from 'k6/http';
import { check } from 'k6';

export default function () {
  const url = 'http://your-server/api/voice/synthesize';
  const payload = JSON.stringify({
    text: 'Hello world',
    emotion: 'happy',
  });
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(url, payload, params);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });
}
```

## Scaling Considerations

### Horizontal Scaling

```bash
# Deploy multiple instances
# Behind load balancer (nginx)

upstream voice_system {
  server app1:3000;
  server app2:3000;
  server app3:3000;
}

server {
  listen 80;
  location / {
    proxy_pass http://voice_system;
  }
}
```

### Caching Layer

```bash
# Add Redis for caching
docker run -d -p 6379:6379 redis:latest

# Use in application
import Redis from 'ioredis';
const redis = new Redis();
```

## Maintenance Schedule

**Daily:**
- Monitor error logs
- Check API usage
- Verify database connectivity

**Weekly:**
- Review performance metrics
- Update dependencies (security patches)
- Test backup restoration

**Monthly:**
- Full system backup
- Database optimization (VACUUM ANALYZE)
- Security audit
- Capacity planning

**Quarterly:**
- Rotate API keys
- Review and update security policies
- Performance tuning
- User feedback review

## Support & Debugging

For issues, check:
1. Error logs: `vercel logs` or PM2 logs
2. Database connection: `psql $DATABASE_URL`
3. Hugging Face status: https://status.huggingface.co/
4. Network connectivity: `curl -I https://api-inference.huggingface.co/`

Contact: Open an issue or check documentation files.
