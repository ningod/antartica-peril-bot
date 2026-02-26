/**
 * Antartica — Peril Bot
 * Entry point.
 *
 * Selects gateway or HTTP mode based on INTERACTIONS_MODE env var.
 */

import dotenv from 'dotenv';
import { createStore } from './lib/store-factory.js';
import { RateLimiter } from './lib/ratelimit.js';
import { logger } from './lib/logger.js';

dotenv.config();

const store = createStore();
const limiter = new RateLimiter(5, 10_000); // 5 actions per 10 seconds

const mode = (process.env.INTERACTIONS_MODE ?? 'gateway').toLowerCase();

if (mode === 'http') {
  if ((process.env.STORAGE_BACKEND ?? 'memory').toLowerCase() === 'memory') {
    logger.warn('http-memory-store', {
      message:
        'HTTP mode with memory storage: sessions will not persist across restarts. ' +
        'Consider STORAGE_BACKEND=redis for production.',
    });
  }

  store.start();

  const { startHttpServer } = await import('./http/server.js');
  const server = startHttpServer(store, limiter);

  async function shutdown(): Promise<void> {
    logger.info('shutdown', { mode: 'http' });
    store.stop();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
} else {
  if (mode !== 'gateway') {
    logger.warn('unknown-mode', {
      mode,
      message: `Unknown INTERACTIONS_MODE "${mode}", falling back to gateway.`,
    });
  }

  const { startGateway } = await import('./modes/gateway.js');
  const client = startGateway(store, limiter);

  async function shutdown(): Promise<void> {
    logger.info('shutdown', { mode: 'gateway' });
    store.stop();
    await client.destroy();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
