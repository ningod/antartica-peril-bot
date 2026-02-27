/**
 * HTTP interactions server for Discord.
 *
 * Receives Discord interaction POSTs, verifies Ed25519 signatures,
 * sends deferred responses within the 3-second deadline, then
 * processes handlers asynchronously using REST API for replies.
 *
 * Endpoints:
 *   POST /interactions — Discord interaction handler
 *   GET  /health       — Health check
 */

import http from 'node:http';
import { REST } from 'discord.js';
import {
  InteractionType,
  InteractionResponseType,
  MessageFlags,
  ApplicationCommandOptionType,
  ComponentType,
} from 'discord-api-types/v10';
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandAutocompleteInteraction,
  APIMessageComponentInteraction,
  APIModalSubmitInteraction,
} from 'discord-api-types/v10';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { verifyDiscordSignature } from './verify.js';
import {
  createCommandInteraction,
  createButtonInteraction,
  createStringSelectMenuInteraction,
  createModalSubmitInteraction,
} from './adapter.js';
import { handleThreatsCommand } from '../commands/threats.js';
import { handlePerilCommand } from '../commands/peril.js';
import { handleHelpCommand } from '../commands/help.js';
import { handlePrivacyCommand } from '../commands/privacy.js';
import { handleLanguageCommand } from '../commands/language.js';
import { handleExplorerCommand } from '../commands/explorer.js';
import {
  handleButton,
  handleModal,
  handleAddLabelTypeSelect,
  handleAddLabelTypeSuggest,
  handleExplorerSuggestSelect,
} from '../interactions/buttons.js';
import type { IPericoloStore } from '../lib/store-interface.js';
import type { RateLimiter } from '../lib/ratelimit.js';
import { MAX_LABEL_TEXT_LENGTH, LABEL_TYPE_DISPLAY } from '../lib/domain.js';
import type { LabelType } from '../lib/domain.js';
import { tr } from '../lib/i18n/index.js';
import type { Tr } from '../lib/i18n/index.js';
import { logger } from '../lib/logger.js';

import { buildAddLabelTypeSelect, SUGGEST_CUSTOM_VALUE } from '../commands/peril.js';
import type { StringSelectMenuInteraction } from 'discord.js';

// Discord modal interaction response type
const INTERACTION_RESPONSE_TYPE_MODAL = 9;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString());
    });
    req.on('error', reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

// ---------------------------------------------------------------------------
// Modal payload builder
// ---------------------------------------------------------------------------

function buildModalPayload(
  channelId: string,
  labelType: LabelType,
  t: Tr,
  preFilledText?: string,
  preFilledNegSide?: string
): unknown {
  const textComponent: Record<string, unknown> = {
    type: 4, // TextInput
    custom_id: 'text',
    label: t.modalFieldText,
    style: 1, // Short
    required: true,
    max_length: MAX_LABEL_TEXT_LENGTH,
  };
  if (preFilledText) textComponent.value = preFilledText;

  const components: unknown[] = [{ type: 1, components: [textComponent] }];

  if (labelType === 'tratto-segnato') {
    const negSideComponent: Record<string, unknown> = {
      type: 4,
      custom_id: 'neg_side',
      label: t.modalFieldNegSide,
      style: 1,
      required: true,
      max_length: MAX_LABEL_TEXT_LENGTH,
    };
    if (preFilledNegSide) negSideComponent.value = preFilledNegSide;
    components.push({ type: 1, components: [negSideComponent] });
  }

  return {
    type: INTERACTION_RESPONSE_TYPE_MODAL,
    data: {
      custom_id: `add-label-modal:${channelId}:${labelType}`,
      title: t.modalTitle,
      components,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: extract userId and channelId from raw component interaction payload
// ---------------------------------------------------------------------------

function extractComponentIds(data: APIMessageComponentInteraction): {
  userId: string;
  channelId: string;
} {
  const raw = data as unknown as {
    member?: { user?: { id?: string } };
    user?: { id?: string };
    channel_id?: string;
  };
  const userId = raw.member?.user?.id ?? raw.user?.id ?? '';
  const channelId = raw.channel_id ?? '';
  return { userId, channelId };
}

// ---------------------------------------------------------------------------
// Autocomplete helper: extract userId and channelId from raw Discord payload
// ---------------------------------------------------------------------------

function extractAutocompleteIds(data: APIApplicationCommandAutocompleteInteraction): {
  userId: string;
  channelId: string;
} {
  const raw = data as unknown as {
    member?: { user?: { id?: string } };
    user?: { id?: string };
    channel_id?: string;
  };
  const userId = raw.member?.user?.id ?? raw.user?.id ?? '';
  const channelId = raw.channel_id ?? '';
  return { userId, channelId };
}

// ---------------------------------------------------------------------------
// Interaction handler factory
// ---------------------------------------------------------------------------

function createInteractionHandler(
  rest: REST,
  appId: string,
  publicKey: string,
  store: IPericoloStore,
  limiter: RateLimiter
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    const rawBody = await readBody(req);
    const signature = req.headers['x-signature-ed25519'] as string | undefined;
    const timestamp = req.headers['x-signature-timestamp'] as string | undefined;

    if (!signature || !timestamp) {
      jsonResponse(res, 401, { error: 'Missing signature headers' });
      return;
    }

    const valid = await verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
    if (!valid) {
      jsonResponse(res, 401, { error: 'Invalid signature' });
      return;
    }

    const interaction = JSON.parse(rawBody) as { type: InteractionType };
    const type = interaction.type;

    // PING → PONG
    if (type === InteractionType.Ping) {
      jsonResponse(res, 200, { type: InteractionResponseType.Pong });
      return;
    }

    // AUTOCOMPLETE — respond synchronously with choices (no defer)
    if (type === InteractionType.ApplicationCommandAutocomplete) {
      const data = interaction as unknown as APIApplicationCommandAutocompleteInteraction;
      const commandName = data.data.name;
      const { userId, channelId } = extractAutocompleteIds(data);

      const choices: { name: string; value: string }[] = [];

      if (commandName === 'explorer') {
        const profile = await store.getExplorerProfile(userId, channelId);
        if (profile) {
          for (const tag of profile.tags.slice(0, 25)) {
            const typeTag = LABEL_TYPE_DISPLAY[tag.type];
            const textPart = tag.text ? ` — ${tag.text}` : '';
            choices.push({ name: `${typeTag}${textPart}`.slice(0, 100), value: tag.id });
          }
        }
      } else if (commandName === 'peril') {
        // Extract options from the raw autocomplete payload (subcommand structure)
        interface RawOption {
          type: number;
          name: string;
          value?: string;
          focused?: boolean;
          options?: RawOption[];
        }
        const rawOpts = (data as unknown as { data: { options?: RawOption[] } }).data.options ?? [];
        const addSub = rawOpts.find(
          // 1 = ApplicationCommandOptionType.Subcommand
          (o) => o.type === 1 && o.name === 'add'
        );
        const subOptions = addSub?.options ?? [];
        const focusedOpt = subOptions.find((o) => o.focused);

        if (focusedOpt?.name === 'text') {
          const primaryType = subOptions.find((o) => o.name === 'type')?.value ?? null;
          const subtype = subOptions.find((o) => o.name === 'subtype')?.value ?? null;
          const focusedValue = (focusedOpt.value ?? '').toLowerCase();

          if (primaryType && primaryType !== 'rassegnazione') {
            const profile = await store.getExplorerProfile(userId, channelId);
            if (profile) {
              let targetTypes: string[];
              if (subtype) {
                targetTypes = [subtype];
              } else if (primaryType === 'condizione') {
                targetTypes = ['condizione'];
              } else if (primaryType === 'tratto') {
                targetTypes = ['tratto', 'tratto-nome', 'tratto-archetipo', 'tratto-segnato'];
              } else if (primaryType === 'risorsa') {
                targetTypes = ['risorsa'];
              } else {
                targetTypes = [];
              }

              for (const tag of profile.tags) {
                if (choices.length >= 25) break;
                if (!targetTypes.includes(tag.type) || !tag.text) continue;
                if (focusedValue && !tag.text.toLowerCase().includes(focusedValue)) continue;
                const typeDisplay = LABEL_TYPE_DISPLAY[tag.type];
                choices.push({
                  name: `${typeDisplay} — ${tag.text}`.slice(0, 100),
                  value: tag.text.slice(0, 100),
                });
              }
            }
          }
        }
      }

      jsonResponse(res, 200, {
        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
        data: { choices },
      });
      return;
    }

    // APPLICATION_COMMAND
    if (type === InteractionType.ApplicationCommand) {
      const data = interaction as unknown as APIApplicationCommandInteraction;
      const commandName = data.data.name;
      const token = data.token;

      // All commands use ephemeral deferral for safety; peril draw/end are overridden
      let deferFlags: number | undefined = MessageFlags.Ephemeral;
      if (commandName === 'peril') {
        // peek subcommand to determine defer type
        const subOpt = 'options' in data.data ? data.data.options : undefined;
        const sub = subOpt?.find((o) => o.type === ApplicationCommandOptionType.Subcommand)?.name;
        if (sub === 'draw' || sub === 'end') {
          deferFlags = undefined; // public
        }
      } else if (commandName === 'help' || commandName === 'privacy') {
        deferFlags = undefined; // help replies directly, no pre-defer needed
      }

      const deferBody: Record<string, unknown> = {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      };
      if (deferFlags) deferBody.data = { flags: deferFlags };
      jsonResponse(res, 200, deferBody);

      void handleCommand(rest, appId, token, data, commandName, store, limiter);
      return;
    }

    // MESSAGE_COMPONENT (buttons + select menus)
    if (type === InteractionType.MessageComponent) {
      const data = interaction as unknown as APIMessageComponentInteraction;
      const customId = data.data.custom_id;
      const token = data.token;
      const componentType = (data.data as unknown as { component_type?: number }).component_type;

      // --- StringSelectMenu: add-label-type ---
      if (componentType === ComponentType.StringSelect && customId.startsWith('add-label-type:')) {
        const labelChannelId = customId.slice('add-label-type:'.length);
        const rawValues = (data.data as unknown as { values?: string[] }).values ?? [];
        const selectedType = rawValues[0] as LabelType | undefined;

        if (!selectedType) {
          jsonResponse(res, 400, { error: 'Missing select value' });
          return;
        }

        if (selectedType === 'rassegnazione') {
          // Defer update — edit the select menu message with the result
          jsonResponse(res, 200, { type: InteractionResponseType.DeferredMessageUpdate });
          void handleStringSelectMenu(rest, appId, token, data, customId, store, limiter);
        } else {
          // Check whether the user has Explorer tags for this type
          const { userId } = extractComponentIds(data);
          const profile = await store.getExplorerProfile(userId, labelChannelId);
          const matchingTags = profile
            ? profile.tags.filter((tag) => tag.type === selectedType && tag.text)
            : [];

          if (matchingTags.length > 0) {
            // Defer update — async handler will replace menu with the suggestion select
            jsonResponse(res, 200, { type: InteractionResponseType.DeferredMessageUpdate });
            void handleStringSelectMenuSuggest(rest, appId, token, data, customId, store);
          } else {
            // No suggestions — show blank modal immediately
            const lang = await store.getChannelLang(labelChannelId);
            const t = tr(lang);
            jsonResponse(res, 200, buildModalPayload(labelChannelId, selectedType, t));
          }
        }
        return;
      }

      // --- StringSelectMenu: add-label-suggest ---
      if (
        componentType === ComponentType.StringSelect &&
        customId.startsWith('add-label-suggest:')
      ) {
        const suffix = customId.slice('add-label-suggest:'.length);
        const colonIdx = suffix.indexOf(':');
        const labelChannelId = suffix.slice(0, colonIdx);
        const labelType = suffix.slice(colonIdx + 1) as LabelType;
        const rawValues = (data.data as unknown as { values?: string[] }).values ?? [];
        const selectedValue = rawValues[0];
        const lang = await store.getChannelLang(labelChannelId);
        const t = tr(lang);

        if (!selectedValue || selectedValue === SUGGEST_CUSTOM_VALUE) {
          // User chose "Enter custom text" — show blank modal
          jsonResponse(res, 200, buildModalPayload(labelChannelId, labelType, t));
        } else if (labelType === 'tratto-segnato') {
          // Tratto-segnato needs both sides — show pre-populated modal
          const { userId } = extractComponentIds(data);
          const profile = await store.getExplorerProfile(userId, labelChannelId);
          const explorerTag = profile?.tags.find((et) => et.id === selectedValue);
          jsonResponse(
            res,
            200,
            buildModalPayload(
              labelChannelId,
              labelType,
              t,
              explorerTag?.posSide,
              explorerTag?.negSide
            )
          );
        } else {
          // Direct add — defer update, async handler adds the tag
          jsonResponse(res, 200, { type: InteractionResponseType.DeferredMessageUpdate });
          void handleExplorerSuggestSelectHttp(rest, appId, token, data, customId, store, limiter);
        }
        return;
      }

      // --- Button: add-label → ephemeral select menu ---
      if (customId.startsWith('add-label:')) {
        const labelChannelId = customId.slice('add-label:'.length);
        const lang = await store.getChannelLang(labelChannelId);
        const t = tr(lang);
        const selectRow = buildAddLabelTypeSelect(labelChannelId, t).toJSON();
        jsonResponse(res, 200, {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            components: [selectRow],
            allowed_mentions: { parse: [] },
          },
        });
        return;
      }

      // --- Other buttons ---
      let responseType: number;
      let deferFlags: number | undefined;

      if (customId.startsWith('push:') || customId.startsWith('end-peril:')) {
        responseType = InteractionResponseType.DeferredMessageUpdate;
      } else if (customId.startsWith('proceed-draw:')) {
        responseType = InteractionResponseType.DeferredChannelMessageWithSource;
        // public — no flags
      } else if (
        customId.startsWith('confirm-add-label:') ||
        customId.startsWith('cancel-add-label:')
      ) {
        // Edit the ephemeral warning message in-place
        responseType = InteractionResponseType.DeferredMessageUpdate;
      } else {
        responseType = InteractionResponseType.DeferredChannelMessageWithSource;
        deferFlags = MessageFlags.Ephemeral;
      }

      const deferBody: Record<string, unknown> = { type: responseType };
      if (deferFlags) deferBody.data = { flags: deferFlags };
      jsonResponse(res, 200, deferBody);

      void handleComponent(rest, appId, token, data, customId, store, limiter);
      return;
    }

    // MODAL_SUBMIT
    {
      const data = interaction as unknown as APIModalSubmitInteraction;
      const token = data.token;

      jsonResponse(res, 200, {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
      });

      void handleModalComponent(rest, appId, token, data, store, limiter);
      return;
    }
  };
}

// ---------------------------------------------------------------------------
// Async command processing
// ---------------------------------------------------------------------------

async function handleCommand(
  rest: REST,
  appId: string,
  token: string,
  data: APIApplicationCommandInteraction,
  commandName: string,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  try {
    const adapter = createCommandInteraction(rest, appId, token, data as never);
    const interaction = adapter as unknown as ChatInputCommandInteraction;

    logger.info('http-command', {
      command: commandName,
      userId: (adapter.user as { id: string }).id,
      channelId: adapter.channelId as string,
    });

    if (commandName === 'threats') {
      await handleThreatsCommand(interaction, store);
    } else if (commandName === 'peril') {
      await handlePerilCommand(interaction, store, limiter);
    } else if (commandName === 'explorer') {
      await handleExplorerCommand(interaction, store);
    } else if (commandName === 'language') {
      await handleLanguageCommand(interaction, store);
    } else if (commandName === 'help') {
      await handleHelpCommand(interaction, store);
    } else if (commandName === 'privacy') {
      await handlePrivacyCommand(interaction, store);
    }
  } catch (err) {
    logger.error('http-command-error', {
      command: commandName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Async component processing
// ---------------------------------------------------------------------------

async function handleComponent(
  rest: REST,
  appId: string,
  token: string,
  data: APIMessageComponentInteraction,
  customId: string,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  try {
    const adapter = createButtonInteraction(rest, appId, token, data as never);
    const interaction = adapter as unknown as ButtonInteraction;

    logger.info('http-button', {
      customId,
      userId: (adapter.user as { id: string }).id,
      channelId: adapter.channelId as string,
    });

    if (
      customId.startsWith('push:') ||
      customId.startsWith('end-peril:') ||
      customId.startsWith('proceed-draw:') ||
      customId.startsWith('confirm-add-label:') ||
      customId.startsWith('cancel-add-label:')
    ) {
      await handleButton(interaction, store, limiter);
    }
  } catch (err) {
    logger.error('http-component-error', {
      customId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Async select menu processing (rassegnazione direct-add)
// ---------------------------------------------------------------------------

async function handleStringSelectMenu(
  rest: REST,
  appId: string,
  token: string,
  data: APIMessageComponentInteraction,
  customId: string,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  try {
    const adapter = createStringSelectMenuInteraction(rest, appId, token, data as never);
    const interaction = adapter as unknown as StringSelectMenuInteraction;

    logger.info('http-select-menu', {
      customId,
      userId: (adapter.user as { id: string }).id,
      channelId: adapter.channelId as string,
    });

    if (customId.startsWith('add-label-type:')) {
      await handleAddLabelTypeSelect(interaction, store, limiter);
    }
  } catch (err) {
    logger.error('http-select-error', {
      customId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Async select menu processing (add-label-type with Explorer suggestions)
// ---------------------------------------------------------------------------

async function handleStringSelectMenuSuggest(
  rest: REST,
  appId: string,
  token: string,
  data: APIMessageComponentInteraction,
  customId: string,
  store: IPericoloStore
): Promise<void> {
  try {
    const adapter = createStringSelectMenuInteraction(rest, appId, token, data as never);
    const interaction = adapter as unknown as StringSelectMenuInteraction;

    logger.info('http-select-suggest', {
      customId,
      userId: (adapter.user as { id: string }).id,
      channelId: adapter.channelId as string,
    });

    await handleAddLabelTypeSuggest(interaction, store);
  } catch (err) {
    logger.error('http-select-suggest-error', {
      customId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Async select menu processing (add-label-suggest direct add)
// ---------------------------------------------------------------------------

async function handleExplorerSuggestSelectHttp(
  rest: REST,
  appId: string,
  token: string,
  data: APIMessageComponentInteraction,
  customId: string,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  try {
    const adapter = createStringSelectMenuInteraction(rest, appId, token, data as never);
    const interaction = adapter as unknown as StringSelectMenuInteraction;

    logger.info('http-select-suggest-direct', {
      customId,
      userId: (adapter.user as { id: string }).id,
      channelId: adapter.channelId as string,
    });

    await handleExplorerSuggestSelect(interaction, store, limiter);
  } catch (err) {
    logger.error('http-select-suggest-direct-error', {
      customId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Async modal processing
// ---------------------------------------------------------------------------

async function handleModalComponent(
  rest: REST,
  appId: string,
  token: string,
  data: APIModalSubmitInteraction,
  store: IPericoloStore,
  limiter: RateLimiter
): Promise<void> {
  try {
    const adapter = createModalSubmitInteraction(rest, appId, token, data as never);
    const interaction = adapter as unknown as ModalSubmitInteraction;

    logger.info('http-modal', {
      customId: adapter.customId as string,
      userId: (adapter.user as { id: string }).id,
      channelId: adapter.channelId as string,
    });

    await handleModal(interaction, store, limiter);
  } catch (err) {
    logger.error('http-modal-error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

export function startHttpServer(store: IPericoloStore, limiter: RateLimiter): http.Server {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_CLIENT_ID;
  const port = parseInt(process.env.PORT ?? '3000', 10);

  if (!publicKey) {
    logger.error('missing-public-key', {
      message: 'DISCORD_PUBLIC_KEY is required for HTTP mode.',
    });
    process.exit(1);
  }

  if (!token) {
    logger.error('missing-token', {
      message: 'DISCORD_BOT_TOKEN is required.',
    });
    process.exit(1);
  }

  if (!appId) {
    logger.error('missing-client-id', {
      message: 'DISCORD_CLIENT_ID is required.',
    });
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const handleInteraction = createInteractionHandler(rest, appId, publicKey, store, limiter);

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

        if (url.pathname === '/interactions') {
          await handleInteraction(req, res);
          return;
        }

        if (url.pathname === '/health' && req.method === 'GET') {
          jsonResponse(res, 200, { status: 'ok', mode: 'http' });
          return;
        }

        jsonResponse(res, 404, { error: 'Not found' });
      } catch (err) {
        logger.error('http-server-error', {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) {
          jsonResponse(res, 500, { error: 'Internal server error' });
        }
      }
    })();
  });

  server.listen(port, () => {
    logger.info('http-server-started', { port, endpoints: ['/interactions', '/health'] });
  });

  return server;
}
