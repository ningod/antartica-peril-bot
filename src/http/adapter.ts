/**
 * HTTP interaction adapters for Antartica Peril Bot.
 *
 * Wraps raw Discord JSON payloads + a REST client to provide the same
 * API surface our command/button handlers expect from discord.js.
 * Type assertions (as unknown as ...) are used at call sites.
 */

import { Routes } from 'discord.js';
import type { REST } from 'discord.js';
import type { APIApplicationCommandInteractionDataOption } from 'discord-api-types/v10';
import { ApplicationCommandOptionType } from 'discord-api-types/v10';

// ---------------------------------------------------------------------------
// Payload serialization
// ---------------------------------------------------------------------------

interface BuilderLike {
  toJSON(): unknown;
}

function isBuilder(obj: unknown): obj is BuilderLike {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'toJSON' in obj &&
    typeof (obj as BuilderLike).toJSON === 'function'
  );
}

export function serializePayload(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (data.embeds && Array.isArray(data.embeds)) {
    result.embeds = data.embeds.map((e: unknown) => (isBuilder(e) ? e.toJSON() : e));
  }

  if (data.components && Array.isArray(data.components)) {
    result.components = data.components.map((c: unknown) => (isBuilder(c) ? c.toJSON() : c));
  }

  if (data.content !== undefined) result.content = data.content;
  if (data.flags !== undefined) result.flags = data.flags;
  // allowedMentions
  if (data.allowedMentions !== undefined) result.allowed_mentions = data.allowedMentions;

  return result;
}

// ---------------------------------------------------------------------------
// HttpMessage
// ---------------------------------------------------------------------------

export class HttpMessage {
  readonly id: string;

  constructor(
    private readonly rest: REST,
    private readonly channelId: string,
    id: string
  ) {
    this.id = id;
  }

  async edit(data: Record<string, unknown>): Promise<HttpMessage> {
    await this.rest.patch(Routes.channelMessage(this.channelId, this.id), {
      body: serializePayload(data),
    });
    return this;
  }
}

// ---------------------------------------------------------------------------
// HttpCommandOptions
// ---------------------------------------------------------------------------

interface ResolvedUser {
  id: string;
  username: string;
  discriminator?: string;
}

export class HttpCommandOptions {
  private readonly optionMap = new Map<string, unknown>();
  private subcommandName: string | null = null;
  private readonly resolvedUsers: Map<string, ResolvedUser>;

  constructor(
    rawOptions?: APIApplicationCommandInteractionDataOption[],
    resolvedUsers?: Record<string, ResolvedUser>
  ) {
    this.resolvedUsers = new Map(Object.entries(resolvedUsers ?? {}));
    if (!rawOptions) return;

    for (const opt of rawOptions) {
      if (opt.type === ApplicationCommandOptionType.Subcommand) {
        this.subcommandName = opt.name;
        if ('options' in opt && opt.options) {
          for (const sub of opt.options) {
            this.optionMap.set(sub.name, 'value' in sub ? sub.value : null);
          }
        }
      } else if ('value' in opt) {
        this.optionMap.set(opt.name, opt.value);
      }
    }
  }

  getSubcommand(): string {
    if (!this.subcommandName) throw new Error('No subcommand found');
    return this.subcommandName;
  }

  getString(name: string, _required?: boolean): string | null {
    const val = this.optionMap.get(name);
    return typeof val === 'string' ? val : null;
  }

  getBoolean(name: string): boolean | null {
    const val = this.optionMap.get(name);
    return typeof val === 'boolean' ? val : null;
  }

  getInteger(name: string, _required?: boolean): number | null {
    const val = this.optionMap.get(name);
    return typeof val === 'number' ? val : null;
  }

  /** Returns a minimal user-like object { id, tag, displayName } for User options. */
  getUser(name: string): { id: string; tag: string; displayName: string } | null {
    const val = this.optionMap.get(name);
    if (typeof val !== 'string') return null;
    const resolved = this.resolvedUsers.get(val);
    if (!resolved) return { id: val, tag: val, displayName: val };
    const tag =
      resolved.discriminator && resolved.discriminator !== '0'
        ? `${resolved.username}#${resolved.discriminator}`
        : resolved.username;
    return { id: resolved.id, tag, displayName: resolved.username };
  }
}

// ---------------------------------------------------------------------------
// User formatting helper
// ---------------------------------------------------------------------------

function formatUserTag(user: { username: string; discriminator?: string }): string {
  if (user.discriminator && user.discriminator !== '0') {
    return `${user.username}#${user.discriminator}`;
  }
  return user.username;
}

// ---------------------------------------------------------------------------
// createCommandInteraction
// ---------------------------------------------------------------------------

interface RawResolvedData {
  users?: Record<string, { id: string; username: string; discriminator?: string }>;
}

interface RawCommandInteractionData {
  data: {
    name: string;
    options?: APIApplicationCommandInteractionDataOption[];
    resolved?: RawResolvedData;
  };
  member?: { user: { id: string; username: string; discriminator?: string } };
  user?: { id: string; username: string; discriminator?: string };
  channel_id: string;
  guild_id?: string;
}

export function createCommandInteraction(
  rest: REST,
  appId: string,
  token: string,
  data: RawCommandInteractionData
): Record<string, unknown> {
  const rawUser = data.member?.user ?? data.user;
  const user = {
    id: rawUser?.id ?? '',
    tag: rawUser ? formatUserTag(rawUser) : '',
    displayName: rawUser?.username ?? '',
  };

  const channelId = data.channel_id;
  const options = new HttpCommandOptions(data.data.options, data.data.resolved?.users);

  return {
    user,
    channelId,
    guildId: data.guild_id ?? null,
    commandName: data.data.name,
    options,

    async editReply(replyData: Record<string, unknown>): Promise<void> {
      await rest.patch(Routes.webhookMessage(appId, token, '@original'), {
        body: serializePayload(replyData),
      });
    },

    async reply(replyData: Record<string, unknown>): Promise<void> {
      await rest.patch(Routes.webhookMessage(appId, token, '@original'), {
        body: serializePayload(replyData),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// createButtonInteraction
// ---------------------------------------------------------------------------

interface RawButtonMessage {
  id: string;
  channel_id?: string;
}

interface RawButtonInteractionData {
  data: { custom_id: string };
  member?: { user: { id: string; username: string; discriminator?: string } };
  user?: { id: string; username: string; discriminator?: string };
  channel_id: string;
  guild_id?: string;
  message?: RawButtonMessage;
}

export function createButtonInteraction(
  rest: REST,
  appId: string,
  token: string,
  data: RawButtonInteractionData
): Record<string, unknown> {
  const rawUser = data.member?.user ?? data.user;
  const user = {
    id: rawUser?.id ?? '',
    tag: rawUser ? formatUserTag(rawUser) : '',
    displayName: rawUser?.username ?? '',
  };

  const channelId = data.channel_id;
  const messageId = data.message?.id;
  const message = messageId ? new HttpMessage(rest, channelId, messageId) : null;

  return {
    user,
    channelId,
    guildId: data.guild_id ?? null,
    customId: data.data.custom_id,
    message,

    async editReply(replyData: Record<string, unknown>): Promise<void> {
      await rest.patch(Routes.webhookMessage(appId, token, '@original'), {
        body: serializePayload(replyData),
      });
    },

    async followUp(replyData: Record<string, unknown>): Promise<void> {
      await rest.post(Routes.webhook(appId, token), {
        body: serializePayload(replyData),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// createStringSelectMenuInteraction
// ---------------------------------------------------------------------------

interface RawStringSelectInteractionData {
  data: { custom_id: string; values: string[] };
  member?: { user: { id: string; username: string; discriminator?: string } };
  user?: { id: string; username: string; discriminator?: string };
  channel_id: string;
  guild_id?: string;
}

export function createStringSelectMenuInteraction(
  rest: REST,
  appId: string,
  token: string,
  data: RawStringSelectInteractionData
): Record<string, unknown> {
  const rawUser = data.member?.user ?? data.user;
  const user = {
    id: rawUser?.id ?? '',
    tag: rawUser ? formatUserTag(rawUser) : '',
    displayName: rawUser?.username ?? '',
  };

  const channelId = data.channel_id;

  return {
    user,
    channelId,
    guildId: data.guild_id ?? null,
    customId: data.data.custom_id,
    values: data.data.values,

    async editReply(replyData: Record<string, unknown>): Promise<void> {
      await rest.patch(Routes.webhookMessage(appId, token, '@original'), {
        body: serializePayload(replyData),
      });
    },

    async followUp(replyData: Record<string, unknown>): Promise<void> {
      await rest.post(Routes.webhook(appId, token), {
        body: serializePayload(replyData),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// createModalSubmitInteraction
// ---------------------------------------------------------------------------

interface RawModalComponent {
  type: number;
  components?: RawModalComponent[];
  custom_id?: string;
  value?: string;
}

interface RawModalSubmitInteractionData {
  data: { custom_id: string; components: RawModalComponent[] };
  member?: { user: { id: string; username: string; discriminator?: string } };
  user?: { id: string; username: string; discriminator?: string };
  channel_id: string;
  guild_id?: string;
}

export function createModalSubmitInteraction(
  rest: REST,
  appId: string,
  token: string,
  data: RawModalSubmitInteractionData
): Record<string, unknown> {
  const rawUser = data.member?.user ?? data.user;
  const user = {
    id: rawUser?.id ?? '',
    tag: rawUser ? formatUserTag(rawUser) : '',
    displayName: rawUser?.username ?? '',
  };

  const channelId = data.channel_id;

  // Flatten action-row → text-input components into a map
  const fieldMap = new Map<string, string>();
  for (const row of data.data.components) {
    for (const component of row.components ?? []) {
      if (component.custom_id !== undefined) {
        fieldMap.set(component.custom_id, component.value ?? '');
      }
    }
  }

  const fields = {
    getTextInputValue(id: string): string {
      return fieldMap.get(id) ?? '';
    },
  };

  return {
    user,
    channelId,
    guildId: data.guild_id ?? null,
    customId: data.data.custom_id,
    fields,

    async editReply(replyData: Record<string, unknown>): Promise<void> {
      await rest.patch(Routes.webhookMessage(appId, token, '@original'), {
        body: serializePayload(replyData),
      });
    },

    async followUp(replyData: Record<string, unknown>): Promise<void> {
      await rest.post(Routes.webhook(appId, token), {
        body: serializePayload(replyData),
      });
    },
  };
}
