/**
 * /peril command — Channel-scoped Peril Session management.
 *
 * Subcommands: start | add | add-threats | add-conditions | bag | draw | end | reset
 */

import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { IPericoloStore } from '../lib/store-interface.js';
import type { PericoloSession, ExplorerProfile, ExplorerTag } from '../lib/store-interface.js';
import type { RateLimiter } from '../lib/ratelimit.js';
import {
  createLabel,
  sanitizeText,
  drawFromBag,
  resolveUncertainDraws,
  LABEL_TYPE_DISPLAY,
  MAX_LABEL_TEXT_LENGTH,
  MAX_NARRATIVE_TEXT_LENGTH,
} from '../lib/domain.js';
import type { LabelType } from '../lib/domain.js';
import {
  buildSessionStartedEmbed,
  buildBagEmbed,
  buildLabelAddedEmbed,
  buildThreatPoolAddedEmbed,
  buildDrawEmbed,
  buildSessionEndEmbed,
  buildSessionResetEmbed,
  buildExplorerConditionsAddedEmbed,
  buildExplorerResignationsAddedEmbed,
  buildErrorEmbed,
} from '../lib/embeds.js';
import { tr } from '../lib/i18n/index.js';
import type { Tr } from '../lib/i18n/index.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const perilCommandData = new SlashCommandBuilder()
  .setName('peril')
  .setDescription('Manage a Brave the Peril session')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Start a new peril session in the channel')
      .addStringOption((opt) =>
        opt
          .setName('objective')
          .setDescription('The scene objective')
          .setRequired(true)
          .setMaxLength(MAX_NARRATIVE_TEXT_LENGTH)
      )
      .addUserOption((opt) =>
        opt.setName('lead').setDescription('The Lead (default: command invoker)').setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('notes')
          .setDescription('Additional notes')
          .setRequired(false)
          .setMaxLength(MAX_NARRATIVE_TEXT_LENGTH)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a tag to the Pouch')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Base tag type')
          .setRequired(true)
          .addChoices(
            { name: 'Condition', value: 'condizione' },
            { name: 'Trait', value: 'tratto' },
            { name: 'Supply', value: 'risorsa' },
            { name: 'Resignation', value: 'rassegnazione' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('subtype')
          .setDescription(
            'Subtype (optional): Dread for Condition; Name/Archetype/Marked for Trait'
          )
          .setRequired(false)
          .addChoices(
            { name: 'Name Trait', value: 'tratto-nome' },
            { name: 'Archetype Trait', value: 'tratto-archetipo' },
            { name: 'Marked Trait', value: 'tratto-segnato' },
            { name: 'Dread', value: 'terrore' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('text')
          .setDescription('Tag text (not required for Resignation)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
          .setAutocomplete(true)
      )
      .addUserOption((opt) =>
        opt.setName('owner').setDescription('Tag owner player').setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('neg_side')
          .setDescription('Negative side → auto Marked Trait (Trait only)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('add-threats').setDescription('Add the Threat Pool to the Pouch')
  )
  .addSubcommand((sub) =>
    sub
      .setName('add-conditions')
      .setDescription('Add all Explorer Conditions from this channel to the Pouch (Lead only)')
  )
  .addSubcommand((sub) =>
    sub
      .setName('add-resignations')
      .setDescription('Add all Explorer Resignations from this channel to the Pouch (Lead only)')
  )
  .addSubcommand((sub) => sub.setName('bag').setDescription('Show Pouch contents (private)'))
  .addSubcommand((sub) => sub.setName('draw').setDescription('Draw 3 tags from the Pouch'))
  .addSubcommand((sub) => sub.setName('end').setDescription('End the session and show the summary'))
  .addSubcommand((sub) =>
    sub.setName('reset').setDescription('Reset Pouch and draws (keep the objective)')
  );

/** Sentinel value used in add-label-suggest select menus to indicate "enter custom text". */
export const SUGGEST_CUSTOM_VALUE = '__custom__';

/** Names of subcommands restricted to the Guide only. */
const GUIDE_ONLY_SUBS = new Set([
  'draw',
  'add-threats',
  'add-conditions',
  'add-resignations',
  'end',
  'reset',
]);

// ---------------------------------------------------------------------------
// Autocomplete handler
// ---------------------------------------------------------------------------

/**
 * Respond to autocomplete for /peril add text.
 * Offers the invoking user's Explorer profile tags as suggestions,
 * filtered by the primary type (and subtype) already selected.
 * Falls back silently to empty choices when no profile exists.
 */
export async function handlePerilAutocomplete(
  interaction: AutocompleteInteraction,
  store: IPericoloStore
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'text') {
    await interaction.respond([]);
    return;
  }

  const profile = await store.getExplorerProfile(interaction.user.id, interaction.channelId);
  if (!profile || profile.tags.length === 0) {
    await interaction.respond([]);
    return;
  }

  const primaryType = interaction.options.getString('type') as PrimaryType | null;
  if (!primaryType || primaryType === 'rassegnazione') {
    await interaction.respond([]);
    return;
  }

  const subtype = interaction.options.getString('subtype');
  let targetTypes: readonly LabelType[];

  if (subtype && VALID_SUBTYPES[primaryType].includes(subtype)) {
    targetTypes = [subtype as LabelType];
  } else {
    switch (primaryType) {
      case 'condizione':
        targetTypes = ['condizione'];
        break;
      case 'tratto':
        targetTypes = ['tratto', 'tratto-nome', 'tratto-archetipo', 'tratto-segnato'];
        break;
      case 'risorsa':
        targetTypes = ['risorsa'];
        break;
      default:
        targetTypes = [];
    }
  }

  const focusedValue = focused.value.toLowerCase();

  const choices = profile.tags
    .filter((tag) => (targetTypes as LabelType[]).includes(tag.type) && tag.text)
    .filter((tag) => !focusedValue || tag.text.toLowerCase().includes(focusedValue))
    .slice(0, 25)
    .map((tag) => ({
      name: `${LABEL_TYPE_DISPLAY[tag.type]} — ${tag.text}`.slice(0, 100),
      value: tag.text.slice(0, 100),
    }));

  await interaction.respond(choices);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handlePerilCommand(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const lang = await store.getChannelLang(interaction.channelId);
  const t = tr(lang);

  // Rate-limit the actions that cost draw operations
  if (['draw'].includes(sub)) {
    if (!limiter.consume(userId)) {
      const retryAfter = limiter.retryAfterSeconds(userId);
      await interaction.editReply({
        embeds: [buildErrorEmbed(t.errRateLimitDraw(retryAfter), t)],
        allowedMentions: { parse: [] },
      });
      return;
    }
  }

  if (sub === 'start') {
    await handleStart(interaction, store, t);
  } else if (sub === 'add') {
    await handleAdd(interaction, store, t);
  } else if (sub === 'add-threats') {
    await handleAddThreats(interaction, store, t);
  } else if (sub === 'add-conditions') {
    await handleAddConditions(interaction, store, t);
  } else if (sub === 'add-resignations') {
    await handleAddResignations(interaction, store, t);
  } else if (sub === 'bag') {
    await handleBag(interaction, store, t);
  } else if (sub === 'draw') {
    await handleDraw(interaction, store, t);
  } else if (sub === 'end') {
    await handleEnd(interaction, store, t);
  } else if (sub === 'reset') {
    await handleReset(interaction, store, t);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Require an active session; send error and return null if missing. */
async function requireSession(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<PericoloSession | null> {
  const session = await store.getSession(interaction.channelId);
  if (!session) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoSession, t)],
      allowedMentions: { parse: [] },
    });
  }
  return session;
}

/** Require the invoker to be the Guide; send error and return false if not. */
async function requireGuide(
  interaction: ChatInputCommandInteraction,
  session: PericoloSession,
  t: Tr
): Promise<boolean> {
  if (interaction.user.id !== session.guideId) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNotGuide(session.guideName), t)],
      allowedMentions: { parse: [] },
    });
    return false;
  }
  return true;
}

/**
 * Valid label types for the bag (excludes threat-pool-only types minaccia/visione).
 * Order matches the intended display order in the select menu.
 */
const BAG_LABEL_TYPES = [
  'condizione',
  'terrore',
  'tratto',
  'tratto-nome',
  'tratto-archetipo',
  'tratto-segnato',
  'risorsa',
  'rassegnazione',
] as const;

/** Build the type-selection StringSelectMenu shown when "Add Tag" button is clicked. */
export function buildAddLabelTypeSelect(
  channelId: string,
  t: Tr
): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`add-label-type:${channelId}`)
    .setPlaceholder(t.selectLabelTypePrompt)
    .addOptions(
      BAG_LABEL_TYPES.map((type) =>
        new StringSelectMenuOptionBuilder().setLabel(LABEL_TYPE_DISPLAY[type]).setValue(type)
      )
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

/** Build the shortcut action row after adding a label. */
export function buildAddLabelButtons(
  channelId: string,
  isGuide: boolean,
  t: Tr
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`add-label:${channelId}`)
      .setLabel(t.btnAddLabel)
      .setStyle(ButtonStyle.Secondary)
  );
  if (isGuide) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`proceed-draw:${channelId}`)
        .setLabel(t.btnProceedDraw)
        .setStyle(ButtonStyle.Primary)
    );
  }
  return row;
}

/**
 * Build the Explorer-suggestion StringSelectMenu shown between type selection and the modal.
 *
 * Each matching Explorer tag is listed as an option (value = tag.id).
 * The last option is always the "Enter custom text" sentinel.
 * For tratto-segnato tags the display shows both positive and negative sides.
 */
export function buildExplorerSuggestMenu(
  channelId: string,
  labelType: LabelType,
  tags: ExplorerTag[],
  t: Tr
): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = tags.slice(0, 24).map((tag) => {
    const typeDisplay = LABEL_TYPE_DISPLAY[tag.type];
    const textDisplay =
      tag.type === 'tratto-segnato'
        ? `${tag.posSide ?? tag.text} / ${tag.negSide ?? '?'}`
        : tag.text;
    const label = `${typeDisplay} — ${textDisplay}`.slice(0, 100);
    return new StringSelectMenuOptionBuilder().setLabel(label).setValue(tag.id);
  });
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(t.selectExplorerCustomEntry)
      .setValue(SUGGEST_CUSTOM_VALUE)
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`add-label-suggest:${channelId}:${labelType}`)
    .setPlaceholder(t.selectExplorerSuggestPrompt)
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

/** Build the peril action row: Push Yourself buttons (if bag has labels) + End Peril. */
export function buildPerilButtons(
  channelId: string,
  hasBagLeft: boolean,
  t: Tr
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (hasBagLeft) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`push:1:${channelId}`)
        .setLabel(t.btnPush1)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`push:2:${channelId}`)
        .setLabel(t.btnPush2)
        .setStyle(ButtonStyle.Danger)
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`end-peril:${channelId}`)
      .setLabel(t.btnEndPeril)
      .setStyle(ButtonStyle.Secondary)
  );
  return row;
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleStart(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoGuild, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Check no active session
  const existing = await store.getSession(interaction.channelId);
  if (existing) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errActiveSession, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const rawObjective = interaction.options.getString('objective', true);
  const guideUser = interaction.options.getUser('lead') ?? interaction.user;
  const rawNotes = interaction.options.getString('notes');

  const objective = sanitizeText(rawObjective.trim());
  const notes = rawNotes ? sanitizeText(rawNotes.trim()) : undefined;

  const session: PericoloSession = {
    sessionId: randomUUID(),
    channelId: interaction.channelId,
    guildId,
    guideId: guideUser.id,
    guideName: guideUser.displayName,
    objective,
    notes,
    bag: [],
    allLabels: [],
    baseDraws: [],
    pushDraws: [],
    threatPoolAdded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await store.setSession(session);

  logger.info('session-started', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    guildId,
    guideId: guideUser.id,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    embeds: [buildSessionStartedEmbed(session, t)],
    allowedMentions: { parse: [] },
  });
}

// ---------------------------------------------------------------------------
// handleAdd — type + subtype resolution
// ---------------------------------------------------------------------------

type PrimaryType = 'condizione' | 'tratto' | 'risorsa' | 'rassegnazione';

const PRIMARY_TYPES: readonly PrimaryType[] = ['condizione', 'tratto', 'risorsa', 'rassegnazione'];

const VALID_SUBTYPES: Record<PrimaryType, readonly string[]> = {
  tratto: ['tratto-nome', 'tratto-archetipo', 'tratto-segnato'],
  condizione: ['terrore'],
  risorsa: [],
  rassegnazione: [],
};

async function handleAdd(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;

  const rawType = interaction.options.getString('type', true);
  if (!PRIMARY_TYPES.includes(rawType as PrimaryType)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errInvalidLabelType(rawType), t)],
      allowedMentions: { parse: [] },
    });
    return;
  }
  const primaryType = rawType as PrimaryType;

  const rawNegSide = interaction.options.getString('neg_side');

  // neg_side only valid for tratto
  if (rawNegSide && primaryType !== 'tratto') {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNegSideOnlyForTratt, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Resolve subtype → final LabelType
  const rawSubtype = interaction.options.getString('subtype');
  let labelType: LabelType = primaryType;

  if (primaryType === 'tratto' && rawNegSide?.trim()) {
    // Auto-infer tratto-segnato from neg_side
    labelType = 'tratto-segnato';
  } else if (rawSubtype) {
    if (!VALID_SUBTYPES[primaryType].includes(rawSubtype)) {
      const validList = VALID_SUBTYPES[primaryType].join(', ') || 'nessuno';
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            t.errInvalidSubtype(rawSubtype, LABEL_TYPE_DISPLAY[primaryType], validList),
            t
          ),
        ],
        allowedMentions: { parse: [] },
      });
      return;
    }
    labelType = rawSubtype as LabelType;
    if (labelType === 'tratto-segnato' && !rawNegSide?.trim()) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t.errNegSideRequiredForTrattoSegnato, t)],
        allowedMentions: { parse: [] },
      });
      return;
    }
  }

  // Text handling
  let text = '';
  let posSide: string | undefined;
  let negSide: string | undefined;

  if (labelType !== 'rassegnazione') {
    const rawText = interaction.options.getString('text');
    if (!rawText?.trim()) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t.errTextRequired, t)],
        allowedMentions: { parse: [] },
      });
      return;
    }
    text = sanitizeText(rawText.trim());
    if (labelType === 'tratto-segnato') {
      posSide = text;
      negSide = rawNegSide ? sanitizeText(rawNegSide.trim()) : undefined;
    }
  }

  const ownerUser = interaction.options.getUser('owner');
  const ownerId = ownerUser?.id;

  const label = createLabel(labelType, text, ownerId, posSide, negSide);

  session.bag.push(label);
  session.allLabels.push(label);
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('label-added', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    labelType,
    userId: interaction.user.id,
  });

  const displayName = LABEL_TYPE_DISPLAY[labelType];
  const labelDesc = text ? `${displayName} — ${text}` : displayName;
  const isGuide = session.guideId === interaction.user.id;
  await interaction.editReply({
    embeds: [buildLabelAddedEmbed(session, labelDesc, t)],
    components: [buildAddLabelButtons(interaction.channelId, isGuide, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleAddThreats(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;
  if (!(await requireGuide(interaction, session, t))) return;

  if (session.threatPoolAdded) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errThreatPoolAlreadyAdded, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const pool = await store.getThreatPool(interaction.channelId);
  if (!pool || pool.labels.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoThreatPool, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Clone pool labels into bag (preserve type, text, id)
  for (const poolLabel of pool.labels) {
    const copy = createLabel(poolLabel.type, poolLabel.text, poolLabel.ownerId);
    session.bag.push(copy);
    session.allLabels.push(copy);
  }
  session.threatPoolAdded = true;
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('threat-pool-added-to-bag', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    count: pool.labels.length,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    embeds: [buildThreatPoolAddedEmbed(pool.labels.length, session, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleAddConditions(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;
  if (!(await requireGuide(interaction, session, t))) return;

  const profiles = await store.getExplorerProfilesForChannel(interaction.channelId);
  const conditionLabels = profiles.flatMap((p) =>
    p.tags.filter((tag) => tag.type === 'condizione')
  );

  if (conditionLabels.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.explorerNoConditions, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  for (const tag of conditionLabels) {
    const label = createLabel('condizione', tag.text);
    session.bag.push(label);
    session.allLabels.push(label);
  }
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('explorer-conditions-added-to-bag', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    count: conditionLabels.length,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    embeds: [buildExplorerConditionsAddedEmbed(conditionLabels.length, session, t)],
    allowedMentions: { parse: [] },
  });
}

/**
 * Collect all rassegnazione tags from a set of Explorer profiles.
 * Exported for unit testing.
 */
export function collectResignationTags(profiles: ExplorerProfile[]): ExplorerTag[] {
  return profiles.flatMap((p) => p.tags.filter((tag) => tag.type === 'rassegnazione'));
}

async function handleAddResignations(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;
  if (!(await requireGuide(interaction, session, t))) return;

  const profiles = await store.getExplorerProfilesForChannel(interaction.channelId);
  const resignationTags = collectResignationTags(profiles);

  if (resignationTags.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoResignations, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  for (const tag of resignationTags) {
    const label = createLabel('rassegnazione', tag.text);
    session.bag.push(label);
    session.allLabels.push(label);
  }
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('explorer-resignations-added-to-bag', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    count: resignationTags.length,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    embeds: [buildExplorerResignationsAddedEmbed(resignationTags.length, session, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleBag(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;

  // Bag is only visible before the first extraction
  if (session.baseDraws.length > 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errBagNotVisibleAfterDraw, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.editReply({
    embeds: [buildBagEmbed(session, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleDraw(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;
  if (!(await requireGuide(interaction, session, t))) return;

  // Check base draws not already done
  if (session.baseDraws.length > 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errDrawsAlreadyDone, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (session.bag.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errBagEmptyDraw, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (!session.bag.some((l) => l.type === 'minaccia' || l.type === 'visione')) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errBagNoBagThreats, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const { drawn, remaining } = drawFromBag(session.bag, 3);

  session.bag = remaining;
  session.baseDraws = drawn;
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('base-draw', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    count: drawn.length,
    remaining: remaining.length,
    userId: interaction.user.id,
  });

  const hasBagLeft = session.bag.length > 0;
  const embed = buildDrawEmbed(
    {
      session,
      baseDraws: drawn,
      showPushButtons: hasBagLeft,
    },
    t
  );

  const components = [buildPerilButtons(interaction.channelId, hasBagLeft, t)];

  await interaction.editReply({
    embeds: [embed],
    components,
    allowedMentions: { parse: [] },
  });
}

async function handleEnd(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;
  if (!(await requireGuide(interaction, session, t))) return;

  const { resolved: resolvedBase, flips: baseFlips } = resolveUncertainDraws(session.baseDraws);
  const { resolved: resolvedPush, flips: pushFlips } = resolveUncertainDraws(session.pushDraws);

  await store.deleteSession(interaction.channelId);

  logger.info('session-ended', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    baseDrawCount: session.baseDraws.length,
    pushDrawCount: session.pushDraws.length,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    embeds: [
      buildSessionEndEmbed(session, resolvedBase, resolvedPush, [...baseFlips, ...pushFlips], t),
    ],
    components: [],
    allowedMentions: { parse: [] },
  });
}

async function handleReset(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const session = await requireSession(interaction, store, t);
  if (!session) return;
  if (!(await requireGuide(interaction, session, t))) return;

  // Clear bag, draws, and threat-pool flag; keep objective and guide
  session.bag = [];
  session.allLabels = [];
  session.baseDraws = [];
  session.pushDraws = [];
  session.threatPoolAdded = false;
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('session-reset', {
    sessionId: session.sessionId,
    channelId: session.channelId,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    embeds: [buildSessionResetEmbed(session, t)],
    allowedMentions: { parse: [] },
  });
}

// Re-export for use in button handler routing
export { GUIDE_ONLY_SUBS };
