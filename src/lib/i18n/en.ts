/**
 * English translations.
 *
 * Game-system terms (Tratto, Condizione, Rassegnazione, Tratto-Segnato, etc.)
 * remain in Italian as proper nouns of the Antartica TTRPG system.
 */

import type { Tr } from './types.js';

export const enTranslations: Tr = {
  // ---- Embed title suffixes ----
  titleThreatPool: 'Threat Pool',
  titleSessionStarted: 'Session Started',
  titleBag: 'Pouch',
  titleLabelAdded: 'Tag Added',
  titleThreatPoolAdded: 'Threat Pool Added',
  titleDraw: 'Draw',
  titleSessionEnd: 'Session End',
  titleSessionReset: 'Session Reset',
  titleError: 'Error',
  titleHelp: 'Command Help',

  // ---- Common field names ----
  fieldObjective: 'Objective',
  fieldGuide: 'Lead',
  fieldDuration: 'Duration',
  fieldBag: 'Pouch',
  fieldBagCount: (n) => `Tags in Pouch (${n})`,
  fieldAllLabels: 'Full list',
  fieldAllDraws: (n) => `All Draws (${n})`,
  fieldBaseDraws: (n) => `Base Draws (${n})`,
  fieldPositives: '✨ Positives',
  fieldNegatives: '💀 Negatives',
  fieldUncertain: '❓ Uncertain',
  fieldTotalPositives: '✨ Total Positives',
  fieldTotalNegatives: '💀 Total Negatives',
  fieldSevereConsequences: '⚠️ DIRE CONSEQUENCES',
  fieldResolution: '🎲 Marked Trait Resolution',

  // ---- Embed descriptions / field values ----
  descPoolEmpty: '*The pool is empty.*',
  descBagEmpty: '*Pouch is empty.*',
  descNoDraws: '*None.*',
  descLabelAdded: (labelText) => `**${labelText}** added to the Pouch.`,
  descThreatPoolAdded: (count) => `${count} tag(s) from the Threat Pool added to the Pouch.`,
  descSessionReset: 'Pouch and draws cleared. The objective is kept.',
  descBagInSession: (n) => `${n} tag${n === 1 ? '' : 's'}`,
  descBagTotal: (n) => `${n} tag${n === 1 ? '' : 's'} total`,
  descDrawnSuffix: '*(drawn)*',
  descUncertainSuffix: '*(uncertain — resolved at session end)*',
  descSevereConsequencesPush:
    'A **Threat** or **Vision** was drawn during Push — Dire Consequences!',
  descSevereConsequencesEnd:
    'A **Threat** or **Vision** was drawn during Push — apply Dire Consequences.',

  // ---- Uncertain resolution ----
  resolutionPositive: 'Positive',
  resolutionNegative: 'Negative',

  // ---- Footers ----
  footerThreatPool: (countLabel) => `Threat pool (channel) · ${countLabel}`,
  footerSessionId: (id) => `Session ID: ${id}`,
  footerShowPushButtons: (guideName) => `Only the Lead can use Push buttons — ${guideName}`,
  footerPushDone: 'Push phase complete.',
  footerNoPush: 'Use the buttons to Push, or use End Peril.',

  // ---- Pool count label ----
  poolCountLabel: (n) => `${n} tag${n === 1 ? '' : 's'}`,

  // ---- Duration ----
  durationMins: (m) => `${m}m`,
  durationHours: (h) => `${h}h`,
  durationHoursMins: (h, m) => `${h}h ${m}m`,

  // ---- Button labels ----
  btnAddLabel: 'Add Tag',
  btnProceedDraw: 'Proceed to draw',
  btnPush1: '+1 Push',
  btnPush2: '+2 Push',
  btnEndPeril: 'End Peril',

  // ---- Select menu ----
  selectLabelTypePrompt: 'Select tag type…',
  selectExplorerSuggestPrompt: 'Choose from Explorer profile…',
  selectExplorerCustomEntry: '✏️ Enter custom text…',

  // ---- Modal ----
  modalTitle: 'Add Tag',
  modalFieldText: 'Tag text',
  modalFieldNegSide: 'Negative side (Marked Trait)',

  // ---- Error messages ----
  errNoGuild: 'This command can only be used inside a server.',
  errNoSession: 'No active session in this channel. Use `/peril start` to begin.',
  errNoSessionStart: 'No active session in this channel.',
  errActiveSession:
    'There is already an active session in this channel. Use `/peril end` to end it first.',
  errNotGuide: (guideName) => `Only the Lead (${guideName}) can perform this action.`,
  errNotGuidePush: (guideName) => `Only the Lead (${guideName}) can use the Push buttons.`,
  errNotGuideProceedDraw: (guideName) => `Only the Lead (${guideName}) can proceed to the draw.`,
  errNotGuideEnd: (guideName) => `Only the Lead (${guideName}) can end the session.`,
  errRateLimitDraw: (retryAfter) =>
    `You are going too fast! Wait **${retryAfter}** second(s) before drawing again.`,
  errRateLimit: (retryAfter) => `You are going too fast! Wait **${retryAfter}** second(s).`,
  errInvalidLabelType: (type) => `Invalid tag type: "${type}".`,
  errNegSideOnlyForTratt: 'The negative side (neg_side) is only valid for Trait tags.',
  errInvalidSubtype: (subtype, primary, validList) =>
    `Subtype "${subtype}" is not compatible with "${primary}". Valid: ${validList}.`,
  errNegSideRequiredForTrattoSegnato: 'For Marked Trait the negative side (neg_side) is required.',
  errTextRequired: 'The text field is required for this tag type.',
  errBagNotVisibleAfterDraw: 'The Pouch is no longer visible after the first draw.',
  errDrawsAlreadyDone:
    'Base draws have already been done. Use `/peril reset` to start over or `/peril end` to end the session.',
  errDrawsAlreadyDoneReset: 'Base draws have already been done. Use `/peril reset` to start over.',
  errBagEmptyDraw: 'The Pouch is empty! Add tags with `/peril add` before drawing.',
  errBagNoBagThreats:
    'The Pouch has no Threats or Visions. Use `/peril add-threats` to add them before drawing.',
  errBagEmptyPush: 'The Pouch is empty — no tags to draw.',
  errThreatPoolAlreadyAdded: 'The Threat Pool has already been added to this session.',
  errNoThreatPool: 'No Threat Pool available. Use `/threats set` to set one first.',
  errNoThreatPoolList: 'No Threat Pool set for this channel. Use `/threats set` to create one.',
  errAtLeastOneLabel: 'At least one tag is required.',
  errAct1Exactly2: 'Act I requires exactly 2 tags in the Threat Pool.',
  errAct1NoVisioni: 'Act I does not allow Visions in the Threat Pool.',
  errAct2Count: 'Act II requires exactly 2 Threats and 1 Vision in the Threat Pool.',
  errAct2AtLeastOneVisione: 'Act II requires at least 1 Vision in the Threat Pool.',
  errAct3Exactly3: 'Act III requires exactly 3 tags in the Threat Pool.',
  errMalformedButton: 'Invalid parameter in Push button.',
  errInvalidPushCount: 'Invalid count in Push button.',
  errPushAlreadyDone: 'Push has already been performed for this session.',
  errPushNeedBaseFirst: 'Perform base draws with `/peril draw` first.',
  errNoSessionChannel: 'No active session in this channel.',
  errTextTooLong: 'Text too long (maximum 200 characters per field).',
  errUnexpected: 'An unexpected error occurred. Please try again.',

  // ---- Suggestions ----
  suggestionAtLeast2:
    '\n\n*Suggestion: it is recommended to add at least 2 tags to the Threat Pool.*',

  // ---- Explorer profile ----
  titleExplorer: 'Explorer',
  fieldExplorerTags: (n) => `Tags (${n})`,
  explorerCleared: 'Explorer profile cleared.',
  explorerNoProfile: 'No Explorer profile set. Use `/explorer set` to create one.',
  explorerNoTags: '*No tags in the profile.*',
  explorerNoConditions: 'No Conditions found in Explorer profiles for this channel.',
  explorerConditionsAdded: (count) =>
    `${count} Condition${count === 1 ? '' : 's'} added to the Pouch from Explorer profiles.`,

  // ---- Lang command ----
  langChanged: 'Bot language set to **English** for this channel.',

  // ---- Help embed ----
  helpDescription: 'Mechanical support bot for the **Brave the Peril** procedure of *Antartica*.',
  helpFooter: 'Antartica by Stefano Vetrini · stefanovetrini.itch.io/antartica',
  helpFields: [
    {
      name: '/threats set <threat1> [threat2] [threat3] [type1] [type2] [type3] [act]',
      value:
        'Set the channel Threat Pool (2–3 tags). Each tag can be a Threat or Vision. Specify the Act to enable composition validation.',
    },
    {
      name: '/threats list',
      value: 'Show the current channel Threat Pool.',
    },
    {
      name: '/threats clear',
      value: 'Clear the channel Threat Pool.',
    },
    {
      name: '/peril start <objective> [lead] [notes]',
      value: 'Start a new Brave the Peril session in the channel.',
    },
    {
      name: '/peril add <type> [subtype] [text] [owner] [neg_side]',
      value:
        'Add a tag to the Pouch (Condition, Trait, Supply, Resignation). Use subtype for Dread, Name Trait, or Archetype Trait. Providing neg_side with type Trait automatically creates a Marked Trait.',
    },
    {
      name: '/peril add-threats',
      value: 'Add all Threat Pool tags to the Pouch (no partial selection).',
    },
    {
      name: '/peril bag',
      value: 'Show the Pouch contents (private). Only available before the first draw.',
    },
    {
      name: '/peril draw',
      value: 'Draw 3 tags and show the Push buttons.',
    },
    {
      name: '/peril end',
      value: 'End the session and show the summary.',
    },
    {
      name: '/peril reset',
      value: 'Reset Pouch and draws (keep the objective).',
    },
    {
      name: '/language <language>',
      value: 'Set the bot language for this channel (it / en).',
    },
  ],

  // ---- Privacy embed ----
  privacyTitle: 'Antartica — Peril Bot · Privacy',
  privacyDescription:
    'This bot collects the **bare minimum** to function. ' +
    'No data is sold or shared with third parties.',
  privacyFields: [
    {
      name: 'Data collected',
      value:
        '• **Discord User ID** — identifies the Lead and tag owners\n' +
        '• **Discord Channel ID** — scopes the session to the originating channel\n' +
        '• **Discord Guild ID** — scopes the Threat Pool to the guild\n' +
        '• **Tag text and objectives** — temporarily stored in session (max 6 hours)',
    },
    {
      name: 'What we do NOT do',
      value:
        '• We do not store data permanently\n' +
        '• We do not log draw contents\n' +
        '• We do not share data with third parties\n' +
        '• We do not collect personal data beyond Discord IDs',
    },
    {
      name: 'Data retention',
      value:
        'Sessions expire automatically after **6 hours** (or on restart in memory mode). ' +
        'The Threat Pool persists until manually cleared.',
    },
  ],
  privacyFooter: (url) => `Full Privacy Policy: ${url}`,
  privacyContactFieldName: 'Contact',
  privacyContact: (email) => `For GDPR requests: ${email}`,
};
