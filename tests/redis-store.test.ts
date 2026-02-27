/**
 * Tests for RedisPericoloStore.
 *
 * Uses a FakeRedis that mimics Upstash JSON serialisation/deserialisation:
 *   - set(): stores JSON.stringify(value)
 *   - get(): returns JSON.parse(stored), so Date fields come back as ISO strings
 * This exercises the date-revival logic in the store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RedisPericoloStore, DEFAULT_KEY_PREFIX } from '../src/lib/redis-store.js';
import type { IRedisClient } from '../src/lib/redis-store.js';
import type { PericoloSession, ThreatPool, ExplorerProfile } from '../src/lib/store-interface.js';
import { createLabel } from '../src/lib/domain.js';

// ---------------------------------------------------------------------------
// FakeRedis — in-memory store with JSON round-trip and TTL simulation
// ---------------------------------------------------------------------------

class FakeRedis implements IRedisClient {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private sets = new Map<string, Set<string>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, opts?: { ex: number }): Promise<'OK'> {
    const expiresAt = opts?.ex !== undefined ? Date.now() + opts.ex * 1000 : undefined;
    this.store.set(key, { value: JSON.stringify(value), expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }

  async sadd(key: string, member: string): Promise<number> {
    let s = this.sets.get(key);
    if (!s) {
      s = new Set();
      this.sets.set(key, s);
    }
    const existed = s.has(member);
    s.add(member);
    return existed ? 0 : 1;
  }

  async srem(key: string, member: string): Promise<number> {
    const s = this.sets.get(key);
    if (!s) return 0;
    return s.delete(member) ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

function makeStore(ttlMs = SESSION_TTL_MS): { store: RedisPericoloStore; fake: FakeRedis } {
  const fake = new FakeRedis();
  const store = new RedisPericoloStore(fake, ttlMs);
  return { store, fake };
}

function makeSession(overrides?: Partial<PericoloSession>): PericoloSession {
  const label = createLabel('tratto', 'Coraggio');
  return {
    sessionId: 'session-1',
    channelId: 'channel-1',
    guildId: 'guild-1',
    guideId: 'user-guide',
    guideName: 'Guide User',
    objective: 'Test objective',
    bag: [label],
    allLabels: [label],
    baseDraws: [],
    pushDraws: [],
    threatPoolAdded: false,
    conditionsAdded: false,
    resignationsAdded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePool(overrides?: Partial<ThreatPool>): ThreatPool {
  return {
    channelId: 'channel-1',
    labels: [createLabel('minaccia', 'Mostro'), createLabel('visione', 'Oscurità')],
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProfile(overrides?: Partial<ExplorerProfile>): ExplorerProfile {
  return {
    userId: 'user-1',
    channelId: 'channel-1',
    tags: [
      { id: 'tag-1', type: 'tratto-nome', text: 'Alice' },
      { id: 'tag-2', type: 'condizione', text: 'Stanca' },
    ],
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe('RedisPericoloStore — sessions', () => {
  let store: RedisPericoloStore;

  beforeEach(() => {
    ({ store } = makeStore());
  });

  it('stores and retrieves a session', async () => {
    const session = makeSession();
    await store.setSession(session);
    const retrieved = await store.getSession('channel-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sessionId).toBe('session-1');
    expect(retrieved?.objective).toBe('Test objective');
  });

  it('revives createdAt and updatedAt as Date instances', async () => {
    const session = makeSession();
    await store.setSession(session);
    const retrieved = await store.getSession('channel-1');
    expect(retrieved?.createdAt).toBeInstanceOf(Date);
    expect(retrieved?.updatedAt).toBeInstanceOf(Date);
  });

  it('returns null for non-existent session', async () => {
    expect(await store.getSession('nonexistent')).toBeNull();
  });

  it('deletes a session and returns true', async () => {
    await store.setSession(makeSession());
    expect(await store.deleteSession('channel-1')).toBe(true);
    expect(await store.getSession('channel-1')).toBeNull();
  });

  it('delete returns false for non-existent session', async () => {
    expect(await store.deleteSession('nonexistent')).toBe(false);
  });

  it('updates an existing session', async () => {
    const session = makeSession();
    await store.setSession(session);
    await store.setSession({ ...session, objective: 'Updated' });
    expect((await store.getSession('channel-1'))?.objective).toBe('Updated');
  });

  it('does not write a session that is already expired (remainingMs <= 0)', async () => {
    const { store: s } = makeStore(1000); // 1 s TTL
    const old = makeSession({ createdAt: new Date(Date.now() - 2000) }); // 2 s ago
    await s.setSession(old);
    expect(await s.getSession('channel-1')).toBeNull();
  });

  it('sets a TTL on the Redis key proportional to remaining session lifetime', async () => {
    const { store: s, fake } = makeStore(10_000); // 10 s TTL
    const session = makeSession({ createdAt: new Date(Date.now() - 5_000) }); // 5 s old
    await s.setSession(session);
    // Redis TTL should be ~5 s; FakeRedis entry should expire within 6 s
    const retrieved = await fake.get<PericoloSession>(`${DEFAULT_KEY_PREFIX}:session:channel-1`);
    expect(retrieved).not.toBeNull();
  });

  it('start/stop are no-ops (do not throw)', () => {
    expect(() => {
      store.start();
    }).not.toThrow();
    expect(() => {
      store.stop();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Threat pools
// ---------------------------------------------------------------------------

describe('RedisPericoloStore — threat pools', () => {
  let store: RedisPericoloStore;

  beforeEach(() => {
    ({ store } = makeStore());
  });

  it('stores and retrieves a threat pool', async () => {
    const pool = makePool();
    await store.setThreatPool(pool);
    const retrieved = await store.getThreatPool('channel-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.labels).toHaveLength(2);
  });

  it('revives updatedAt as Date instance', async () => {
    await store.setThreatPool(makePool());
    const retrieved = await store.getThreatPool('channel-1');
    expect(retrieved?.updatedAt).toBeInstanceOf(Date);
  });

  it('returns null for non-existent pool', async () => {
    expect(await store.getThreatPool('nonexistent')).toBeNull();
  });

  it('clears a threat pool', async () => {
    await store.setThreatPool(makePool());
    await store.clearThreatPool('channel-1');
    expect(await store.getThreatPool('channel-1')).toBeNull();
  });

  it('overwrites existing pool on set', async () => {
    await store.setThreatPool(makePool());
    const updated = makePool({ labels: [createLabel('visione', 'Lampo')] });
    await store.setThreatPool(updated);
    const retrieved = await store.getThreatPool('channel-1');
    expect(retrieved?.labels).toHaveLength(1);
    expect(retrieved?.labels[0]?.text).toBe('Lampo');
  });

  it('scopes pools per channel independently', async () => {
    await store.setThreatPool(makePool({ channelId: 'ch-A' }));
    await store.setThreatPool(makePool({ channelId: 'ch-B' }));
    await store.clearThreatPool('ch-A');
    expect(await store.getThreatPool('ch-A')).toBeNull();
    expect(await store.getThreatPool('ch-B')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Channel language
// ---------------------------------------------------------------------------

describe('RedisPericoloStore — channel language', () => {
  let store: RedisPericoloStore;

  beforeEach(() => {
    ({ store } = makeStore());
  });

  it('returns DEFAULT_LANG (it) when no lang is set', async () => {
    expect(await store.getChannelLang('channel-1')).toBe('it');
  });

  it('stores and retrieves a language', async () => {
    await store.setChannelLang('channel-1', 'en');
    expect(await store.getChannelLang('channel-1')).toBe('en');
  });

  it('scopes languages per channel independently', async () => {
    await store.setChannelLang('ch-A', 'en');
    await store.setChannelLang('ch-B', 'it');
    expect(await store.getChannelLang('ch-A')).toBe('en');
    expect(await store.getChannelLang('ch-B')).toBe('it');
  });

  it('overwrites language on second set', async () => {
    await store.setChannelLang('channel-1', 'en');
    await store.setChannelLang('channel-1', 'it');
    expect(await store.getChannelLang('channel-1')).toBe('it');
  });

  it('falls back to DEFAULT_LANG for unknown stored value', async () => {
    // Simulate a corrupted / unknown lang value in Redis
    const { store: s, fake } = makeStore();
    await fake.set('apb:lang:channel-1', '"zz"');
    expect(await s.getChannelLang('channel-1')).toBe('it');
  });
});

// ---------------------------------------------------------------------------
// Explorer profiles
// ---------------------------------------------------------------------------

describe('RedisPericoloStore — explorer profiles', () => {
  let store: RedisPericoloStore;

  beforeEach(() => {
    ({ store } = makeStore());
  });

  it('stores and retrieves an explorer profile', async () => {
    const profile = makeProfile();
    await store.setExplorerProfile(profile);
    const retrieved = await store.getExplorerProfile('user-1', 'channel-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.tags).toHaveLength(2);
  });

  it('revives updatedAt as Date instance', async () => {
    await store.setExplorerProfile(makeProfile());
    const retrieved = await store.getExplorerProfile('user-1', 'channel-1');
    expect(retrieved?.updatedAt).toBeInstanceOf(Date);
  });

  it('returns null for non-existent profile', async () => {
    expect(await store.getExplorerProfile('no-user', 'channel-1')).toBeNull();
  });

  it('clears a profile', async () => {
    await store.setExplorerProfile(makeProfile());
    await store.clearExplorerProfile('user-1', 'channel-1');
    expect(await store.getExplorerProfile('user-1', 'channel-1')).toBeNull();
  });

  it('overwrites existing profile on set', async () => {
    await store.setExplorerProfile(makeProfile());
    const updated = makeProfile({ tags: [{ id: 't3', type: 'risorsa', text: 'Torcia' }] });
    await store.setExplorerProfile(updated);
    expect((await store.getExplorerProfile('user-1', 'channel-1'))?.tags).toHaveLength(1);
  });

  it('scopes profiles per user in the same channel', async () => {
    await store.setExplorerProfile(makeProfile({ userId: 'user-A' }));
    await store.setExplorerProfile(makeProfile({ userId: 'user-B' }));
    await store.clearExplorerProfile('user-A', 'channel-1');
    expect(await store.getExplorerProfile('user-A', 'channel-1')).toBeNull();
    expect(await store.getExplorerProfile('user-B', 'channel-1')).not.toBeNull();
  });

  it('scopes profiles per channel for the same user', async () => {
    await store.setExplorerProfile(makeProfile({ channelId: 'ch-A' }));
    await store.setExplorerProfile(makeProfile({ channelId: 'ch-B' }));
    expect(await store.getExplorerProfile('user-1', 'ch-A')).not.toBeNull();
    expect(await store.getExplorerProfile('user-1', 'ch-B')).not.toBeNull();
  });

  it('getExplorerProfilesForChannel returns all profiles in a channel', async () => {
    await store.setExplorerProfile(makeProfile({ userId: 'user-A', channelId: 'ch-x' }));
    await store.setExplorerProfile(makeProfile({ userId: 'user-B', channelId: 'ch-x' }));
    await store.setExplorerProfile(makeProfile({ userId: 'user-C', channelId: 'ch-y' }));

    const chX = await store.getExplorerProfilesForChannel('ch-x');
    expect(chX).toHaveLength(2);
    expect(chX.map((p) => p.userId).sort()).toEqual(['user-A', 'user-B']);

    const chY = await store.getExplorerProfilesForChannel('ch-y');
    expect(chY).toHaveLength(1);
  });

  it('getExplorerProfilesForChannel returns empty array if no profiles', async () => {
    expect(await store.getExplorerProfilesForChannel('nonexistent')).toEqual([]);
  });

  it('getExplorerProfilesForChannel excludes cleared profiles', async () => {
    await store.setExplorerProfile(makeProfile({ userId: 'user-A', channelId: 'ch-x' }));
    await store.setExplorerProfile(makeProfile({ userId: 'user-B', channelId: 'ch-x' }));
    await store.clearExplorerProfile('user-A', 'ch-x');
    const results = await store.getExplorerProfilesForChannel('ch-x');
    expect(results).toHaveLength(1);
    expect(results[0]?.userId).toBe('user-B');
  });
});

// ---------------------------------------------------------------------------
// Key prefix
// ---------------------------------------------------------------------------

describe('RedisPericoloStore — key prefix', () => {
  it('DEFAULT_KEY_PREFIX is "antartica"', () => {
    expect(DEFAULT_KEY_PREFIX).toBe('antartica');
  });

  it('uses default prefix "antartica" when no prefix is supplied', async () => {
    const fake = new FakeRedis();
    const store = new RedisPericoloStore(fake, SESSION_TTL_MS);
    await store.setSession(makeSession());
    expect(await fake.get(`antartica:session:channel-1`)).not.toBeNull();
  });

  it('uses a custom prefix when supplied', async () => {
    const fake = new FakeRedis();
    const store = new RedisPericoloStore(fake, SESSION_TTL_MS, 'myapp');
    await store.setSession(makeSession());
    expect(await fake.get('myapp:session:channel-1')).not.toBeNull();
    // default prefix key must NOT be written
    expect(await fake.get('antartica:session:channel-1')).toBeNull();
  });

  it('two stores with different prefixes are isolated on the same FakeRedis', async () => {
    const fake = new FakeRedis();
    const storeA = new RedisPericoloStore(fake, SESSION_TTL_MS, 'app-a');
    const storeB = new RedisPericoloStore(fake, SESSION_TTL_MS, 'app-b');

    await storeA.setSession(makeSession({ sessionId: 'session-a' }));
    await storeB.setSession(makeSession({ sessionId: 'session-b' }));

    expect((await storeA.getSession('channel-1'))?.sessionId).toBe('session-a');
    expect((await storeB.getSession('channel-1'))?.sessionId).toBe('session-b');

    await storeA.deleteSession('channel-1');
    expect(await storeA.getSession('channel-1')).toBeNull();
    // storeB session must be unaffected
    expect((await storeB.getSession('channel-1'))?.sessionId).toBe('session-b');
  });

  it('prefix isolation applies to threat pools', async () => {
    const fake = new FakeRedis();
    const storeA = new RedisPericoloStore(fake, SESSION_TTL_MS, 'app-a');
    const storeB = new RedisPericoloStore(fake, SESSION_TTL_MS, 'app-b');

    await storeA.setThreatPool(makePool());
    expect(await storeB.getThreatPool('channel-1')).toBeNull();
  });

  it('prefix isolation applies to explorer profiles', async () => {
    const fake = new FakeRedis();
    const storeA = new RedisPericoloStore(fake, SESSION_TTL_MS, 'app-a');
    const storeB = new RedisPericoloStore(fake, SESSION_TTL_MS, 'app-b');

    await storeA.setExplorerProfile(makeProfile());
    expect(await storeB.getExplorerProfile('user-1', 'channel-1')).toBeNull();
    // channel index must also be isolated
    expect(await storeB.getExplorerProfilesForChannel('channel-1')).toEqual([]);
  });
});
