import Redis from 'ioredis';

const getRedisUrl = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not defined');
  }
  return url;
};

export const redis = new Redis(getRedisUrl(), {
  retryStrategy: (times) => {
    // Exponential backoff : 100ms, 200ms, 400ms... max 30s
    const delay = Math.min(100 * Math.pow(2, times), 30000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  commandTimeout: 5000,
});

// Événements de logging
redis.on('error', (err) => {
  console.error('[Redis] Error:', err);
});
redis.on('connect', () => {
  console.log('[Redis] Connected');
});
redis.on('ready', () => {
  console.log('[Redis] Ready');
});
