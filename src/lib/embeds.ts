/**
 * Discord embed builders for Antartica Peril Bot.
 *
 * All embeds accept a Tr (translation bundle) as the last argument so that
 * every user-facing string can be rendered in the channel's configured language.
 * Colours follow the polarity system: green = positive, red = negative, etc.
 */

import { EmbedBuilder, Colors } from 'discord.js';
import type {
  DrawnLabel,
  PericoloSession,
  ThreatPool,
  ExplorerProfile,
} from './store-interface.js';
import {
  LABEL_TYPE_DISPLAY,
  summarizeDraws,
  hasThreatOrVision,
  type UncertainFlip,
} from './domain.js';
import type { Tr } from './i18n/index.js';

const BOT_TITLE = 'Antartica — Peril Bot';

// ---------------------------------------------------------------------------
// Polarity emoji helpers
// ---------------------------------------------------------------------------

function polarityEmoji(polarity: 'positive' | 'negative' | 'uncertain'): string {
  if (polarity === 'positive') return '✨';
  if (polarity === 'uncertain') return '❓';
  return '💀';
}

function labelLine(d: DrawnLabel, tr: Tr): string {
  const typeTag = LABEL_TYPE_DISPLAY[d.label.type];
  const owner = d.label.ownerId ? ` <@${d.label.ownerId}>` : '';
  const textPart = d.displayText ? ` — ${d.displayText}` : '';
  const uncertainSuffix = d.polarity === 'uncertain' ? ` ${tr.descUncertainSuffix}` : '';
  return `${polarityEmoji(d.polarity)} **${typeTag}**${textPart}${owner}${uncertainSuffix}`;
}

// ---------------------------------------------------------------------------
// Threat pool embeds
// ---------------------------------------------------------------------------

export function buildThreatPoolEmbed(pool: ThreatPool, tr: Tr): EmbedBuilder {
  const lines = pool.labels.map((l) => {
    const textPart = l.text ? ` — ${l.text}` : '';
    return `• **${LABEL_TYPE_DISPLAY[l.type]}**${textPart}`;
  });

  const countLabel = tr.poolCountLabel(pool.labels.length);

  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleThreatPool}`)
    .setColor(Colors.DarkRed)
    .setDescription(lines.length > 0 ? lines.join('\n') : tr.descPoolEmpty)
    .setFooter({ text: tr.footerThreatPool(countLabel) })
    .setTimestamp();
}

export function buildThreatPoolClearedEmbed(tr: Tr): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleThreatPool}`)
    .setColor(Colors.Grey)
    .setDescription('Pool Minacce cancellato.')
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Session status / bag
// ---------------------------------------------------------------------------

export function buildSessionStartedEmbed(session: PericoloSession, tr: Tr): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleSessionStarted}`)
    .setColor(Colors.DarkGreen)
    .addFields(
      { name: tr.fieldObjective, value: session.objective },
      { name: tr.fieldGuide, value: `<@${session.guideId}>`, inline: true },
      { name: tr.fieldBag, value: tr.descBagInSession(session.bag.length), inline: true }
    )
    .setDescription(session.notes ?? null)
    .setFooter({ text: tr.footerSessionId(session.sessionId.slice(0, 8)) })
    .setTimestamp();
}

export function buildBagEmbed(session: PericoloSession, tr: Tr): EmbedBuilder {
  const typeCount: Partial<Record<string, number>> = {};
  for (const label of session.bag) {
    const key = LABEL_TYPE_DISPLAY[label.type];
    typeCount[key] = (typeCount[key] ?? 0) + 1;
  }

  const countLines = Object.entries(typeCount)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `• **${type}**: ${count}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleBag}`)
    .setColor(Colors.Blue)
    .addFields(
      { name: tr.fieldObjective, value: session.objective },
      {
        name: tr.fieldBagCount(session.bag.length),
        value: countLines || tr.descBagEmpty,
      }
    )
    .setTimestamp();

  if (session.allLabels.length > 0) {
    const listLines = session.allLabels.map((l) => {
      const inBag = session.bag.some((b) => b.id === l.id);
      const drawn = !inBag;
      const prefix = drawn ? '~~' : '';
      const suffix = drawn ? `~~ ${tr.descDrawnSuffix}` : '';
      const owner = l.ownerId ? ` <@${l.ownerId}>` : '';
      const textPart = l.text ? ` — ${l.text}` : '';
      return `${prefix}**${LABEL_TYPE_DISPLAY[l.type]}**${textPart}${owner}${suffix}`;
    });
    embed.addFields({
      name: tr.fieldAllLabels,
      value: listLines.join('\n').slice(0, 1024),
    });
  }

  return embed;
}

export function buildLabelAddedEmbed(
  session: PericoloSession,
  labelText: string,
  tr: Tr
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleLabelAdded}`)
    .setColor(Colors.Green)
    .setDescription(tr.descLabelAdded(labelText))
    .addFields({
      name: tr.fieldBag,
      value: tr.descBagTotal(session.bag.length),
      inline: true,
    })
    .setTimestamp();
}

export function buildThreatPoolAddedEmbed(
  count: number,
  session: PericoloSession,
  tr: Tr
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleThreatPoolAdded}`)
    .setColor(Colors.DarkRed)
    .setDescription(tr.descThreatPoolAdded(count))
    .addFields({
      name: tr.fieldBag,
      value: tr.descBagTotal(session.bag.length),
      inline: true,
    })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Draw embed (base extractions + optional push draws)
// ---------------------------------------------------------------------------

export interface DrawEmbedOptions {
  session: PericoloSession;
  baseDraws: DrawnLabel[];
  pushDraws?: DrawnLabel[];
  showPushButtons?: boolean;
}

export function buildDrawEmbed(opts: DrawEmbedOptions, tr: Tr): EmbedBuilder {
  const { session, baseDraws, pushDraws = [], showPushButtons = false } = opts;
  const allDraws = [...baseDraws, ...pushDraws];
  const { positiveCount, negativeCount, uncertainCount } = summarizeDraws(allDraws);
  const severeConsequences = hasThreatOrVision(pushDraws);

  const embed = new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleDraw}`)
    .setColor(severeConsequences ? Colors.DarkRed : Colors.Blue)
    .addFields({ name: tr.fieldObjective, value: session.objective });

  embed.addFields({
    name: tr.fieldBaseDraws(baseDraws.length),
    value: baseDraws.map((d) => labelLine(d, tr)).join('\n') || tr.descNoDraws,
  });

  if (pushDraws.length > 0) {
    embed.addFields({
      name: tr.fieldPushDraws(pushDraws.length),
      value: pushDraws.map((d) => labelLine(d, tr)).join('\n') || tr.descNoDraws,
    });
  }

  embed.addFields(
    { name: tr.fieldPositives, value: String(positiveCount), inline: true },
    { name: tr.fieldNegatives, value: String(negativeCount), inline: true }
  );
  if (uncertainCount > 0) {
    embed.addFields({ name: tr.fieldUncertain, value: String(uncertainCount), inline: true });
  }

  if (severeConsequences) {
    embed.addFields({
      name: tr.fieldSevereConsequences,
      value: tr.descSevereConsequencesPush,
    });
  }

  if (showPushButtons) {
    embed.setFooter({ text: tr.footerShowPushButtons(session.guideName) });
  } else if (pushDraws.length > 0) {
    embed.setFooter({ text: tr.footerPushDone });
  } else {
    embed.setFooter({ text: tr.footerNoPush });
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Session end summary
// ---------------------------------------------------------------------------

export function buildSessionEndEmbed(
  session: PericoloSession,
  resolvedBase: DrawnLabel[],
  resolvedPush: DrawnLabel[],
  flips: UncertainFlip[],
  tr: Tr
): EmbedBuilder {
  const allDraws = [...resolvedBase, ...resolvedPush];
  const { positiveCount, negativeCount } = summarizeDraws(allDraws);
  const severeConsequences = resolvedPush.length > 0 && hasThreatOrVision(resolvedPush);

  const embed = new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleSessionEnd}`)
    .setColor(severeConsequences ? Colors.DarkRed : Colors.DarkGreen)
    .addFields(
      { name: tr.fieldObjective, value: session.objective },
      { name: tr.fieldGuide, value: `<@${session.guideId}>`, inline: true },
      {
        name: tr.fieldDuration,
        value: formatDuration(session.createdAt, new Date(), tr),
        inline: true,
      }
    );

  if (resolvedBase.length > 0) {
    embed.addFields({
      name: tr.fieldBaseDraws(resolvedBase.length),
      value: resolvedBase.map((d) => labelLine(d, tr)).join('\n'),
    });
  }

  if (resolvedPush.length > 0) {
    embed.addFields({
      name: tr.fieldPushDraws(resolvedPush.length),
      value: resolvedPush.map((d) => labelLine(d, tr)).join('\n'),
    });
  }

  if (flips.length > 0) {
    const flipLines = flips.map((f) => {
      const emoji = polarityEmoji(f.polarity);
      const typeTag = LABEL_TYPE_DISPLAY[f.label.type];
      const textPart = f.displayText ? ` — ${f.displayText}` : '';
      const result = f.polarity === 'positive' ? tr.resolutionPositive : tr.resolutionNegative;
      return `${emoji} **${typeTag}**${textPart} → ${result}`;
    });
    embed.addFields({
      name: tr.fieldResolution,
      value: flipLines.join('\n'),
    });
  }

  embed.addFields(
    { name: tr.fieldTotalPositives, value: String(positiveCount), inline: true },
    { name: tr.fieldTotalNegatives, value: String(negativeCount), inline: true }
  );

  if (severeConsequences) {
    embed.addFields({
      name: tr.fieldSevereConsequences,
      value: tr.descSevereConsequencesEnd,
    });
  }

  embed.setFooter({ text: tr.footerSessionId(session.sessionId.slice(0, 8)) }).setTimestamp();
  return embed;
}

export function buildSessionResetEmbed(session: PericoloSession, tr: Tr): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleSessionReset}`)
    .setColor(Colors.Orange)
    .setDescription(tr.descSessionReset)
    .addFields({ name: tr.fieldObjective, value: session.objective })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Error embed
// ---------------------------------------------------------------------------

export function buildErrorEmbed(message: string, tr: Tr): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleError}`)
    .setColor(Colors.Red)
    .setDescription(message)
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Help embed
// ---------------------------------------------------------------------------

export function buildHelpEmbed(tr: Tr): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleHelp}`)
    .setColor(Colors.Blurple)
    .setDescription(tr.helpDescription)
    .setFooter({ text: tr.helpFooter })
    .setTimestamp();

  for (const field of tr.helpFields) {
    embed.addFields({ name: field.name, value: field.value });
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Privacy embed
// ---------------------------------------------------------------------------

export function buildPrivacyEmbed(
  tr: Tr,
  cfg: { privacyUrl: string | null; developerContactEmail: string | null }
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(tr.privacyTitle)
    .setColor(Colors.Blurple)
    .setDescription(tr.privacyDescription)
    .setTimestamp();

  if (cfg.privacyUrl) {
    embed.setFooter({ text: tr.privacyFooter(cfg.privacyUrl) });
  }

  for (const field of tr.privacyFields) {
    embed.addFields({ name: field.name, value: field.value });
  }

  if (cfg.developerContactEmail) {
    embed.addFields({
      name: tr.privacyContactFieldName,
      value: tr.privacyContact(cfg.developerContactEmail),
    });
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Explorer embeds
// ---------------------------------------------------------------------------

/**
 * Show an Explorer profile (used for set/add/remove/list responses).
 * `displayName` is the Discord display name of the profile owner.
 */
export function buildExplorerProfileEmbed(
  profile: ExplorerProfile,
  displayName: string,
  tr: Tr
): EmbedBuilder {
  const lines = profile.tags.map((tag, i) => {
    const typeTag = LABEL_TYPE_DISPLAY[tag.type];
    const textPart = tag.text ? ` — ${tag.text}` : '';
    const negPart = tag.negSide ? ` / ${tag.negSide}` : '';
    return `${i + 1}. **${typeTag}**${textPart}${negPart}`;
  });

  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleExplorer}`)
    .setColor(Colors.DarkAqua)
    .setDescription(`<@${profile.userId}> — ${displayName}`)
    .addFields({
      name: tr.fieldExplorerTags(profile.tags.length),
      value: lines.length > 0 ? lines.join('\n').slice(0, 1024) : tr.explorerNoTags,
    })
    .setTimestamp();
}

/** Confirmation embed for /explorer clear. */
export function buildExplorerClearedEmbed(tr: Tr): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleExplorer}`)
    .setColor(Colors.Grey)
    .setDescription(tr.explorerCleared)
    .setTimestamp();
}

/** Confirmation embed for /peril add-conditions. */
export function buildExplorerConditionsAddedEmbed(
  count: number,
  session: PericoloSession,
  tr: Tr
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${BOT_TITLE} — ${tr.titleLabelAdded}`)
    .setColor(Colors.Green)
    .setDescription(tr.explorerConditionsAdded(count))
    .addFields({
      name: tr.fieldBag,
      value: tr.descBagTotal(session.bag.length),
      inline: true,
    })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(start: Date, end: Date, tr: Tr): string {
  const ms = end.getTime() - start.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return tr.durationMins(minutes);
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? tr.durationHoursMins(hours, rem) : tr.durationHours(hours);
}
