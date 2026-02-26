/**
 * Factory that selects the storage backend based on STORAGE_BACKEND env var.
 *
 * - "memory" (default): MemoryPericoloStore — no external dependencies.
 * - "redis": RedisPericoloStore — requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 *   (Not yet implemented; placeholder for future extension.)
 */

import type { IPericoloStore } from './store-interface.js';
import { MemoryPericoloStore } from './store.js';
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
    // Redis support is planned but not yet implemented.
    // Fall back to memory with a warning so the bot still starts.
    logger.warn('redis-not-implemented', {
      message:
        'STORAGE_BACKEND=redis is not yet implemented for antartica-peril-bot. ' +
        'Falling back to memory store. Sessions will not persist across restarts.',
    });
    logger.info('storage-backend', { backend: 'memory', sessionTtlMs });
    return new MemoryPericoloStore(sessionTtlMs);
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
