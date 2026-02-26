/**
 * /language command — Set the bot language for the current channel.
 *
 * Standalone command, not tied to any specific procedure.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, Colors } from 'discord.js';
import type { IPericoloStore } from '../lib/store-interface.js';
import { tr, SUPPORTED_LANGS } from '../lib/i18n/index.js';
import type { Lang } from '../lib/i18n/index.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const languageCommandData = new SlashCommandBuilder()
  .setName('language')
  .setDescription('Set the bot language for this channel')
  .addStringOption((opt) =>
    opt
      .setName('language')
      .setDescription('Language (Italiano / English)')
      .setRequired(true)
      .addChoices({ name: 'Italiano', value: 'it' }, { name: 'English', value: 'en' })
  );

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleLanguageCommand(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore
): Promise<void> {
  const rawLang = interaction.options.getString('language', true);
  if (!SUPPORTED_LANGS.includes(rawLang as Lang)) {
    // Fallback error in Italian (shouldn't happen since choices are validated by Discord)
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Antartica — Peril Bot')
          .setColor(Colors.Red)
          .setDescription(`Lingua non supportata: "${rawLang}".`)
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const lang = rawLang as Lang;
  await store.setChannelLang(interaction.channelId, lang);

  logger.info('channel-lang-set', {
    channelId: interaction.channelId,
    lang,
    userId: interaction.user.id,
  });

  // Reply in the newly set language
  const t = tr(lang);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Antartica — Peril Bot')
        .setColor(Colors.Green)
        .setDescription(t.langChanged)
        .setTimestamp(),
    ],
    allowedMentions: { parse: [] },
  });
}
