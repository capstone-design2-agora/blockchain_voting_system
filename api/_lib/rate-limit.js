import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { RateLimitError } from "./errors.js";

const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const upstashLimiterCache = new Map();

const localBuckets = new Map();

export async function enforceRateLimit(identifier, { limit = 5, windowSeconds = 300 } = {}) {
  if (!identifier) return;

  if (hasUpstash) {
    const limiterKey = `${limit}:${windowSeconds}`;
    if (!upstashLimiterCache.has(limiterKey)) {
      upstashLimiterCache.set(
        limiterKey,
        new Ratelimit({
          redis: Redis.fromEnv(),
          limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
          prefix: "email-verification",
          analytics: true
        })
      );
    }
    const limiter = upstashLimiterCache.get(limiterKey);
    const result = await limiter.limit(identifier);
    if (!result.success) {
      throw new RateLimitError("Too many requests", new Date(result.reset * 1000).toISOString());
    }
    return result;
  }

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = localBuckets.get(identifier);

  if (!existing || existing.expiresAt <= now) {
    localBuckets.set(identifier, { count: 1, expiresAt: now + windowMs });
    return { success: true, remaining: limit - 1, reset: Math.floor((now + windowMs) / 1000) };
  }

  if (existing.count >= limit) {
    throw new RateLimitError("Too many requests", new Date(existing.expiresAt).toISOString());
  }

  existing.count += 1;
  return { success: true, remaining: limit - existing.count, reset: Math.floor(existing.expiresAt / 1000) };
}
