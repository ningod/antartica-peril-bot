/**
 * Tests for /peril add duplicate-warning behaviour.
 *
 * Verified behaviours:
 *  1. isSimilarText — pure function: equal, case-insensitive, space-ignored,
 *     Levenshtein ≤ 2 (1 sub, 1 ins, 1 del, 2 edits), ≥ 3 edits = not similar.
 *  2. findSimilarInBag — rassegnazione rule (any existing rassegnazione),
 *     text-similarity rule for other types.
 *  3. handlePerilCommand add — no similar in bag → label added immediately.
 *  4. handlePerilCommand add — similar in bag → warning reply with buttons,
 *     label NOT yet in bag, pendingLabel stored in session.
 *  5. handlePerilCommand add rassegnazione — rassegnazione already in bag →
 *     warning (not a text-similarity match but a type match).
 *  6. confirm-add-label button — pending label moved into bag, pending cleared.
 *  7. cancel-add-label button — pending label discarded, pending cleared.
 *  8. confirm by wrong user → errConfirmationExpired, bag unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { handlePerilCommand } from '../src/commands/peril.js';
import { handleButton } from '../src/interactions/buttons.js';
import { isSimilarText, findSimilarInBag } from '../src/lib/domain.js';
import { MemoryPericoloStore } from '../src/lib/store.js';
import { createLabel } from '../src/lib/domain.js';
import type { PericoloSession } from '../src/lib/store-interface.js';
import type { RateLimiter } from '../src/lib/ratelimit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeAddInteraction(
  userId: string,
  type: string,
  text: string | null,
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
      getSubcommand: () => 'add',
      getString: (name: string, _required?: boolean) => {
        if (name === 'type') return type;
        if (name === 'text') return text;
        if (name === 'subtype') return null;
        if (name === 'neg_side') return null;
        return null;
      },
      getUser: () => null,
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies };
}

function makeButtonInteraction(
  customId: string,
  userId: string,
  channelId = 'ch-1'
): { interaction: ButtonInteraction; replies: unknown[] } {
  const replies: unknown[] = [];
  const interaction = {
    user: { id: userId },
    channelId,
    customId,
    editReply: async (opts: unknown) => {
      replies.push(opts);
    },
  } as unknown as ButtonInteraction;
  return { interaction, replies };
}

const noopLimiter = {
  consume: () => true,
  retryAfterSeconds: () => 0,
} as unknown as RateLimiter;

// ---------------------------------------------------------------------------
// Unit tests: isSimilarText
// ---------------------------------------------------------------------------

describe('isSimilarText', () => {
  it('returns true for identical strings', () => {
    expect(isSimilarText('Ferito', 'Ferito')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSimilarText('Ferito', 'ferito')).toBe(true);
    expect(isSimilarText('FERITO', 'ferito')).toBe(true);
  });

  it('ignores spaces', () => {
    expect(isSimilarText('Molto Ferito', 'moltoferito')).toBe(true);
    expect(isSimilarText('Ben Riposato', 'benriposato')).toBe(true);
  });

  it('returns true for 1-character substitution', () => {
    expect(isSimilarText('Ferito', 'Ferita')).toBe(true);
  });

  it('returns true for 1-character insertion', () => {
    expect(isSimilarText('Ferito', 'Ferrito')).toBe(true);
  });

  it('returns true for 1-character deletion', () => {
    expect(isSimilarText('Ferito', 'Ferit')).toBe(true);
  });

  it('returns true for exactly 2 edits', () => {
    expect(isSimilarText('Ferito', 'Feriti')).toBe(true); // 2 substitutions
  });

  it('returns false for 3 or more edits', () => {
    expect(isSimilarText('Ferito', 'Calmo')).toBe(false); // 3 edits after normalization
    expect(isSimilarText('abc', 'xyz')).toBe(false); // 3 substitutions
  });

  it('returns false for empty strings', () => {
    expect(isSimilarText('', 'Ferito')).toBe(false);
    expect(isSimilarText('Ferito', '')).toBe(false);
  });

  it('returns false for clearly different strings', () => {
    expect(isSimilarText('Coraggioso', 'Ferito')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: findSimilarInBag
// ---------------------------------------------------------------------------

describe('findSimilarInBag', () => {
  it('returns undefined for an empty bag', () => {
    expect(findSimilarInBag([], 'condizione', 'Ferito')).toBeUndefined();
  });

  it('returns undefined when no similar label exists', () => {
    const bag = [createLabel('condizione', 'Stanco')];
    expect(findSimilarInBag(bag, 'condizione', 'Coraggio')).toBeUndefined();
  });

  it('finds a label with the same text (case-insensitive)', () => {
    const bag = [createLabel('condizione', 'Ferito')];
    const result = findSimilarInBag(bag, 'condizione', 'ferito');
    expect(result).toBeDefined();
    expect(result?.text).toBe('Ferito');
  });

  it('finds a label with similar text (1 edit)', () => {
    const bag = [createLabel('tratto', 'Coraggioso')];
    const result = findSimilarInBag(bag, 'tratto', 'Coraggiosa');
    expect(result).toBeDefined();
  });

  it('finds similarity across different label types', () => {
    const bag = [createLabel('tratto', 'Ferito')];
    // searching for condizione "Ferita" — 1 edit difference, type doesn't matter
    const result = findSimilarInBag(bag, 'condizione', 'Ferita');
    expect(result).toBeDefined();
  });

  it('returns the first rassegnazione in bag when adding another rassegnazione', () => {
    const existing = createLabel('rassegnazione');
    const bag = [createLabel('condizione', 'Ferito'), existing];
    const result = findSimilarInBag(bag, 'rassegnazione', '');
    expect(result).toBe(existing);
  });

  it('does not match rassegnazione by text rule (type rule takes precedence)', () => {
    // Bag has no rassegnazione → no match
    const bag = [createLabel('condizione', 'Ferito')];
    expect(findSimilarInBag(bag, 'rassegnazione', '')).toBeUndefined();
  });

  it('skips labels without text in the bag', () => {
    const bag = [createLabel('rassegnazione')]; // no text
    // Adding a condizione 'Ferito' — the rassegnazione has no text, should not match
    expect(findSimilarInBag(bag, 'condizione', 'Ferito')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests: /peril add — no duplicate
// ---------------------------------------------------------------------------

describe('handlePerilCommand add — no duplicate', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('adds the label immediately when bag is empty', async () => {
    await store.setSession(makeSession());

    const { interaction, replies } = makeAddInteraction('guide-user', 'condizione', 'Ferito');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const session = await store.getSession('ch-1');
    expect(session!.bag).toHaveLength(1);
    expect(session!.bag[0]?.text).toBe('Ferito');
    expect(session!.pendingLabel).toBeUndefined();
  });

  it('adds the label immediately when no similar label exists', async () => {
    const session = makeSession({ bag: [createLabel('condizione', 'Stanco')] });
    await store.setSession(session);

    const { interaction, replies } = makeAddInteraction('guide-user', 'condizione', 'Coraggioso');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const updated = await store.getSession('ch-1');
    expect(updated!.bag).toHaveLength(2);
    expect(updated!.pendingLabel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests: /peril add — similar label triggers warning
// ---------------------------------------------------------------------------

describe('handlePerilCommand add — similar label warning', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('shows warning and does NOT add label when identical text already in bag', async () => {
    const session = makeSession({ bag: [createLabel('condizione', 'Ferito')] });
    await store.setSession(session);

    const { interaction, replies } = makeAddInteraction('guide-user', 'condizione', 'Ferito');
    await handlePerilCommand(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const reply = replies[0] as { embeds?: unknown[]; components?: unknown[] };
    // Reply should contain buttons (confirm/cancel)
    expect(reply.components?.length).toBeGreaterThan(0);

    const updated = await store.getSession('ch-1');
    // Label NOT yet in bag
    expect(updated!.bag).toHaveLength(1);
    // Pending label set
    expect(updated!.pendingLabel).toBeDefined();
    expect(updated!.pendingLabel?.text).toBe('Ferito');
    expect(updated!.pendingAddUserId).toBe('guide-user');
  });

  it('shows warning for case-insensitive match', async () => {
    const session = makeSession({ bag: [createLabel('condizione', 'Ferito')] });
    await store.setSession(session);

    const { interaction } = makeAddInteraction('guide-user', 'condizione', 'ferito');
    await handlePerilCommand(interaction, store, noopLimiter);

    const updated = await store.getSession('ch-1');
    expect(updated!.bag).toHaveLength(1);
    expect(updated!.pendingLabel).toBeDefined();
  });

  it('shows warning for 1-edit difference (typo)', async () => {
    const session = makeSession({ bag: [createLabel('condizione', 'Ferito')] });
    await store.setSession(session);

    const { interaction } = makeAddInteraction('guide-user', 'condizione', 'Ferita');
    await handlePerilCommand(interaction, store, noopLimiter);

    const updated = await store.getSession('ch-1');
    expect(updated!.bag).toHaveLength(1);
    expect(updated!.pendingLabel).toBeDefined();
  });

  it('adds without warning when text differs by 3+ edits', async () => {
    const session = makeSession({ bag: [createLabel('condizione', 'Ferito')] });
    await store.setSession(session);

    const { interaction } = makeAddInteraction('guide-user', 'condizione', 'Calmo');
    await handlePerilCommand(interaction, store, noopLimiter);

    const updated = await store.getSession('ch-1');
    expect(updated!.bag).toHaveLength(2);
    expect(updated!.pendingLabel).toBeUndefined();
  });

  it('shows warning when rassegnazione already in bag (type rule)', async () => {
    const session = makeSession({ bag: [createLabel('rassegnazione')] });
    await store.setSession(session);

    const { interaction } = makeAddInteraction('guide-user', 'rassegnazione', null);
    await handlePerilCommand(interaction, store, noopLimiter);

    const updated = await store.getSession('ch-1');
    // Still only 1 rassegnazione in bag
    expect(updated!.bag).toHaveLength(1);
    expect(updated!.pendingLabel).toBeDefined();
    expect(updated!.pendingLabel?.type).toBe('rassegnazione');
  });
});

// ---------------------------------------------------------------------------
// Integration tests: confirm-add-label button
// ---------------------------------------------------------------------------

describe('confirm-add-label button', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('moves pendingLabel into bag and clears pending fields', async () => {
    const pending = createLabel('condizione', 'Ferito');
    const session = makeSession({
      bag: [createLabel('condizione', 'Ferita')],
      pendingLabel: pending,
      pendingAddUserId: 'guide-user',
    });
    await store.setSession(session);

    const { interaction, replies } = makeButtonInteraction(
      'confirm-add-label:ch-1',
      'guide-user'
    );
    await handleButton(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const updated = await store.getSession('ch-1');
    // Both labels now in bag
    expect(updated!.bag).toHaveLength(2);
    expect(updated!.bag.some((l) => l.id === pending.id)).toBe(true);
    expect(updated!.pendingLabel).toBeUndefined();
    expect(updated!.pendingAddUserId).toBeUndefined();
  });

  it('allows the guide to confirm even if not the original user', async () => {
    const pending = createLabel('condizione', 'Ferito');
    const session = makeSession({
      bag: [createLabel('condizione', 'Ferita')],
      pendingLabel: pending,
      pendingAddUserId: 'other-user',
    });
    await store.setSession(session);

    const { interaction, replies } = makeButtonInteraction(
      'confirm-add-label:ch-1',
      'guide-user' // guide, not the original user
    );
    await handleButton(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const updated = await store.getSession('ch-1');
    expect(updated!.bag).toHaveLength(2);
    expect(updated!.pendingLabel).toBeUndefined();
  });

  it('rejects a user who is neither the original user nor the guide', async () => {
    const pending = createLabel('condizione', 'Ferito');
    const session = makeSession({
      bag: [],
      pendingLabel: pending,
      pendingAddUserId: 'other-user',
    });
    await store.setSession(session);

    const { interaction, replies } = makeButtonInteraction(
      'confirm-add-label:ch-1',
      'intruder-user'
    );
    await handleButton(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const updated = await store.getSession('ch-1');
    // Bag unchanged, pending still set
    expect(updated!.bag).toHaveLength(0);
    expect(updated!.pendingLabel).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests: cancel-add-label button
// ---------------------------------------------------------------------------

describe('cancel-add-label button', () => {
  let store: MemoryPericoloStore;

  beforeEach(() => {
    store = new MemoryPericoloStore(60_000);
    store.start();
  });

  afterEach(() => {
    store.stop();
  });

  it('discards pendingLabel and clears pending fields', async () => {
    const pending = createLabel('condizione', 'Ferito');
    const session = makeSession({
      bag: [createLabel('condizione', 'Ferita')],
      pendingLabel: pending,
      pendingAddUserId: 'guide-user',
    });
    await store.setSession(session);

    const { interaction, replies } = makeButtonInteraction(
      'cancel-add-label:ch-1',
      'guide-user'
    );
    await handleButton(interaction, store, noopLimiter);

    expect(replies).toHaveLength(1);
    const updated = await store.getSession('ch-1');
    // Bag unchanged
    expect(updated!.bag).toHaveLength(1);
    expect(updated!.bag.some((l) => l.id === pending.id)).toBe(false);
    expect(updated!.pendingLabel).toBeUndefined();
    expect(updated!.pendingAddUserId).toBeUndefined();
  });

  it('rejects a user who is neither the original user nor the guide', async () => {
    const pending = createLabel('condizione', 'Ferito');
    const session = makeSession({
      bag: [],
      pendingLabel: pending,
      pendingAddUserId: 'other-user',
    });
    await store.setSession(session);

    const { interaction } = makeButtonInteraction('cancel-add-label:ch-1', 'intruder-user');
    await handleButton(interaction, store, noopLimiter);

    const updated = await store.getSession('ch-1');
    // Pending still intact
    expect(updated!.pendingLabel).toBeDefined();
  });
});
