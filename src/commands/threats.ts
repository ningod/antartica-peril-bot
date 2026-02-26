/**
 * /threats command — Channel-scoped Threat Pool management.
 *
 * Subcommands: set | list | clear
 *
 * The Threat Pool is scoped to the current channel.
 * Composition rules vary by Act:
 *   Act I:    exactly 2 labels, no Visioni
 *   Act II:   exactly 3 labels, at least 1 Visione
 *   Act III:  exactly 3 labels, any mix
 *   Unknown:  1–3 labels accepted (2+ suggested)
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import type { IPericoloStore } from '../lib/store-interface.js';
import { createLabel, sanitizeText, MAX_LABEL_TEXT_LENGTH } from '../lib/domain.js';
import {
  buildThreatPoolEmbed,
  buildThreatPoolClearedEmbed,
  buildErrorEmbed,
} from '../lib/embeds.js';
import { tr } from '../lib/i18n/index.js';
import type { Tr } from '../lib/i18n/index.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const threatsCommandData = new SlashCommandBuilder()
  .setName('threats')
  .setDescription('Manage the channel Threat Pool')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set the Threat Pool (2–3 tags; replaces existing)')
      .addStringOption((opt) =>
        opt
          .setName('threat1')
          .setDescription('First Threat/Vision tag')
          .setRequired(true)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('type1')
          .setDescription('First tag type (default: Threat)')
          .setRequired(false)
          .addChoices({ name: 'Threat', value: 'minaccia' }, { name: 'Vision', value: 'visione' })
      )
      .addStringOption((opt) =>
        opt
          .setName('threat2')
          .setDescription('Second tag (optional)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('type2')
          .setDescription('Second tag type (default: Threat)')
          .setRequired(false)
          .addChoices({ name: 'Threat', value: 'minaccia' }, { name: 'Vision', value: 'visione' })
      )
      .addStringOption((opt) =>
        opt
          .setName('threat3')
          .setDescription('Third tag (optional)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('type3')
          .setDescription('Third tag type (default: Threat)')
          .setRequired(false)
          .addChoices({ name: 'Threat', value: 'minaccia' }, { name: 'Vision', value: 'visione' })
      )
      .addStringOption((opt) =>
        opt
          .setName('act')
          .setDescription('Current Act — enables composition validation (optional)')
          .setRequired(false)
          .addChoices(
            { name: 'Atto I', value: '1' },
            { name: 'Atto II', value: '2' },
            { name: 'Atto III', value: '3' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Show the current channel Threat Pool')
  )
  .addSubcommand((sub) => sub.setName('clear').setDescription('Clear the channel Threat Pool'));

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleThreatsCommand(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore
): Promise<void> {
  const guildId = interaction.guildId;
  const lang = await store.getChannelLang(interaction.channelId);
  const t = tr(lang);

  if (!guildId) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoGuild, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const channelId = interaction.channelId;
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    await handleSet(interaction, store, guildId, channelId, t);
  } else if (sub === 'list') {
    await handleList(interaction, store, channelId, t);
  } else if (sub === 'clear') {
    await handleClear(interaction, store, guildId, channelId, t);
  }
}

// ---------------------------------------------------------------------------
// Act-based composition validation
// ---------------------------------------------------------------------------

type ThreatType = 'minaccia' | 'visione';

function validateComposition(types: ThreatType[], act: string | null, t: Tr): string | null {
  const total = types.length;
  const visions = types.filter((type) => type === 'visione').length;

  if (act === '1') {
    if (total !== 2) return t.errAct1Exactly2;
    if (visions > 0) return t.errAct1NoVisioni;
  } else if (act === '2') {
    if (total !== 3) return t.errAct2Count;
    if (visions < 1) return t.errAct2AtLeastOneVisione;
  } else if (act === '3') {
    if (total !== 3) return t.errAct3Exactly3;
  }
  // Unknown act: no enforcement
  return null;
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleSet(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  guildId: string,
  channelId: string,
  t: Tr
): Promise<void> {
  const rawTexts = [
    interaction.options.getString('threat1', true),
    interaction.options.getString('threat2'),
    interaction.options.getString('threat3'),
  ].filter((text): text is string => text !== null && text.trim().length > 0);

  const texts = rawTexts.map((text) => sanitizeText(text.trim()));

  if (texts.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errAtLeastOneLabel, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Read type for each label; default to 'minaccia'
  const typeOptions = [
    interaction.options.getString('type1'),
    interaction.options.getString('type2'),
    interaction.options.getString('type3'),
  ];

  const labelTypes: ThreatType[] = texts.map((_, i) => {
    const raw = typeOptions[i];
    return raw === 'visione' ? 'visione' : 'minaccia';
  });

  // Act-based composition validation
  const act = interaction.options.getString('act');
  const validationError = validateComposition(labelTypes, act, t);
  if (validationError) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(validationError, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const labels = texts.map((text, i) => createLabel(labelTypes[i], text));

  const pool = {
    channelId,
    labels,
    updatedAt: new Date(),
  };

  await store.setThreatPool(pool);

  logger.info('threat-pool-set', {
    guildId,
    channelId,
    count: labels.length,
    act: act ?? 'unknown',
    userId: interaction.user.id,
  });

  // Build reply; include a soft suggestion if act is unknown and count < 2
  const showSuggestion = act === null && labels.length < 2;
  const embed = buildThreatPoolEmbed(pool, t);
  if (showSuggestion) {
    embed.setDescription((embed.data.description ?? '') + t.suggestionAtLeast2);
  }

  await interaction.editReply({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  channelId: string,
  t: Tr
): Promise<void> {
  const pool = await store.getThreatPool(channelId);

  if (!pool) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoThreatPoolList, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.editReply({
    embeds: [buildThreatPoolEmbed(pool, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleClear(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  guildId: string,
  channelId: string,
  t: Tr
): Promise<void> {
  await store.clearThreatPool(channelId);

  logger.info('threat-pool-cleared', {
    guildId,
    channelId,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    embeds: [buildThreatPoolClearedEmbed(t)],
    allowedMentions: { parse: [] },
  });
}
