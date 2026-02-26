import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryPericoloStore } from '../src/lib/store.js';
import type { PericoloSession, ThreatPool, ExplorerProfile } from '../src/lib/store-interface.js';
import { createLabel } from '../src/lib/domain.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// MemoryPericoloStore — sessions
// ---------------------------------------------------------------------------

describe('MemoryPericoloStore — sessions', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(1000); // 1 second TTL for tests
  });

  afterEach(() => {
    store.stop();
  });

  it('stores and retrieves a session', async () => {
    const session = makeSession();
    await store.setSession(session);
    const retrieved = await store.getSession('channel-1');
    expect(retrieved).toEqual(session);
  });

  it('returns null for non-existent session', async () => {
    expect(await store.getSession('nonexistent')).toBeNull();
  });

  it('deletes a session', async () => {
    const session = makeSession();
    await store.setSession(session);
    expect(await store.deleteSession('channel-1')).toBe(true);
    expect(await store.getSession('channel-1')).toBeNull();
  });

  it('delete returns false for non-existent session', async () => {
    expect(await store.deleteSession('nonexistent')).toBe(false);
  });

  it('returns null for expired session', async () => {
    const session = makeSession({
      createdAt: new Date(Date.now() - 2000), // 2 seconds ago; TTL is 1s
    });
    await store.setSession(session);
    expect(await store.getSession('channel-1')).toBeNull();
  });

  it('tracks sessionCount', async () => {
    expect(store.sessionCount).toBe(0);
    await store.setSession(makeSession({ channelId: 'ch-a' }));
    expect(store.sessionCount).toBe(1);
    await store.setSession(makeSession({ channelId: 'ch-b' }));
    expect(store.sessionCount).toBe(2);
    await store.deleteSession('ch-a');
    expect(store.sessionCount).toBe(1);
  });

  it('updates an existing session', async () => {
    const session = makeSession();
    await store.setSession(session);
    const updated = { ...session, objective: 'Updated objective' };
    await store.setSession(updated);
    const retrieved = await store.getSession('channel-1');
    expect(retrieved?.objective).toBe('Updated objective');
  });
});

// ---------------------------------------------------------------------------
// MemoryPericoloStore — threat pools
// ---------------------------------------------------------------------------

describe('MemoryPericoloStore — threat pools', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore();
  });

  afterEach(() => {
    store.stop();
  });

  it('stores and retrieves a threat pool', async () => {
    const pool = makePool();
    await store.setThreatPool(pool);
    const retrieved = await store.getThreatPool('channel-1');
    expect(retrieved).toEqual(pool);
  });

  it('returns null for non-existent pool', async () => {
    expect(await store.getThreatPool('nonexistent-channel')).toBeNull();
  });

  it('clears a threat pool', async () => {
    const pool = makePool();
    await store.setThreatPool(pool);
    await store.clearThreatPool('channel-1');
    expect(await store.getThreatPool('channel-1')).toBeNull();
  });

  it('overwrites existing pool on set', async () => {
    const pool1 = makePool();
    await store.setThreatPool(pool1);
    const newLabel = createLabel('visione', 'Lampo');
    const pool2 = { ...pool1, labels: [newLabel] };
    await store.setThreatPool(pool2);
    const retrieved = await store.getThreatPool('channel-1');
    expect(retrieved?.labels).toHaveLength(1);
    expect(retrieved?.labels[0]?.text).toBe('Lampo');
  });

  it('stores pools per channel independently', async () => {
    await store.setThreatPool(makePool({ channelId: 'channel-A' }));
    await store.setThreatPool(makePool({ channelId: 'channel-B' }));
    expect(await store.getThreatPool('channel-A')).not.toBeNull();
    expect(await store.getThreatPool('channel-B')).not.toBeNull();
    await store.clearThreatPool('channel-A');
    expect(await store.getThreatPool('channel-A')).toBeNull();
    expect(await store.getThreatPool('channel-B')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MemoryPericoloStore — channel language
// ---------------------------------------------------------------------------

describe('MemoryPericoloStore — channel language', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore();
  });

  afterEach(() => {
    store.stop();
  });

  it('returns DEFAULT_LANG (it) when no lang is set', async () => {
    expect(await store.getChannelLang('channel-1')).toBe('it');
  });

  it('stores and retrieves a language', async () => {
    await store.setChannelLang('channel-1', 'en');
    expect(await store.getChannelLang('channel-1')).toBe('en');
  });

  it('stores languages per channel independently', async () => {
    await store.setChannelLang('channel-A', 'en');
    await store.setChannelLang('channel-B', 'it');
    expect(await store.getChannelLang('channel-A')).toBe('en');
    expect(await store.getChannelLang('channel-B')).toBe('it');
  });

  it('overwrites language on second set', async () => {
    await store.setChannelLang('channel-1', 'en');
    await store.setChannelLang('channel-1', 'it');
    expect(await store.getChannelLang('channel-1')).toBe('it');
  });
});

// ---------------------------------------------------------------------------
// MemoryPericoloStore — explorer profiles
// ---------------------------------------------------------------------------

function makeExplorerProfile(overrides?: Partial<ExplorerProfile>): ExplorerProfile {
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

describe('MemoryPericoloStore — explorer profiles', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore();
  });

  afterEach(() => {
    store.stop();
  });

  it('stores and retrieves an explorer profile', async () => {
    const profile = makeExplorerProfile();
    await store.setExplorerProfile(profile);
    const retrieved = await store.getExplorerProfile('user-1', 'channel-1');
    expect(retrieved).toEqual(profile);
  });

  it('returns null for non-existent profile', async () => {
    expect(await store.getExplorerProfile('no-user', 'channel-1')).toBeNull();
  });

  it('clears an explorer profile', async () => {
    const profile = makeExplorerProfile();
    await store.setExplorerProfile(profile);
    await store.clearExplorerProfile('user-1', 'channel-1');
    expect(await store.getExplorerProfile('user-1', 'channel-1')).toBeNull();
  });

  it('overwrites existing profile on set', async () => {
    const profile = makeExplorerProfile();
    await store.setExplorerProfile(profile);
    const updated = {
      ...profile,
      tags: [{ id: 'tag-3', type: 'risorsa' as const, text: 'Torcia' }],
    };
    await store.setExplorerProfile(updated);
    const retrieved = await store.getExplorerProfile('user-1', 'channel-1');
    expect(retrieved?.tags).toHaveLength(1);
    expect(retrieved?.tags[0]?.text).toBe('Torcia');
  });

  it('scopes profiles per user independently in the same channel', async () => {
    await store.setExplorerProfile(makeExplorerProfile({ userId: 'user-A' }));
    await store.setExplorerProfile(makeExplorerProfile({ userId: 'user-B' }));
    expect(await store.getExplorerProfile('user-A', 'channel-1')).not.toBeNull();
    expect(await store.getExplorerProfile('user-B', 'channel-1')).not.toBeNull();
    await store.clearExplorerProfile('user-A', 'channel-1');
    expect(await store.getExplorerProfile('user-A', 'channel-1')).toBeNull();
    expect(await store.getExplorerProfile('user-B', 'channel-1')).not.toBeNull();
  });

  it('scopes profiles per channel independently for the same user', async () => {
    await store.setExplorerProfile(makeExplorerProfile({ channelId: 'channel-A' }));
    await store.setExplorerProfile(makeExplorerProfile({ channelId: 'channel-B' }));
    expect(await store.getExplorerProfile('user-1', 'channel-A')).not.toBeNull();
    expect(await store.getExplorerProfile('user-1', 'channel-B')).not.toBeNull();
  });

  it('getExplorerProfilesForChannel returns all profiles in a channel', async () => {
    await store.setExplorerProfile(makeExplorerProfile({ userId: 'user-A', channelId: 'ch-x' }));
    await store.setExplorerProfile(makeExplorerProfile({ userId: 'user-B', channelId: 'ch-x' }));
    await store.setExplorerProfile(makeExplorerProfile({ userId: 'user-C', channelId: 'ch-y' }));

    const chX = await store.getExplorerProfilesForChannel('ch-x');
    expect(chX).toHaveLength(2);
    const userIds = chX.map((p) => p.userId).sort();
    expect(userIds).toEqual(['user-A', 'user-B']);

    const chY = await store.getExplorerProfilesForChannel('ch-y');
    expect(chY).toHaveLength(1);
  });

  it('getExplorerProfilesForChannel returns empty array if no profiles', async () => {
    const result = await store.getExplorerProfilesForChannel('nonexistent-channel');
    expect(result).toEqual([]);
  });
});
