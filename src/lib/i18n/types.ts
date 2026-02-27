/**
 * Internationalisation types for Antartica — Peril Bot.
 *
 * Tr defines every user-facing string the bot can emit.
 * Parameterised strings are typed as functions so call-sites are type-checked.
 */

export type Lang = 'it' | 'en';

export const SUPPORTED_LANGS: readonly Lang[] = ['it', 'en'] as const;
export const DEFAULT_LANG: Lang = 'it';

export interface Tr {
  // ---- Embed title suffixes (BOT_TITLE prefix is constant) ----
  titleThreatPool: string;
  titleSessionStarted: string;
  titleBag: string;
  titleLabelAdded: string;
  titleThreatPoolAdded: string;
  titleNegativeTagsAdded: string;
  titleDuplicateWarning: string;
  titleDraw: string;
  titleSessionEnd: string;
  titleSessionReset: string;
  titleError: string;
  titleHelp: string;

  // ---- Common embed field names ----
  fieldObjective: string;
  fieldGuide: string;
  fieldDuration: string;
  /** "Sacchetto" label in the session-started embed (inline field). */
  fieldBag: string;
  /** e.g. "Etichette nel sacchetto (3)" */
  fieldBagCount: (n: number) => string;
  fieldAllLabels: string;
  /** e.g. "Tutte le Estrazioni (5)" */
  fieldAllDraws: (n: number) => string;
  /** e.g. "Estrazioni Base (3)" */
  fieldBaseDraws: (n: number) => string;
  /** e.g. "Estrazioni Superarsi (1)" */
  fieldPushDraws: (n: number) => string;
  fieldPositives: string;
  fieldNegatives: string;
  fieldUncertain: string;
  fieldTotalPositives: string;
  fieldTotalNegatives: string;
  fieldSevereConsequences: string;
  /** "🎲 Risoluzione Tratto-Segnato" */
  fieldResolution: string;

  // ---- Embed descriptions / field values ----
  descPoolEmpty: string;
  descBagEmpty: string;
  descNoDraws: string;
  /** e.g. "**Tratto — Coraggio** aggiunta al sacchetto." */
  descLabelAdded: (labelText: string) => string;
  /** e.g. "3 etichette dal Pool Minacce aggiunte al sacchetto." */
  descThreatPoolAdded: (count: number) => string;
  descSessionReset: string;
  /** Bag count in the session-started embed, e.g. "0 etichette". */
  descBagInSession: (n: number) => string;
  /** e.g. "5 etichette totali" */
  descBagTotal: (n: number) => string;
  /** Suffix for a drawn label in the bag list, e.g. "(estratto)". */
  descDrawnSuffix: string;
  /** Uncertain label suffix shown during draw phase. */
  descUncertainSuffix: string;
  descSevereConsequencesPush: string;
  descSevereConsequencesEnd: string;

  // ---- Uncertain resolution ----
  resolutionPositive: string;
  resolutionNegative: string;

  // ---- Footers ----
  /** e.g. "Pool minacce (canale) · 2 etichette" */
  footerThreatPool: (countLabel: string) => string;
  footerSessionId: (id: string) => string;
  footerShowPushButtons: (guideName: string) => string;
  footerPushDone: string;
  footerNoPush: string;

  // ---- Pool count label (passed to footerThreatPool) ----
  poolCountLabel: (n: number) => string;

  // ---- Duration ----
  durationMins: (m: number) => string;
  durationHours: (h: number) => string;
  durationHoursMins: (h: number, m: number) => string;

  // ---- Button labels ----
  btnAddLabel: string;
  btnProceedDraw: string;
  btnPush1: string;
  btnPush2: string;
  btnEndPeril: string;

  // ---- Select menu ----
  selectLabelTypePrompt: string;
  /** Placeholder shown in the Explorer suggestion select menu. */
  selectExplorerSuggestPrompt: string;
  /** Label for the "enter custom text" option in the Explorer suggestion select menu. */
  selectExplorerCustomEntry: string;

  // ---- Modal ----
  modalTitle: string;
  modalFieldText: string;
  modalFieldNegSide: string;

  // ---- Error messages ----
  errNoGuild: string;
  errNoSession: string;
  errNoSessionStart: string;
  errActiveSession: string;
  errNotGuide: (guideName: string) => string;
  errNotGuidePush: (guideName: string) => string;
  errNotGuideProceedDraw: (guideName: string) => string;
  errNotGuideEnd: (guideName: string) => string;
  errRateLimitDraw: (retryAfter: number) => string;
  errRateLimit: (retryAfter: number) => string;
  errInvalidLabelType: (type: string) => string;
  errNegSideOnlyForTratt: string;
  errInvalidSubtype: (subtype: string, primary: string, validList: string) => string;
  errNegSideRequiredForTrattoSegnato: string;
  errTextRequired: string;
  errBagNotVisibleAfterDraw: string;
  errDrawsAlreadyDone: string;
  errDrawsAlreadyDoneReset: string;
  errBagEmptyDraw: string;
  errBagNoBagThreats: string;
  errBagEmptyPush: string;
  errThreatPoolAlreadyAdded: string;
  errConditionsAlreadyAdded: string;
  errResignationsAlreadyAdded: string;
  errNoThreatPool: string;
  errNoThreatPoolList: string;
  errAtLeastOneLabel: string;
  errAct1Exactly2: string;
  errAct1NoVisioni: string;
  errAct2Count: string;
  errAct2AtLeastOneVisione: string;
  errAct3Exactly3: string;
  errMalformedButton: string;
  errInvalidPushCount: string;
  errPushAlreadyDone: string;
  errPushNeedBaseFirst: string;
  errNoSessionChannel: string;
  errTextTooLong: string;
  errUnexpected: string;
  /** Shown when the user's confirm/cancel has been superseded by another add. */
  errConfirmationExpired: string;

  // ---- Duplicate-warning confirmation ----
  /** e.g. "The Pouch already contains a similar tag: **Ferito**. Proceed?" */
  warnSimilarLabel: (existingText: string) => string;
  /** Shown when a rassegnazione is already in the bag. */
  warnDuplicateRassegnazione: string;
  /** Button label for confirming the duplicate add. */
  btnConfirmAdd: string;
  /** Button label for cancelling the duplicate add. */
  btnCancelAdd: string;
  /** Shown after the user cancels the duplicate add. */
  addLabelCancelled: string;

  // ---- Suggestions ----
  suggestionAtLeast2: string;

  // ---- Explorer profile ----
  titleExplorer: string;
  /** e.g. "Etichette (3)" */
  fieldExplorerTags: (n: number) => string;
  explorerCleared: string;
  explorerNoProfile: string;
  explorerNoTags: string;
  explorerNoConditions: string;
  /** e.g. "2 Condizioni aggiunte al sacchetto dagli Esploratori." */
  explorerConditionsAdded: (count: number) => string;
  errNoResignations: string;
  /** e.g. "3 Rassegnazioni aggiunte al sacchetto dagli Esploratori." */
  explorerResignationsAdded: (count: number) => string;
  /**
   * Summary line for /peril add-negative-tags.
   * e.g. "2 Threats/Visions, 1 Condition, 0 Resignations added to the Pouch."
   */
  negativeTagsAdded: (threats: number, conditions: number, resignations: number) => string;

  // ---- Lang command ----
  langChanged: string;

  // ---- Help embed ----
  helpDescription: string;
  helpFooter: string;
  helpFields: readonly { readonly name: string; readonly value: string }[];

  // ---- Privacy embed ----
  privacyTitle: string;
  privacyDescription: string;
  privacyFields: readonly { readonly name: string; readonly value: string }[];
  privacyFooter: (url: string) => string;
  privacyContactFieldName: string;
  privacyContact: (email: string) => string;
}
