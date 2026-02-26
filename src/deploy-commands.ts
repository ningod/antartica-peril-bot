/**
 * Slash command registration script.
 *
 * Run with: npm run deploy-commands
 *
 * Set DISCORD_GUILD_ID for guild-scoped registration (instant, dev).
 * Without DISCORD_GUILD_ID: global registration (up to 1 hour to propagate).
 */

import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { threatsCommandData } from './commands/threats.js';
import { perilCommandData } from './commands/peril.js';
import { explorerCommandData } from './commands/explorer.js';
import { languageCommandData } from './commands/language.js';
import { helpCommandData } from './commands/help.js';
import { privacyCommandData } from './commands/privacy.js';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('Missing required env vars: DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID');
  process.exit(1);
}

const commands = [
  threatsCommandData.toJSON(),
  perilCommandData.toJSON(),
  explorerCommandData.toJSON(),
  languageCommandData.toJSON(),
  helpCommandData.toJSON(),
  privacyCommandData.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(token);

void (async () => {
  try {
    console.log(`Registering ${commands.length} slash command(s)...`);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`Commands registered for guild ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Commands registered globally (up to 1 hour to propagate).');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
})();
