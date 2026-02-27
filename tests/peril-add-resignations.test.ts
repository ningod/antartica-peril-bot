/**
 * Tests for /peril add-resignations:
 *  1. collectResignationTags (pure helper) — all rassegnazione tags collected,
 *     including multiple per explorer, ignoring other types.
 *  2. handlePerilCommand integration — guide-only enforcement and correct bag
 *     population, including multiple rassegnazioni per explorer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { collectResignationTags, handlePerilCommand } from '../src/commands/peril.js';
import { MemoryPericoloStore } from '../src/lib/store.js';
import type { ExplorerProfile, ExplorerTag, PericoloSession } from '../src/lib/store-interface.js';
import type { RateLimiter } from '../src/lib/ratelimit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTag(type: ExplorerTag['type'], id = crypto.randomUUID()): ExplorerTag {
  return { id, type, text: '' };
}

function makeProfile(
  userId: string,
  channelId: string,
  tags: ExplorerTag[]
): ExplorerProfile {
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

/** Minimal interaction mock for /peril add-resignations. */
function makeInteraction(
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
      getSubcommand: () => 'add-resignations',
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies };
}

const noopLimiter = {
  consume: () => true,
  retryAfterSeconds: () => 0,
} as unknown as RateLimiter;

// ---------------------------------------------------------------------------
// collectResignationTags — pure unit tests
// ---------------------------------------------------------------------------

describe('collectResignationTags', () => {
  it('returns empty array when profiles have no rassegnazione tags', () => {
    const profiles: ExplorerProfile[] = [
      makeProfile('u1', 'ch-1', [makeTag('condizione'), makeTag('tratto')]),
    ];
    expect(collectResignationTags(profiles)).toHaveLength(0);
  });

  it('returns rassegnazione tags from a single explorer', () => {
    const r1 = makeTag('rassegnazione');
    const profiles: ExplorerProfile[] = [
      makeProfile('u1', 'ch-1', [r1, makeTag('condizione')]),
    ];
    const result = collectResignationTags(profiles);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(r1.id);
  });

  it('collects multiple rassegnazione tags from the same explorer', () => {
    const r1 = makeTag('rassegnazione');
    const r2 = makeTag('rassegnazione');
    const profiles: ExplorerProfile[] = [
      makeProfile('u1', 'ch-1', [r1, makeTag('tratto'), r2]),
    ];
    const result = collectResignationTags(profiles);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toContain(r1.id);
    expect(result.map((t) => t.id)).toContain(r2.id);
  });

  it('collects rassegnazione tags across multiple explorers', () => {
    const r1 = makeTag('rassegnazione');
    const r2 = makeTag('rassegnazione');
    const r3 = makeTag('rassegnazione');
    const profiles: ExplorerProfile[] = [
      makeProfile('u1', 'ch-1', [r1, r2, makeTag('condizione')]),
      makeProfile('u2', 'ch-1', [makeTag('tratto'), r3]),
    ];
    const result = collectResignationTags(profiles);
    expect(result).toHaveLength(3);
  });

  it('ignores all non-rassegnazione tags', () => {
    const profiles: ExplorerProfile[] = [
      makeProfile('u1', 'ch-1', [
        makeTag('tratto'),
        makeTag('condizione'),
        makeTag('terrore'),
        makeTag('risorsa'),
        makeTag('tratto-segnato'),
      ]),
    ];
    expect(collectResignationTags(profiles)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// handlePerilCommand add-resignations — integration tests
// ---------------------------------------------------------------------------

describe('handlePerilCommand add-resignations', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('rejects a non-guide user with an error embed', async () => {
    await store.setSession(makeSession({ guideId: 'guide-user', guideName: 'Guida' }));

    const { interaction, replies } = makeInteraction('not-the-guide');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    // The reply must contain an embed (the errNotGuide error)
    const reply = replies[0] as { embeds?: unknown[] };
    expect(reply.embeds).toBeDefined();
    expect(reply.embeds!.length).toBeGreaterThan(0);
    // Session bag must remain empty — no labels added
    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(0);
  });

  it('returns an error embed when no rassegnazione tags exist in any profile', async () => {
    await store.setSession(makeSession());
    await store.setExplorerProfile(
      makeProfile('u1', 'ch-1', [makeTag('condizione'), makeTag('tratto')])
    );

    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const reply = replies[0] as { embeds?: unknown[] };
    expect(reply.embeds).toBeDefined();
    // Bag untouched
    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(0);
  });

  it('adds all rassegnazione labels to the bag, including multiple per explorer', async () => {
    await store.setSession(makeSession());

    // Explorer 1 has 2 rassegnazioni + 1 condizione
    await store.setExplorerProfile(
      makeProfile('u1', 'ch-1', [
        makeTag('rassegnazione'),
        makeTag('rassegnazione'),
        makeTag('condizione'),
      ])
    );
    // Explorer 2 has 1 rassegnazione
    await store.setExplorerProfile(
      makeProfile('u2', 'ch-1', [makeTag('rassegnazione'), makeTag('tratto')])
    );

    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    // All 3 rassegnazioni must be in the bag
    expect(session!.bag).toHaveLength(3);
    expect(session!.allLabels).toHaveLength(3);
    expect(session!.bag.every((l) => l.type === 'rassegnazione')).toBe(true);
    // Condizione and Tratto must NOT be in the bag
    expect(session!.bag.some((l) => l.type === 'condizione')).toBe(false);
  });

  it('adds rassegnazioni without a session returns an error embed', async () => {
    // No session set
    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const reply = replies[0] as { embeds?: unknown[] };
    expect(reply.embeds).toBeDefined();
  });
});
