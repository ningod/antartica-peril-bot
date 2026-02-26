/**
 * /help command — Bot usage guide.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildHelpEmbed } from '../lib/embeds.js';
import { tr } from '../lib/i18n/index.js';
import type { IPericoloStore } from '../lib/store-interface.js';

export const helpCommandData = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Mostra la guida ai comandi del bot');

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
  store: IPericoloStore
): Promise<void> {
  const lang = await store.getChannelLang(interaction.channelId);
  const t = tr(lang);
  await interaction.reply({
    embeds: [buildHelpEmbed(t)],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}
