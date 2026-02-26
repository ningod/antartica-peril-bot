/**
 * Button and modal interaction handlers for Antartica Peril Bot.
 *
 * Handles button types:
 *   push:<count>:<channelId>           — Push Yourself draws
 *   end-peril:<channelId>              — End Peril (end session shortcut)
 *   proceed-draw:<channelId>           — Shortcut to draw from add-label ephemeral reply
 *
 * Handles select menu type:
 *   add-label-type:<channelId>         — Type selection (rassegnazione only; others open modal)
 *
 * Handles modal type:
 *   add-label-modal:<channelId>:<type> — Add-label form submission
 *
 * Authorization: only the Guide of the active session can activate these buttons.
 */

import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { IPericoloStore } from '../lib/store-interface.js';
import type { RateLimiter } from '../lib/ratelimit.js';
import {
  drawFromBag,
  hasThreatOrVision,
  resolveUncertainDraws,
  createLabel,
  sanitizeText,
  LABEL_TYPE_DISPLAY,
  MAX_LABEL_TEXT_LENGTH,
} from '../lib/domain.js';
import type { LabelType } from '../lib/domain.js';
import {
  buildDrawEmbed,
  buildSessionEndEmbed,
  buildErrorEmbed,
  buildLabelAddedEmbed,
} from '../lib/embeds.js';
import {
  buildPerilButtons,
  buildAddLabelButtons,
  buildExplorerSuggestMenu,
  SUGGEST_CUSTOM_VALUE,
} from '../commands/peril.js';
import { tr } from '../lib/i18n/index.js';
import { logger } from '../lib/logger.js';

/**
 * Handle all button interactions.
 *
 * Called after deferUpdate() or deferReply() has already been sent by the gateway/http layer.
 */
export async function handleButton(
  interaction: ButtonInteraction,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('push:')) {
    await handlePushButton(interaction, store, limiter, customId);
  } else if (customId.startsWith('end-peril:')) {
    await handleEndPerilButton(interaction, store, limiter, customId);
  } else if (customId.startsWith('proceed-draw:')) {
    await handleProceedDrawButton(interaction, store, limiter, customId);
  }
  // Unknown button type — ignore silently
}

/**
 * Handle modal form submissions.
 *
 * Called after deferReply(ephemeral) has already been sent.
 */
export async function handleModal(
  interaction: ModalSubmitInteraction,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('add-label-modal:')) {
    await handleAddLabelModal(interaction, store, limiter, customId);
  }
  // Unknown modal type — ignore silently
}

/**
 * Handle add-label-type select menu for rassegnazione (direct add, no modal needed).
 *
 * Called after deferUpdate() has already been sent.
 * For non-rassegnazione types the modal is shown in the defer phase — no dispatch needed.
 */
export async function handleAddLabelTypeSelect(
  interaction: StringSelectMenuInteraction,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  const customId = interaction.customId;
  const channelId = customId.slice('add-label-type:'.length);
  const labelType = interaction.values[0];

  if (labelType !== 'rassegnazione') return; // other types handled via modal

  const lang = await store.getChannelLang(channelId);
  const t = tr(lang);
  const userId = interaction.user.id;

  if (!limiter.consume(userId)) {
    const retryAfter = limiter.retryAfterSeconds(userId);
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errRateLimit(retryAfter), t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const session = await store.getSession(channelId);
  if (!session) {
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errNoSessionChannel, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const label = createLabel('rassegnazione', '', undefined);

  session.bag.push(label);
  session.allLabels.push(label);
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('label-added-via-select', {
    sessionId: session.sessionId,
    channelId,
    labelType: 'rassegnazione',
    userId,
  });

  const displayName = LABEL_TYPE_DISPLAY.rassegnazione;
  const isGuide = session.guideId === userId;

  await interaction.editReply({
    embeds: [buildLabelAddedEmbed(session, displayName, t)],
    components: [buildAddLabelButtons(channelId, isGuide, t)],
    allowedMentions: { parse: [] },
  });
}

// ---------------------------------------------------------------------------
// Push Yourself button handler
// ---------------------------------------------------------------------------

async function handlePushButton(
  interaction: ButtonInteraction,
  store: IPericoloStore,
  limiter: RateLimiter,
  customId: string
): Promise<void> {
  const parts = customId.split(':');
  // Expected format: push:<count>:<channelId>
  if (parts.length < 3) {
    logger.warn('button-malformed-id', { customId });
    return;
  }

  const countStr = parts[1] ?? '';
  const channelId = parts.slice(2).join(':'); // channel IDs don't contain colons, but be safe
  const count = parseInt(countStr, 10);

  const lang = await store.getChannelLang(channelId);
  const t = tr(lang);

  if (isNaN(count) || count < 1 || count > 2) {
    logger.warn('button-invalid-count', { customId, count: countStr });
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errInvalidPushCount, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const userId = interaction.user.id;

  // Rate limit
  if (!limiter.consume(userId)) {
    const retryAfter = limiter.retryAfterSeconds(userId);
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errRateLimit(retryAfter), t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  logger.info('push-button-attempt', {
    customId,
    userId,
    channelId,
    count,
  });

  // Load session
  const session = await store.getSession(channelId);
  if (!session) {
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errNoSessionChannel, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Authorization: only the Guide
  if (session.guideId !== userId) {
    logger.info('push-button-denied', {
      customId,
      userId,
      guideId: session.guideId,
      channelId,
    });
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errNotGuidePush(session.guideName), t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Validate state: base draws must exist
  if (session.baseDraws.length === 0) {
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errPushNeedBaseFirst, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // No double push
  if (session.pushDraws.length > 0) {
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errPushAlreadyDone, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Check bag has labels
  if (session.bag.length === 0) {
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errBagEmptyPush, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Perform push draws
  const { drawn, remaining } = drawFromBag(session.bag, count);

  session.bag = remaining;
  session.pushDraws = drawn;
  session.updatedAt = new Date();

  await store.setSession(session);

  const severeConsequences = hasThreatOrVision(drawn);

  logger.info('push-button-draw', {
    sessionId: session.sessionId,
    channelId,
    count: drawn.length,
    severeConsequences,
    userId,
  });

  // Build updated embed (no push buttons anymore)
  const updatedEmbed = buildDrawEmbed(
    {
      session,
      baseDraws: session.baseDraws,
      pushDraws: drawn,
      showPushButtons: false,
    },
    t
  );

  // Edit the original message (remove buttons, show push results)
  await interaction.message.edit({
    embeds: [updatedEmbed],
    components: [],
    allowedMentions: { parse: [] },
  });
}

// ---------------------------------------------------------------------------
// Proceed-to-draw button handler
// ---------------------------------------------------------------------------

async function handleProceedDrawButton(
  interaction: ButtonInteraction,
  store: IPericoloStore,
  limiter: RateLimiter,
  customId: string
): Promise<void> {
  const channelId = customId.slice('proceed-draw:'.length);
  const lang = await store.getChannelLang(channelId);
  const t = tr(lang);
  const userId = interaction.user.id;

  // Rate limit
  if (!limiter.consume(userId)) {
    const retryAfter = limiter.retryAfterSeconds(userId);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errRateLimit(retryAfter), t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  logger.info('proceed-draw-button-attempt', { customId, userId, channelId });

  const session = await store.getSession(channelId);
  if (!session) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoSessionChannel, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Authorization: only the Guide
  if (session.guideId !== userId) {
    logger.info('proceed-draw-button-denied', {
      customId,
      userId,
      guideId: session.guideId,
      channelId,
    });
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNotGuideProceedDraw(session.guideName), t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (session.baseDraws.length > 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errDrawsAlreadyDoneReset, t)],
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

  logger.info('proceed-draw-button-draw', {
    sessionId: session.sessionId,
    channelId,
    count: drawn.length,
    remaining: remaining.length,
    userId,
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

  await interaction.editReply({
    embeds: [embed],
    components: [buildPerilButtons(channelId, hasBagLeft, t)],
    allowedMentions: { parse: [] },
  });
}

// ---------------------------------------------------------------------------
// Fine Pericolo button handler
// ---------------------------------------------------------------------------

async function handleEndPerilButton(
  interaction: ButtonInteraction,
  store: IPericoloStore,
  limiter: RateLimiter,
  customId: string
): Promise<void> {
  const channelId = customId.slice('end-peril:'.length);
  const lang = await store.getChannelLang(channelId);
  const t = tr(lang);
  const userId = interaction.user.id;

  // Rate limit
  if (!limiter.consume(userId)) {
    const retryAfter = limiter.retryAfterSeconds(userId);
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errRateLimit(retryAfter), t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  logger.info('end-peril-button-attempt', { customId, userId, channelId });

  // Load session
  const session = await store.getSession(channelId);
  if (!session) {
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errNoSessionChannel, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Authorization: only the Guide
  if (session.guideId !== userId) {
    logger.info('end-peril-button-denied', {
      customId,
      userId,
      guideId: session.guideId,
      channelId,
    });
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errNotGuideEnd(session.guideName), t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const { resolved: resolvedBase, flips: baseFlips } = resolveUncertainDraws(session.baseDraws);
  const { resolved: resolvedPush, flips: pushFlips } = resolveUncertainDraws(session.pushDraws);

  await store.deleteSession(channelId);

  logger.info('session-ended-via-button', {
    sessionId: session.sessionId,
    channelId,
    userId,
  });

  await interaction.message.edit({
    embeds: [
      buildSessionEndEmbed(session, resolvedBase, resolvedPush, [...baseFlips, ...pushFlips], t),
    ],
    components: [],
    allowedMentions: { parse: [] },
  });
}

// ---------------------------------------------------------------------------
// Explorer suggestion select handlers (button-modal flow)
// ---------------------------------------------------------------------------

/**
 * Handle add-label-type select for non-rassegnazione types when the user has
 * Explorer tags matching the selected type.
 *
 * Called after deferUpdate() has been sent.
 * Replaces the type-select message with the Explorer suggestion menu.
 * No-ops silently if the profile no longer has matching tags (modal was shown instead).
 */
export async function handleAddLabelTypeSuggest(
  interaction: StringSelectMenuInteraction,
  store: IPericoloStore
): Promise<void> {
  const customId = interaction.customId;
  const channelId = customId.slice('add-label-type:'.length);
  const labelType = interaction.values[0] as LabelType;

  if (labelType === 'rassegnazione') return;

  const profile = await store.getExplorerProfile(interaction.user.id, interaction.channelId);
  const matchingTags = profile
    ? profile.tags.filter((tag) => tag.type === labelType && tag.text)
    : [];

  // If no matching tags, modal was shown in the defer phase — nothing to do here
  if (matchingTags.length === 0) return;

  const lang = await store.getChannelLang(channelId);
  const t = tr(lang);

  await interaction.editReply({
    components: [buildExplorerSuggestMenu(channelId, labelType, matchingTags, t)],
    allowedMentions: { parse: [] },
  });
}

/**
 * Handle add-label-suggest select for direct-add types (not tratto-segnato, not __custom__).
 *
 * Called after deferUpdate() has been sent.
 * Looks up the selected tag by ID in the Explorer profile and adds it directly to the bag.
 */
export async function handleExplorerSuggestSelect(
  interaction: StringSelectMenuInteraction,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  const customId = interaction.customId;
  const suffix = customId.slice('add-label-suggest:'.length);
  const colonIdx = suffix.indexOf(':');
  const channelId = suffix.slice(0, colonIdx);
  const labelType = suffix.slice(colonIdx + 1) as LabelType;
  const tagId = interaction.values[0];

  // Safety guard — these cases are handled via modal in the defer phase
  if (labelType === 'tratto-segnato' || tagId === SUGGEST_CUSTOM_VALUE) return;

  const lang = await store.getChannelLang(channelId);
  const t = tr(lang);
  const userId = interaction.user.id;

  if (!limiter.consume(userId)) {
    const retryAfter = limiter.retryAfterSeconds(userId);
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errRateLimit(retryAfter), t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const session = await store.getSession(channelId);
  if (!session) {
    await interaction.followUp({
      embeds: [buildErrorEmbed(t.errNoSessionChannel, t)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Look up the tag text from the Explorer profile (tag ID is the select value)
  const profile = await store.getExplorerProfile(userId, channelId);
  const explorerTag = profile?.tags.find((et) => et.id === tagId);

  if (!explorerTag?.text) {
    // Tag no longer in profile (cleared between showing menu and selecting)
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errTextRequired, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const text = sanitizeText(explorerTag.text);
  const label = createLabel(labelType, text);

  session.bag.push(label);
  session.allLabels.push(label);
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('label-added-via-suggest', {
    sessionId: session.sessionId,
    channelId,
    labelType,
    userId,
  });

  const displayName = LABEL_TYPE_DISPLAY[labelType];
  const labelDesc = `${displayName} — ${text}`;
  const isGuide = session.guideId === userId;

  await interaction.editReply({
    embeds: [buildLabelAddedEmbed(session, labelDesc, t)],
    components: [buildAddLabelButtons(channelId, isGuide, t)],
    allowedMentions: { parse: [] },
  });
}

// ---------------------------------------------------------------------------
// Add-label modal handler
// ---------------------------------------------------------------------------

async function handleAddLabelModal(
  interaction: ModalSubmitInteraction,
  store: IPericoloStore,
  limiter: RateLimiter,
  customId: string
): Promise<void> {
  // customId format: add-label-modal:<channelId>:<labelType>
  const suffix = customId.slice('add-label-modal:'.length);
  const colonIdx = suffix.indexOf(':');
  const channelId = suffix.slice(0, colonIdx);
  const labelType = suffix.slice(colonIdx + 1) as LabelType;

  const lang = await store.getChannelLang(channelId);
  const t = tr(lang);
  const userId = interaction.user.id;

  // Rate limit
  if (!limiter.consume(userId)) {
    const retryAfter = limiter.retryAfterSeconds(userId);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errRateLimit(retryAfter), t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Load session
  const session = await store.getSession(channelId);
  if (!session) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errNoSessionChannel, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Parse modal fields
  const rawText = interaction.fields.getTextInputValue('text').trim();
  const rawNegSide =
    labelType === 'tratto-segnato' ? interaction.fields.getTextInputValue('neg_side').trim() : '';

  // Guard text length (modal max_length enforces it, but validate defensively)
  if (rawText.length > MAX_LABEL_TEXT_LENGTH || rawNegSide.length > MAX_LABEL_TEXT_LENGTH) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errTextTooLong, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (!rawText) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t.errTextRequired, t)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const text = sanitizeText(rawText);
  let posSide: string | undefined;
  let negSide: string | undefined;

  if (labelType === 'tratto-segnato') {
    posSide = text;
    negSide = sanitizeText(rawNegSide);
  }

  const label = createLabel(labelType, text, undefined, posSide, negSide);

  session.bag.push(label);
  session.allLabels.push(label);
  session.updatedAt = new Date();

  await store.setSession(session);

  logger.info('label-added-via-modal', {
    sessionId: session.sessionId,
    channelId,
    labelType,
    userId,
  });

  const displayName = LABEL_TYPE_DISPLAY[labelType];
  const labelDesc = `${displayName} — ${text}`;
  const isGuide = session.guideId === userId;

  await interaction.editReply({
    embeds: [buildLabelAddedEmbed(session, labelDesc, t)],
    components: [buildAddLabelButtons(channelId, isGuide, t)],
    allowedMentions: { parse: [] },
  });
}
