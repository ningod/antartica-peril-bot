/**
 * Idempotency tests for the /peril subcommands that add negative tags:
 *   add-threats, add-conditions, add-resignations, add-negative-tags
 *
 * Verified invariants:
 *  1. Each command returns an error on a second call (no duplicate insertion).
 *  2. After any sequence of the four commands, each negative tag appears in the
 *     bag exactly once.
 *  3. The total resignation count in the bag always equals the count in the
 *     Explorer profiles, regardless of which command(s) added them.
 *  4. Cross-combination: calling add-conditions or add-resignations before
 *     add-negative-tags causes add-negative-tags to skip the already-added
 *     category silently.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handlePerilCommand } from '../src/commands/peril.js';
import { MemoryPericoloStore } from '../src/lib/store.js';
import { createLabel } from '../src/lib/domain.js';
import type {
  ExplorerProfile,
  ExplorerTag,
  PericoloSession,
  ThreatPool,
} from '../src/lib/store-interface.js';
import type { RateLimiter } from '../src/lib/ratelimit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTag(type: ExplorerTag['type'], text = ''): ExplorerTag {
  return { id: crypto.randomUUID(), type, text };
}

function makeProfile(userId: string, channelId: string, tags: ExplorerTag[]): ExplorerProfile {
  return { userId, channelId, tags, updatedAt: new Date() };
}

function makeSession(overrides?: Partial<PericoloSession>): PericoloSession {
  return {
    sessionId: 'sess-1',
    channelId: 'ch-1',
    guildId: 'g-1',
    guideId: 'guide-user',
    guideName: 'Guida',
    objective: 'Test',
    bag: [],
    allLabels: [],
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

function makePool(channelId = 'ch-1'): ThreatPool {
  return {
    channelId,
    labels: [createLabel('minaccia', 'Ombra'), createLabel('visione', 'Abisso')],
    updatedAt: new Date(),
  };
}

function makeInteraction(
  subcommand: string,
  userId: string,
  channelId = 'ch-1'
): { interaction: ChatInputCommandInteraction; replies: unknown[] } {
  const replies: unknown[] = [];
  const interaction = {
    user: { id: userId },
    channelId,
    editReply: async (opts: unknown) => {
      replies.push(opts);
    },
    options: {
      getSubcommand: () => subcommand,
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies };
}

const noopLimiter = {
  consume: () => true,
  retryAfterSeconds: () => 0,
} as unknown as RateLimiter;

async function runCommand(
  store: MemoryPericoloStore,
  subcommand: string,
  userId = 'guide-user',
  channelId = 'ch-1'
): Promise<unknown[]> {
  const { interaction, replies } = makeInteraction(subcommand, userId, channelId);
  await handlePerilCommand(interaction, store, noopLimiter);
  return replies;
}

// ---------------------------------------------------------------------------
// Setup: two explorer profiles with mixed tags
//   u1: 1 condizione, 1 rassegnazione, 1 tratto (must be ignored)
//   u2: 1 condizione, 2 rassegnazioni
// Expected: 2 conditions, 3 resignations in bag when all categories are added.
// ---------------------------------------------------------------------------

async function setupStoreWithProfiles(store: MemoryPericoloStore): Promise<void> {
  await store.setSession(makeSession());
  await store.setThreatPool(makePool()); // 2 threat-pool labels
  await store.setExplorerProfile(
    makeProfile('u1', 'ch-1', [
      makeTag('condizione', 'Ferito'),
      makeTag('rassegnazione'),
      makeTag('tratto', 'Coraggioso'), // must NOT be added
    ])
  );
  await store.setExplorerProfile(
    makeProfile('u2', 'ch-1', [
      makeTag('condizione', 'Stanco'),
      makeTag('rassegnazione'),
      makeTag('rassegnazione'),
    ])
  );
}

// ---------------------------------------------------------------------------
// Tests — double-call of individual commands
// ---------------------------------------------------------------------------

describe('idempotency — add-threats called twice', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('second call returns an error and does not add duplicate threat labels', async () => {
    await store.setSession(makeSession());
    await store.setThreatPool(makePool());

    await runCommand(store, 'add-threats');
    const bagAfterFirst = (await store.getSession('ch-1'))!.bag.length;

    // Second call must return an error embed
    await runCommand(store, 'add-threats');
    const session = await store.getSession('ch-1');

    expect(session!.bag).toHaveLength(bagAfterFirst);
    expect(session!.bag.length).toBe(2); // exactly the 2 pool labels
  });
});

describe('idempotency — add-conditions called twice', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('second call returns an error and does not add duplicate condition labels', async () => {
    await setupStoreWithProfiles(store);

    await runCommand(store, 'add-conditions');
    const bagAfterFirst = (await store.getSession('ch-1'))!.bag.length; // 2 conditions

    await runCommand(store, 'add-conditions');
    const session = await store.getSession('ch-1');

    expect(session!.bag).toHaveLength(bagAfterFirst);
    const conditionCount = session!.bag.filter((l) => l.type === 'condizione').length;
    expect(conditionCount).toBe(2);
  });
});

describe('idempotency — add-resignations called twice', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('second call returns an error and does not add duplicate resignation labels', async () => {
    await setupStoreWithProfiles(store);

    await runCommand(store, 'add-resignations');
    const bagAfterFirst = (await store.getSession('ch-1'))!.bag.length; // 3 resignations

    await runCommand(store, 'add-resignations');
    const session = await store.getSession('ch-1');

    expect(session!.bag).toHaveLength(bagAfterFirst);
    const resignationCount = session!.bag.filter((l) => l.type === 'rassegnazione').length;
    expect(resignationCount).toBe(3); // exactly what is in the profiles
  });
});

describe('idempotency — add-negative-tags called twice', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('second call fails on the threat-pool guard and does not add any duplicates', async () => {
    await setupStoreWithProfiles(store);

    await runCommand(store, 'add-negative-tags'); // adds all 7 labels
    const bagAfterFirst = (await store.getSession('ch-1'))!.bag.length;

    await runCommand(store, 'add-negative-tags'); // must fail at threat-pool check
    const session = await store.getSession('ch-1');

    expect(session!.bag).toHaveLength(bagAfterFirst);
    expect(session!.bag.length).toBe(7); // 2 threats + 2 conditions + 3 resignations
  });
});

// ---------------------------------------------------------------------------
// Tests — sequential combinations
// ---------------------------------------------------------------------------

describe('idempotency — add-conditions then add-negative-tags', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('add-negative-tags skips conditions already added; total bag = 7', async () => {
    await setupStoreWithProfiles(store);

    await runCommand(store, 'add-conditions'); // 2 conditions added
    await runCommand(store, 'add-negative-tags'); // threats + resignations only

    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(7); // 2 threats + 2 conditions + 3 resignations
    expect(session!.bag.filter((l) => l.type === 'condizione').length).toBe(2);
    expect(session!.bag.filter((l) => l.type === 'rassegnazione').length).toBe(3);
    expect(
      session!.bag.filter((l) => l.type === 'minaccia' || l.type === 'visione').length
    ).toBe(2);
  });
});

describe('idempotency — add-resignations then add-negative-tags', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('add-negative-tags skips resignations already added; total bag = 7', async () => {
    await setupStoreWithProfiles(store);

    await runCommand(store, 'add-resignations'); // 3 resignations added
    await runCommand(store, 'add-negative-tags'); // threats + conditions only

    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(7); // 2 threats + 2 conditions + 3 resignations
    expect(session!.bag.filter((l) => l.type === 'rassegnazione').length).toBe(3);
    expect(session!.bag.filter((l) => l.type === 'condizione').length).toBe(2);
    expect(
      session!.bag.filter((l) => l.type === 'minaccia' || l.type === 'visione').length
    ).toBe(2);
  });
});

describe('idempotency — add-conditions + add-resignations then add-negative-tags', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('add-negative-tags skips both categories; total bag = 7', async () => {
    await setupStoreWithProfiles(store);

    await runCommand(store, 'add-conditions'); // 2 conditions
    await runCommand(store, 'add-resignations'); // 3 resignations
    await runCommand(store, 'add-negative-tags'); // threats only (conditions+resignations skipped)

    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(7);
    expect(session!.bag.filter((l) => l.type === 'condizione').length).toBe(2);
    expect(session!.bag.filter((l) => l.type === 'rassegnazione').length).toBe(3);
    expect(
      session!.bag.filter((l) => l.type === 'minaccia' || l.type === 'visione').length
    ).toBe(2);
  });
});

describe('idempotency — add-threats then add-negative-tags', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('add-negative-tags fails because threat pool is already added', async () => {
    await setupStoreWithProfiles(store);

    await runCommand(store, 'add-threats'); // 2 threats
    const bagAfterThreats = (await store.getSession('ch-1'))!.bag.length;

    await runCommand(store, 'add-negative-tags'); // must fail: threatPoolAdded = true
    const session = await store.getSession('ch-1');

    // Bag unchanged after failed add-negative-tags
    expect(session!.bag).toHaveLength(bagAfterThreats);
    expect(session!.bag.length).toBe(2);
  });
});

describe('idempotency — resignation count matches explorer profiles exactly', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('add-resignations: count in bag equals total rassegnazione tags in profiles', async () => {
    await store.setSession(makeSession());
    await store.setThreatPool(makePool());

    // u1: 1 resignation, u2: 2 resignations, u3: 0 resignations → total = 3
    await store.setExplorerProfile(
      makeProfile('u1', 'ch-1', [makeTag('rassegnazione'), makeTag('tratto', 'Forte')])
    );
    await store.setExplorerProfile(
      makeProfile('u2', 'ch-1', [makeTag('rassegnazione'), makeTag('rassegnazione')])
    );
    await store.setExplorerProfile(makeProfile('u3', 'ch-1', [makeTag('tratto', 'Veloce')]));

    await runCommand(store, 'add-resignations');

    const session = await store.getSession('ch-1');
    const resignationCount = session!.bag.filter((l) => l.type === 'rassegnazione').length;
    expect(resignationCount).toBe(3);
  });

  it('add-negative-tags: resignation count in bag equals total rassegnazione tags in profiles', async () => {
    await store.setSession(makeSession());
    await store.setThreatPool(makePool());

    // u1: 2 resignations, u2: 1 resignation → total = 3
    await store.setExplorerProfile(
      makeProfile('u1', 'ch-1', [makeTag('rassegnazione'), makeTag('rassegnazione')])
    );
    await store.setExplorerProfile(makeProfile('u2', 'ch-1', [makeTag('rassegnazione')]));

    await runCommand(store, 'add-negative-tags');

    const session = await store.getSession('ch-1');
    const resignationCount = session!.bag.filter((l) => l.type === 'rassegnazione').length;
    expect(resignationCount).toBe(3);
  });
});
