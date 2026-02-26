/**
 * Redis-backed implementation of IPericoloStore using Upstash REST client.
 *
 * Key schema (all prefixed with "{keyPrefix}:"):
 *   {prefix}:session:{channelId}        PericoloSession JSON  — TTL = remaining session lifetime
 *   {prefix}:pool:{channelId}           ThreatPool JSON       — no TTL
 *   {prefix}:lang:{channelId}           Lang string           — no TTL
 *   {prefix}:explorer:{userId}:{ch}     ExplorerProfile JSON  — no TTL
 *   {prefix}:explorers-ch:{channelId}   Redis Set of userIds  — no TTL
 *
 * The prefix is configured via UPSTASH_REDIS_KEY_PREFIX (default: "antartica").
 * Using a per-application prefix lets multiple apps share one Upstash instance
 * without key collisions (e.g. on Fly.io shared Redis).
 *
 * Session TTL is recalculated on every write from createdAt, matching the
 * memory-store behaviour (sessions expire N hours after creation, not last update).
 */

import { Redis } from '@upstash/redis';
import type { IPericoloStore, PericoloSession, ThreatPool, ExplorerProfile } from './store-interface.js';
import type { Lang } from './i18n/index.js';
import { DEFAULT_LANG, SUPPORTED_LANGS } from './i18n/index.js';

// ---------------------------------------------------------------------------
// Minimal Redis interface — subset used by this store.
// Lets tests inject a fake without importing the full Upstash client.
// ---------------------------------------------------------------------------

export interface IRedisClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

/** Default key prefix — scopes all keys to this application. */
export const DEFAULT_KEY_PREFIX = 'antartica';

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

function makeKeys(prefix: string): {
  session: (channelId: string) => string;
  pool: (channelId: string) => string;
  lang: (channelId: string) => string;
  explorer: (userId: string, channelId: string) => string;
  explorersCh: (channelId: string) => string;
} {
  return {
    session: (channelId: string): string => `${prefix}:session:${channelId}`,
    pool: (channelId: string): string => `${prefix}:pool:${channelId}`,
    lang: (channelId: string): string => `${prefix}:lang:${channelId}`,
    explorer: (userId: string, channelId: string): string =>
      `${prefix}:explorer:${userId}:${channelId}`,
    explorersCh: (channelId: string): string => `${prefix}:explorers-ch:${channelId}`,
  };
}

// ---------------------------------------------------------------------------
// Date revival helpers
// Upstash auto-deserialises JSON, but Date fields come back as ISO strings.
// ---------------------------------------------------------------------------

function reviveSession(raw: PericoloSession & { createdAt: string | Date; updatedAt: string | Date }): PericoloSession {
  return {
    ...raw,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt),
  };
}

function revivePool(raw: ThreatPool & { updatedAt: string | Date }): ThreatPool {
  return {
    ...raw,
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt),
  };
}

function reviveProfile(raw: ExplorerProfile & { updatedAt: string | Date }): ExplorerProfile {
  return {
    ...raw,
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// RedisPericoloStore
// ---------------------------------------------------------------------------

export class RedisPericoloStore implements IPericoloStore {
  private readonly redis: IRedisClient;
  private readonly sessionTtlMs: number;
  private readonly K: ReturnType<typeof makeKeys>;

  constructor(redis: IRedisClient, sessionTtlMs: number, keyPrefix: string = DEFAULT_KEY_PREFIX) {
    this.redis = redis;
    this.sessionTtlMs = sessionTtlMs;
    this.K = makeKeys(keyPrefix);
  }

  /** No-op: Redis handles TTL and cleanup natively. */
  start(): void {}

  /** No-op: no background tasks to stop. */
  stop(): void {}

  // -- Threat pool --

  async getThreatPool(channelId: string): Promise<ThreatPool | null> {
    const raw = await this.redis.get<ThreatPool & { updatedAt: string }>(this.K.pool(channelId));
    return raw ? revivePool(raw) : null;
  }

  async setThreatPool(pool: ThreatPool): Promise<void> {
    await this.redis.set(this.K.pool(pool.channelId), pool);
  }

  async clearThreatPool(channelId: string): Promise<void> {
    await this.redis.del(this.K.pool(channelId));
  }

  // -- Session --

  async getSession(channelId: string): Promise<PericoloSession | null> {
    const raw = await this.redis.get<PericoloSession & { createdAt: string; updatedAt: string }>(
      this.K.session(channelId),
    );
    return raw ? reviveSession(raw) : null;
  }

  async setSession(session: PericoloSession): Promise<void> {
    // Recalculate TTL from createdAt so sessions always expire N hours after creation.
    const ageMs = Date.now() - new Date(session.createdAt).getTime();
    const remainingMs = this.sessionTtlMs - ageMs;
    if (remainingMs <= 0) return; // already past expiry, do not write
    const ttlSec = Math.ceil(remainingMs / 1000);
    await this.redis.set(this.K.session(session.channelId), session, { ex: ttlSec });
  }

  async deleteSession(channelId: string): Promise<boolean> {
    const count = await this.redis.del(this.K.session(channelId));
    return count > 0;
  }

  // -- Channel language --

  async getChannelLang(channelId: string): Promise<Lang> {
    const lang = await this.redis.get<string>(this.K.lang(channelId));
    if (lang && (SUPPORTED_LANGS as readonly string[]).includes(lang)) {
      return lang as Lang;
    }
    return DEFAULT_LANG;
  }

  async setChannelLang(channelId: string, lang: Lang): Promise<void> {
    await this.redis.set(this.K.lang(channelId), lang);
  }

  // -- Explorer profiles --

  async getExplorerProfile(userId: string, channelId: string): Promise<ExplorerProfile | null> {
    const raw = await this.redis.get<ExplorerProfile & { updatedAt: string }>(
      this.K.explorer(userId, channelId),
    );
    return raw ? reviveProfile(raw) : null;
  }

  async setExplorerProfile(profile: ExplorerProfile): Promise<void> {
    await this.redis.set(this.K.explorer(profile.userId, profile.channelId), profile);
    await this.redis.sadd(this.K.explorersCh(profile.channelId), profile.userId);
  }

  async clearExplorerProfile(userId: string, channelId: string): Promise<void> {
    await this.redis.del(this.K.explorer(userId, channelId));
    await this.redis.srem(this.K.explorersCh(channelId), userId);
  }

  async getExplorerProfilesForChannel(channelId: string): Promise<ExplorerProfile[]> {
    const userIds = await this.redis.smembers(this.K.explorersCh(channelId));
    if (userIds.length === 0) return [];
    const profiles = await Promise.all(
      userIds.map((userId) => this.getExplorerProfile(userId, channelId)),
    );
    return profiles.filter((p): p is ExplorerProfile => p !== null);
  }
}

// ---------------------------------------------------------------------------
// Factory helper — creates a configured Redis client from env vars.
// ---------------------------------------------------------------------------

export function createRedisClient(url: string, token: string): IRedisClient {
  return new Redis({ url, token }) as unknown as IRedisClient;
}
