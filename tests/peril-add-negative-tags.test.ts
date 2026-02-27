/**
 * Tests for /peril add-negative-tags.
 *
 * Verified behaviours:
 *  1. Guide-only — non-guide users are rejected.
 *  2. Threat pool required — missing pool returns an error.
 *  3. Threat pool already added — duplicate call returns an error.
 *  4. All three categories (threats + conditions + resignations) are added to
 *     the bag in a single invocation.
 *  5. Works gracefully when conditions and/or resignations are absent (0 tags).
 *  6. No session returns an error.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handlePerilCommand } from '../src/commands/peril.js';
import { MemoryPericoloStore } from '../src/lib/store.js';
import { createLabel } from '../src/lib/domain.js';
import type { ExplorerProfile, ExplorerTag, PericoloSession, ThreatPool } from '../src/lib/store-interface.js';
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
      getSubcommand: () => 'add-negative-tags',
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies };
}

const noopLimiter = {
  consume: () => true,
  retryAfterSeconds: () => 0,
} as unknown as RateLimiter;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handlePerilCommand add-negative-tags', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('returns an error when there is no active session', async () => {
    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const reply = replies[0] as { embeds?: unknown[] };
    expect(reply.embeds?.length).toBeGreaterThan(0);
  });

  it('rejects a non-guide user with an error embed and leaves bag empty', async () => {
    await store.setSession(makeSession());
    await store.setThreatPool(makePool());

    const { interaction, replies } = makeInteraction('not-the-guide');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(0);
  });

  it('returns an error when the threat pool is missing', async () => {
    await store.setSession(makeSession());
    // No pool set

    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(0);
    expect(session!.threatPoolAdded).toBe(false);
  });

  it('returns an error when the threat pool was already added', async () => {
    await store.setSession(makeSession({ threatPoolAdded: true }));
    await store.setThreatPool(makePool());

    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    // Bag must not change
    expect(session!.bag).toHaveLength(0);
  });

  it('adds threats + conditions + resignations in one call', async () => {
    await store.setSession(makeSession());
    await store.setThreatPool(makePool()); // 2 labels: minaccia + visione

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
        makeTag('rassegnazione'), // second resignation on same explorer
      ])
    );

    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    // 2 threats + 2 conditions + 3 resignations = 7
    expect(session!.bag).toHaveLength(7);
    expect(session!.allLabels).toHaveLength(7);
    expect(session!.threatPoolAdded).toBe(true);

    const types = session!.bag.map((l) => l.type);
    expect(types.filter((t) => t === 'minaccia' || t === 'visione')).toHaveLength(2);
    expect(types.filter((t) => t === 'condizione')).toHaveLength(2);
    expect(types.filter((t) => t === 'rassegnazione')).toHaveLength(3);
    expect(types.filter((t) => t === 'tratto')).toHaveLength(0);
  });

  it('works when there are no conditions and no resignations (threats only)', async () => {
    await store.setSession(makeSession());
    await store.setThreatPool(makePool()); // 2 labels

    await store.setExplorerProfile(
      makeProfile('u1', 'ch-1', [makeTag('tratto', 'Forte')]) // no conditions/resignations
    );

    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    // Only the 2 threat-pool labels
    expect(session!.bag).toHaveLength(2);
    expect(session!.threatPoolAdded).toBe(true);
  });

  it('works when there are no explorer profiles (threats only)', async () => {
    await store.setSession(makeSession());
    await store.setThreatPool(makePool()); // 2 labels

    const { interaction, replies } = makeInteraction('guide-user');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(2);
    expect(session!.threatPoolAdded).toBe(true);
  });
});
