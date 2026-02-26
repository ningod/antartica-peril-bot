/**
 * /privacy command — Privacy policy and data information.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildPrivacyEmbed } from '../lib/embeds.js';
import { tr } from '../lib/i18n/index.js';
import type { IPericoloStore } from '../lib/store-interface.js';
import { config } from '../lib/config.js';

export const privacyCommandData = new SlashCommandBuilder()
  .setName('privacy')
  .setDescription('Informativa sulla privacy e i dati raccolti dal bot');

export async function handlePrivacyCommand(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore
): Promise<void> {
  const lang = await store.getChannelLang(interaction.channelId);
  const t = tr(lang);
  await interaction.reply({
    embeds: [buildPrivacyEmbed(t, config)],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}
