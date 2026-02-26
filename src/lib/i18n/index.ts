/**
 * i18n entry-point for Antartica — Peril Bot.
 *
 * Usage:
 *   import { tr, SUPPORTED_LANGS, DEFAULT_LANG } from '../lib/i18n/index.js';
 *
 *   const t = tr(lang);
 *   await interaction.editReply({ embeds: [buildErrorEmbed(t.errNoSession, t)] });
 */

export type { Lang, Tr } from './types.js';
export { SUPPORTED_LANGS, DEFAULT_LANG } from './types.js';

import type { Lang, Tr } from './types.js';
import { itTranslations } from './it.js';
import { enTranslations } from './en.js';

const translations: Record<Lang, Tr> = {
  it: itTranslations,
  en: enTranslations,
};

/** Return the full translation bundle for the given language. Falls back to Italian. */
export function tr(lang: Lang): Tr {
  return translations[lang];
}
