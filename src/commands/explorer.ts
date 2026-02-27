/**
 * /explorer command — Per-user per-channel Explorer character profile.
 *
 * Subcommands: set | add | remove | clear | list
 *
 * Explorer profiles are scoped per user and per channel.
 * They persist indefinitely (no TTL) and are fully optional —
 * the existing Peril workflow works even if no profile is defined.
 *
 * Autocomplete: /explorer remove tag  →  lists current tags as choices.
 */

import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { IPericoloStore } from '../lib/store-interface.js';
import type { ExplorerProfile, ExplorerTag } from '../lib/store-interface.js';
import { sanitizeText, LABEL_TYPE_DISPLAY, MAX_LABEL_TEXT_LENGTH } from '../lib/domain.js';
import type { LabelType } from '../lib/domain.js';
import {
  buildExplorerProfileEmbed,
  buildExplorerClearedEmbed,
  buildErrorEmbed,
} from '../lib/embeds.js';
import { tr } from '../lib/i18n/index.js';
import type { Tr } from '../lib/i18n/index.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const explorerCommandData = new SlashCommandBuilder()
  .setName('explorer')
  .setDescription('Manage your Explorer character profile')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Define your Explorer profile (replaces existing)')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription("Name Trait (tratto-nome) — your Explorer's name")
          .setRequired(true)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('archetype')
          .setDescription('Archetype Trait (tratto-archetipo, optional)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('trait')
          .setDescription('Trait (tratto, optional)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('condition')
          .setDescription('Condition (condizione, optional)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('dread')
          .setDescription('Dread (terrore, optional)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('supply')
          .setDescription('Supply (risorsa, optional)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('resignation')
          .setDescription('Add a Resignation tag (rassegnazione, optional — carries no text)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a single tag to your Explorer profile')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Tag type')
          .setRequired(true)
          .addChoices(
            { name: 'Condition', value: 'condizione' },
            { name: 'Trait', value: 'tratto' },
            { name: 'Name Trait', value: 'tratto-nome' },
            { name: 'Archetype Trait', value: 'tratto-archetipo' },
            { name: 'Marked Trait', value: 'tratto-segnato' },
            { name: 'Dread', value: 'terrore' },
            { name: 'Supply', value: 'risorsa' },
            { name: 'Resignation', value: 'rassegnazione' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('text')
          .setDescription('Tag text (not required for Resignation)')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('neg_side')
          .setDescription('Negative side — required for Marked Trait')
          .setRequired(false)
          .setMaxLength(MAX_LABEL_TEXT_LENGTH)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a tag from your Explorer profile')
      .addStringOption((opt) =>
        opt
          .setName('tag')
          .setDescription('Tag to remove (select from your profile)')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('clear').setDescription('Remove all tags from your Explorer profile')
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription("Show an Explorer profile (yours by default, or another user's)")
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('User whose profile to show (default: yourself)')
          .setRequired(false)
      )
  );

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

/**
 * Respond to autocomplete for /explorer remove tag.
 * Returns the user's current tags as choices (up to 25).
 */
export async function handleExplorerAutocomplete(
  interaction: AutocompleteInteraction,
  store: IPericoloStore
): Promise<void> {
  const profile = await store.getExplorerProfile(interaction.user.id, interaction.channelId);

  if (!profile || profile.tags.length === 0) {
    await interaction.respond([]);
    return;
  }

  const choices = profile.tags.map((tag) => {
    const typeTag = LABEL_TYPE_DISPLAY[tag.type];
    const textPart = tag.text ? ` — ${tag.text}` : '';
    return { name: `${typeTag}${textPart}`.slice(0, 100), value: tag.id };
  });

  await interaction.respond(choices.slice(0, 25));
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleExplorerCommand(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const lang = await store.getChannelLang(interaction.channelId);
  const t = tr(lang);

  if (sub === 'set') {
    await handleSet(interaction, store, t);
  } else if (sub === 'add') {
    await handleAdd(interaction, store, t);
  } else if (sub === 'remove') {
    await handleRemove(interaction, store, t);
  } else if (sub === 'clear') {
    await handleClear(interaction, store, t);
  } else if (sub === 'list') {
    await handleList(interaction, store, t);
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleSet(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  // Collect options: name is required; others optional
  const optionMap: { key: string; type: LabelType }[] = [
    { key: 'name', type: 'tratto-nome' },
    { key: 'archetype', type: 'tratto-archetipo' },
    { key: 'trait', type: 'tratto' },
    { key: 'condition', type: 'condizione' },
    { key: 'dread', type: 'terrore' },
    { key: 'supply', type: 'risorsa' },
  ];

  const tags: ExplorerTag[] = [];

  for (const { key, type } of optionMap) {
    const rawText = interaction.options.getString(key);
    if (rawText === null) continue; // optional field not provided
    const text = sanitizeText(rawText.trim());
    if (!text) continue;
    tags.push({ id: randomUUID(), type, text });
  }

  if (interaction.options.getBoolean('resignation') === true) {
    tags.push({ id: randomUUID(), type: 'rassegnazione', text: '' });
  }

  if (tags.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errAtLeastOneLabel, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const profile: ExplorerProfile = {
    userId,
    channelId,
    tags,
    updatedAt: new Date(),
  };

  await store.setExplorerProfile(profile);

  logger.info('explorer-profile-set', {
    userId,
    channelId,
    tagCount: tags.length,
  });

  await interaction.editReply({
    embeds: [buildExplorerProfileEmbed(profile, interaction.user.displayName, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleAdd(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const labelType = interaction.options.getString('type', true) as LabelType;
  const rawNegSide = interaction.options.getString('neg_side');

  // neg_side only valid for tratto-segnato
  if (rawNegSide && labelType !== 'tratto-segnato') {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNegSideOnlyForTratt, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // tratto-segnato requires neg_side
  if (labelType === 'tratto-segnato' && !rawNegSide?.trim()) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNegSideRequiredForTrattoSegnato, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

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

  const tag: ExplorerTag = { id: randomUUID(), type: labelType, text, posSide, negSide };

  // Load or create profile
  const existing = await store.getExplorerProfile(userId, channelId);
  const profile: ExplorerProfile = existing
    ? { ...existing, tags: [...existing.tags, tag], updatedAt: new Date() }
    : { userId, channelId, tags: [tag], updatedAt: new Date() };

  await store.setExplorerProfile(profile);

  logger.info('explorer-tag-added', {
    userId,
    channelId,
    labelType,
    tagCount: profile.tags.length,
  });

  await interaction.editReply({
    embeds: [buildExplorerProfileEmbed(profile, interaction.user.displayName, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleRemove(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const tagId = interaction.options.getString('tag', true);

  const profile = await store.getExplorerProfile(userId, channelId);
  if (!profile) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.explorerNoProfile, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const tagIndex = profile.tags.findIndex((tag) => tag.id === tagId);
  if (tagIndex === -1) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.explorerNoProfile, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const updatedTags = profile.tags.filter((tag) => tag.id !== tagId);
  const updatedProfile: ExplorerProfile = {
    ...profile,
    tags: updatedTags,
    updatedAt: new Date(),
  };

  await store.setExplorerProfile(updatedProfile);

  logger.info('explorer-tag-removed', {
    userId,
    channelId,
    tagCount: updatedTags.length,
  });

  await interaction.editReply({
    embeds: [buildExplorerProfileEmbed(updatedProfile, interaction.user.displayName, t)],
    allowedMentions: { parse: [] },
  });
}

async function handleClear(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  await store.clearExplorerProfile(userId, channelId);

  logger.info('explorer-profile-cleared', { userId, channelId });

  await interaction.editReply({
    embeds: [buildExplorerClearedEmbed(t)],
    allowedMentions: { parse: [] },
  });
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore,
  t: Tr
): Promise<void> {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const channelId = interaction.channelId;

  const profile = await store.getExplorerProfile(targetUser.id, channelId);
  if (!profile) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.explorerNoProfile, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.editReply({
    embeds: [buildExplorerProfileEmbed(profile, targetUser.displayName, t)],
    allowedMentions: { parse: [] },
  });
}
