/**
 * Factory that selects the storage backend based on STORAGE_BACKEND env var.
 *
 * - "memory" (default): MemoryPericoloStore — no external dependencies.
 * - "redis": RedisPericoloStore — requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */

import type { IPericoloStore } from './store-interface.js';
import { MemoryPericoloStore } from './store.js';
import { RedisPericoloStore, createRedisClient, DEFAULT_KEY_PREFIX } from './redis-store.js';
import { logger } from './logger.js';

/** Parse session TTL from SESSION_TTL_HOURS env var. Default: 6 hours. */
function parseSessionTtlMs(): number {
  const raw = process.env.SESSION_TTL_HOURS;
  if (!raw) return 6 * 60 * 60 * 1000;
  const hours = parseFloat(raw);
  if (!isFinite(hours) || hours <= 0) {
    logger.warn('invalid-session-ttl', {
      value: raw,
      message: 'SESSION_TTL_HOURS must be a positive number; falling back to 6h.',
    });
    return 6 * 60 * 60 * 1000;
  }
  return Math.floor(hours * 60 * 60 * 1000);
}

/** Create the appropriate store backend based on environment configuration. */
export function createStore(): IPericoloStore {
  const backend = (process.env.STORAGE_BACKEND ?? 'memory').toLowerCase();
  const sessionTtlMs = parseSessionTtlMs();

  if (backend === 'redis') {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      logger.warn('redis-missing-credentials', {
        message:
          'STORAGE_BACKEND=redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. ' +
          'Falling back to memory store.',
      });
      logger.info('storage-backend', { backend: 'memory', sessionTtlMs });
      return new MemoryPericoloStore(sessionTtlMs);
    }
    const keyPrefix =
      (process.env.UPSTASH_REDIS_KEY_PREFIX ?? DEFAULT_KEY_PREFIX).trim() || DEFAULT_KEY_PREFIX;
    const redis = createRedisClient(url, token);
    logger.info('storage-backend', { backend: 'redis', sessionTtlMs, keyPrefix });
    return new RedisPericoloStore(redis, sessionTtlMs, keyPrefix);
  }

  if (backend !== 'memory') {
    logger.warn('storage-backend-unknown', {
      backend,
      message: `Unknown STORAGE_BACKEND "${backend}", falling back to memory.`,
    });
  }

  logger.info('storage-backend', { backend: 'memory', sessionTtlMs });
  return new MemoryPericoloStore(sessionTtlMs);
}
