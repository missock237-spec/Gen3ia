import Redis from 'ioredis'

interface RateLimitOptions {
  max: number
  windowMs: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

interface MemoryEntry {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, MemoryEntry>()

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    })
  : null

if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt < now) {
        memoryStore.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

async function getRedisClient(): Promise<Redis | null> {
  if (!redis) return null

  if (redis.status === 'wait') {
    await redis.connect()
  }

  return redis
}

async function rateLimitMemory(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const now = Date.now()
  const entry = memoryStore.get(key)

  if (!entry || entry.resetAt < now) {
    const resetAt = now + options.windowMs
    memoryStore.set(key, { count: 1, resetAt })
    return {
      success: true,
      remaining: options.max - 1,
      resetAt,
    }
  }

  if (entry.count >= options.max) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }

  entry.count += 1

  return {
    success: true,
    remaining: Math.max(options.max - entry.count, 0),
    resetAt: entry.resetAt,
  }
}

export async function rateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const client = await getRedisClient().catch(() => null)

  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required in production for rate limiting')
    }
    return rateLimitMemory(key, options)
  }

  const now = Date.now()
  const redisKey = `rl:${key}`

  const tx = client.multi()
  tx.incr(redisKey)
  tx.pexpire(redisKey, options.windowMs, 'NX')
  tx.pttl(redisKey)

  const result = await tx.exec()

  const count = Number(result?.[0]?.[1] ?? 0)
  const ttl = Number(result?.[2]?.[1] ?? options.windowMs)
  const resetAt = now + Math.max(ttl, 0)

  if (count > options.max) {
    return {
      success: false,
      remaining: 0,
      resetAt,
    }
  }

  return {
    success: true,
    remaining: Math.max(options.max - count, 0),
    resetAt,
  }
}
