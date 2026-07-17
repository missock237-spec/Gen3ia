// Rate Limiting - 100 requetes/min par utilisateur
const rateMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string, maxReq = 100, windowMs = 60000): { ok: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateMap.get(userId);
  
  if (!entry || now > entry.resetAt) {
    rateMap.set(userId, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxReq - 1 };
  }
  
  entry.count++;
  if (entry.count > maxReq) {
    return { ok: false, remaining: 0 };
  }
  
  return { ok: true, remaining: maxReq - entry.count };
}

export function getRateLimitStatus(userId: string): { remaining: number; resetAt: number } {
  const entry = rateMap.get(userId);
  if (!entry) return { remaining: 100, resetAt: Date.now() + 60000 };
  return { remaining: Math.max(0, 100 - entry.count), resetAt: entry.resetAt };
}