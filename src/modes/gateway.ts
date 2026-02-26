/**
 * Gateway mode — discord.js WebSocket-based interaction handling.
 */

import {
  Client,
  GatewayIntentBits,
  Events,
  InteractionType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import type { TextInputBuilder as TextInputBuilderType } from 'discord.js';
import { handleThreatsCommand } from '../commands/threats.js';
import { handlePerilCommand } from '../commands/peril.js';
import { handleHelpCommand } from '../commands/help.js';
import { handlePrivacyCommand } from '../commands/privacy.js';
import { handleLanguageCommand } from '../commands/language.js';
import { handleExplorerCommand, handleExplorerAutocomplete } from '../commands/explorer.js';
import {
  handleButton,
  handleModal,
  handleAddLabelTypeSelect,
  handleAddLabelTypeSuggest,
  handleExplorerSuggestSelect,
} from '../interactions/buttons.js';
import {
  buildAddLabelTypeSelect,
  handlePerilAutocomplete,
  SUGGEST_CUSTOM_VALUE,
} from '../commands/peril.js';
import type { IPericoloStore } from '../lib/store-interface.js';
import type { RateLimiter } from '../lib/ratelimit.js';
import { MAX_LABEL_TEXT_LENGTH } from '../lib/domain.js';
import type { LabelType } from '../lib/domain.js';
import { tr } from '../lib/i18n/index.js';
import type { Tr } from '../lib/i18n/index.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Modal builder helper
// ---------------------------------------------------------------------------

function buildAddLabelModal(
  channelId: string,
  labelType: LabelType,
  t: Tr,
  preFilledText = '',
  preFilledNegSide = ''
): ModalBuilder {
  const textInput = new TextInputBuilder()
    .setCustomId('text')
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    .setLabel(t.modalFieldText)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(MAX_LABEL_TEXT_LENGTH);

  if (preFilledText) textInput.setValue(preFilledText);

  const rows: ActionRowBuilder<TextInputBuilderType>[] = [
    new ActionRowBuilder<TextInputBuilderType>().addComponents(textInput),
  ];

  if (labelType === 'tratto-segnato') {
    const negSideInput = new TextInputBuilder()
      .setCustomId('neg_side')
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      .setLabel(t.modalFieldNegSide)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(MAX_LABEL_TEXT_LENGTH);

    if (preFilledNegSide) negSideInput.setValue(preFilledNegSide);

    rows.push(new ActionRowBuilder<TextInputBuilderType>().addComponents(negSideInput));
  }

  return (
    new ModalBuilder()
      .setCustomId(`add-label-modal:${channelId}:${labelType}`)
      .setTitle(t.modalTitle)
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      .addComponents(...rows)
  );
}

// ---------------------------------------------------------------------------
// Gateway startup
// ---------------------------------------------------------------------------

export function startGateway(store: IPericoloStore, limiter: RateLimiter): Client {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.error('missing-token', {
      message: 'DISCORD_BOT_TOKEN environment variable is not set.',
    });
    process.exit(1);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info('ready', {
      user: readyClient.user.tag,
      guilds: readyClient.guilds.cache.size,
    });
    store.start();
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void (async () => {
      // ---- Autocomplete phase (must respond synchronously, no defer) ----
      if (interaction.isAutocomplete()) {
        try {
          if (interaction.commandName === 'peril') {
            await handlePerilAutocomplete(interaction, store);
          } else if (interaction.commandName === 'explorer') {
            await handleExplorerAutocomplete(interaction, store);
          }
        } catch (err) {
          logger.error('autocomplete-error', {
            command: interaction.commandName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // ---- Immediate defer phase (must complete within 3s) ----
      try {
        if (interaction.isChatInputCommand()) {
          const cmd = interaction.commandName;
          const sub = interaction.options.getSubcommand(false);

          if (cmd === 'threats') {
            // list is ephemeral; set/clear are public
            const isEphemeral = sub === 'list';
            await interaction.deferReply({
              flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
            });
          } else if (cmd === 'peril') {
            // bag is ephemeral; draw/end are public; others ephemeral
            const publicSubs = new Set(['draw', 'end']);
            const isEphemeral = sub !== null && !publicSubs.has(sub);
            await interaction.deferReply({
              flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
            });
          } else if (cmd === 'explorer') {
            // all explorer subcommands are ephemeral
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          } else if (cmd === 'language') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          } else if (cmd === 'help' || cmd === 'privacy') {
            // These use interaction.reply() directly (not deferred)
            // do nothing here
          }
        }

        if (interaction.isButton()) {
          const customId = interaction.customId;
          if (customId.startsWith('push:') || customId.startsWith('end-peril:')) {
            await interaction.deferUpdate();
          } else if (customId.startsWith('proceed-draw:')) {
            // New public message (not an edit of the original message)
            await interaction.deferReply();
          } else if (customId.startsWith('add-label:')) {
            const channelId = customId.slice('add-label:'.length);
            const lang = await store.getChannelLang(channelId);
            const t = tr(lang);
            // Respond with ephemeral type-selection menu — showModal comes from select interaction
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              components: [buildAddLabelTypeSelect(channelId, t)],
              allowedMentions: { parse: [] },
            });
          }
        }

        if (interaction.isStringSelectMenu()) {
          const customId = interaction.customId;
          if (customId.startsWith('add-label-type:')) {
            const channelId = customId.slice('add-label-type:'.length);
            const selectedType = interaction.values[0] as LabelType;

            if (selectedType === 'rassegnazione') {
              // Edit the select menu message with the result in-place
              await interaction.deferUpdate();
            } else {
              // Check whether the user has Explorer tags for this type
              const profile = await store.getExplorerProfile(interaction.user.id, channelId);
              const matchingTags = profile
                ? profile.tags.filter((tag) => tag.type === selectedType && tag.text)
                : [];

              if (matchingTags.length > 0) {
                // Defer update — dispatch will replace the menu with the suggestion select
                await interaction.deferUpdate();
              } else {
                // No suggestions — show blank modal immediately
                const lang = await store.getChannelLang(channelId);
                const t = tr(lang);
                await interaction.showModal(buildAddLabelModal(channelId, selectedType, t));
              }
            }
          } else if (customId.startsWith('add-label-suggest:')) {
            const suffix = customId.slice('add-label-suggest:'.length);
            const colonIdx = suffix.indexOf(':');
            const channelId = suffix.slice(0, colonIdx);
            const labelType = suffix.slice(colonIdx + 1) as LabelType;
            const selectedValue = interaction.values[0];

            if (selectedValue === SUGGEST_CUSTOM_VALUE) {
              // User wants to type a custom value — show blank modal
              const lang = await store.getChannelLang(channelId);
              const t = tr(lang);
              await interaction.showModal(buildAddLabelModal(channelId, labelType, t));
            } else if (labelType === 'tratto-segnato') {
              // Tratto-segnato needs both sides — show pre-populated modal
              const lang = await store.getChannelLang(channelId);
              const t = tr(lang);
              const profile = await store.getExplorerProfile(interaction.user.id, channelId);
              const explorerTag = profile?.tags.find((et) => et.id === selectedValue);
              await interaction.showModal(
                buildAddLabelModal(
                  channelId,
                  labelType,
                  t,
                  explorerTag?.posSide ?? '',
                  explorerTag?.negSide ?? ''
                )
              );
            } else {
              // Direct add — deferUpdate; dispatch handles adding the tag
              await interaction.deferUpdate();
            }
          }
        }

        if (interaction.isModalSubmit()) {
          if (interaction.customId.startsWith('add-label-modal:')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          }
        }
      } catch (err) {
        const isAlreadyAcked =
          err instanceof Error &&
          (err.message.includes('Unknown interaction') ||
            err.message.includes('Interaction has already been acknowledged'));

        if (!isAlreadyAcked) {
          logger.error('defer-failed', {
            interactionId: interaction.id,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }

      // ---- Dispatch phase ----
      try {
        if (interaction.isChatInputCommand()) {
          logger.info('interaction', {
            type: 'slash-command',
            command: interaction.commandName,
            userId: interaction.user.id,
            channelId: interaction.channelId,
          });

          const cmd = interaction.commandName;

          if (cmd === 'threats') {
            await handleThreatsCommand(interaction, store);
          } else if (cmd === 'peril') {
            await handlePerilCommand(interaction, store, limiter);
          } else if (cmd === 'explorer') {
            await handleExplorerCommand(interaction, store);
          } else if (cmd === 'language') {
            await handleLanguageCommand(interaction, store);
          } else if (cmd === 'help') {
            await handleHelpCommand(interaction, store);
          } else if (cmd === 'privacy') {
            await handlePrivacyCommand(interaction, store);
          }
          return;
        }

        if (interaction.isButton()) {
          logger.info('interaction', {
            type: 'button',
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
          });

          if (
            interaction.customId.startsWith('push:') ||
            interaction.customId.startsWith('end-peril:') ||
            interaction.customId.startsWith('proceed-draw:')
          ) {
            await handleButton(interaction, store, limiter);
          }
          // add-label: handled via reply+select in defer phase — no async dispatch
          return;
        }

        if (interaction.isStringSelectMenu()) {
          const customId = interaction.customId;
          const selectedType = interaction.values[0];

          logger.info('interaction', {
            type: 'select-menu',
            customId,
            selectedType,
            userId: interaction.user.id,
            channelId: interaction.channelId,
          });

          if (customId.startsWith('add-label-type:')) {
            if (selectedType === 'rassegnazione') {
              await handleAddLabelTypeSelect(interaction, store, limiter);
            } else {
              // Show Explorer suggestion menu, or no-op if modal was shown in defer phase
              await handleAddLabelTypeSuggest(interaction, store);
            }
          } else if (customId.startsWith('add-label-suggest:')) {
            // Only dispatch direct-add cases (__custom__ and tratto-segnato use modal)
            if (selectedType !== SUGGEST_CUSTOM_VALUE && !customId.endsWith(':tratto-segnato')) {
              await handleExplorerSuggestSelect(interaction, store, limiter);
            }
          }
          return;
        }

        if (interaction.isModalSubmit()) {
          logger.info('interaction', {
            type: 'modal',
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
          });

          if (interaction.customId.startsWith('add-label-modal:')) {
            await handleModal(interaction, store, limiter);
          }
          return;
        }
      } catch (err) {
        const isStale =
          err instanceof Error &&
          (err.message.includes('Unknown interaction') ||
            err.message.includes('Interaction has already been acknowledged'));

        if (isStale) {
          logger.info('stale-interaction-ignored', {
            type: InteractionType[interaction.type],
            interactionId: interaction.id,
          });
          return;
        }

        logger.error('interaction-error', {
          type: InteractionType[interaction.type],
          error: err instanceof Error ? err.message : String(err),
          interactionId: interaction.id,
          userId: interaction.user.id,
        });

        try {
          if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            // Use fallback Italian for unexpected errors (channel lang not available here)
            const t = tr('it');
            await interaction.reply({
              content: t.errUnexpected,
              flags: MessageFlags.Ephemeral,
            });
          }
        } catch {
          // Ignore — can't respond after error
        }
      }
    })();
  });

  void client.login(token);
  return client;
}
