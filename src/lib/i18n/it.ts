/**
 * Italian translations (default language).
 */

import type { Tr } from './types.js';

export const itTranslations: Tr = {
  // ---- Embed title suffixes ----
  titleThreatPool: 'Pool Minacce',
  titleSessionStarted: 'Sessione Iniziata',
  titleBag: 'Sacchetto',
  titleLabelAdded: 'Etichetta Aggiunta',
  titleThreatPoolAdded: 'Pool Minacce Aggiunto',
  titleDraw: 'Estrazione',
  titleSessionEnd: 'Fine Sessione',
  titleSessionReset: 'Sessione Azzerata',
  titleError: 'Errore',
  titleHelp: 'Guida ai Comandi',

  // ---- Common field names ----
  fieldObjective: 'Obiettivo',
  fieldGuide: 'Guida',
  fieldDuration: 'Durata',
  fieldBag: 'Sacchetto',
  fieldBagCount: (n) => `Etichette nel sacchetto (${n})`,
  fieldAllLabels: 'Lista completa',
  fieldAllDraws: (n) => `Tutte le Estrazioni (${n})`,
  fieldBaseDraws: (n) => `Estrazioni Base (${n})`,
  fieldPushDraws: (n) => `Estrazioni Superarsi (${n})`,
  fieldPositives: '✨ Positivi',
  fieldNegatives: '💀 Negativi',
  fieldUncertain: '❓ Incerti',
  fieldTotalPositives: '✨ Totale Positivi',
  fieldTotalNegatives: '💀 Totale Negativi',
  fieldSevereConsequences: '⚠️ CONSEGUENZE NEFASTE',
  fieldResolution: '🎲 Risoluzione Tratto-Segnato',

  // ---- Embed descriptions / field values ----
  descPoolEmpty: '*Il pool è vuoto.*',
  descBagEmpty: '*Sacchetto vuoto.*',
  descNoDraws: '*Nessuna.*',
  descLabelAdded: (labelText) => `**${labelText}** aggiunta al sacchetto.`,
  descThreatPoolAdded: (count) => `${count} etichette dal Pool Minacce aggiunte al sacchetto.`,
  descSessionReset: "Sacchetto e estrazioni cancellati. L'obiettivo è mantenuto.",
  descBagInSession: (n) => `${n} etichette`,
  descBagTotal: (n) => `${n} etichette totali`,
  descDrawnSuffix: '*(estratto)*',
  descUncertainSuffix: '*(incerto — risolto a fine pericolo)*',
  descSevereConsequencesPush:
    'Una **Minaccia** o **Visione** è stata estratta durante il Superarsi — **Conseguenze Nefaste**!',
  descSevereConsequencesEnd:
    'Una **Minaccia** o **Visione** estratta durante Superarsi — applica le **Conseguenze Nefaste**.',

  // ---- Uncertain resolution ----
  resolutionPositive: 'Positivo',
  resolutionNegative: 'Negativo',

  // ---- Footers ----
  footerThreatPool: (countLabel) => `Pool minacce (canale) · ${countLabel}`,
  footerSessionId: (id) => `Session ID: ${id}`,
  footerShowPushButtons: (guideName) =>
    `Solo la Guida può usare i pulsanti Superarsi — ${guideName}`,
  footerPushDone: 'Fase di Superarsi completata.',
  footerNoPush: 'Usa i pulsanti per Superarsi, oppure usa Fine Pericolo.',

  // ---- Pool count label ----
  poolCountLabel: (n) => (n === 1 ? '1 etichetta' : `${n} etichette`),

  // ---- Duration ----
  durationMins: (m) => `${m}m`,
  durationHours: (h) => `${h}h`,
  durationHoursMins: (h, m) => `${h}h ${m}m`,

  // ---- Button labels ----
  btnAddLabel: 'Aggiungi etichetta',
  btnProceedDraw: "Procedi all'estrazione",
  btnPush1: '+1 Superarsi',
  btnPush2: '+2 Superarsi',
  btnEndPeril: 'Fine Pericolo',

  // ---- Select menu ----
  selectLabelTypePrompt: 'Scegli tipo etichetta…',
  selectExplorerSuggestPrompt: 'Scegli dal profilo Esploratore…',
  selectExplorerCustomEntry: '✏️ Inserisci testo manuale…',

  // ---- Modal ----
  modalTitle: 'Aggiungi Etichetta',
  modalFieldText: 'Testo etichetta',
  modalFieldNegSide: 'Lato negativo (Tratto-Segnato)',

  // ---- Error messages ----
  errNoGuild: "Questo comando può essere usato solo all'interno di un server.",
  errNoSession: 'Nessuna sessione attiva in questo canale. Usa `/peril start` per iniziare.',
  errNoSessionStart: 'Nessuna sessione attiva in questo canale.',
  errActiveSession:
    'Esiste già una sessione attiva in questo canale. Usa `/peril end` per terminarla prima.',
  errNotGuide: (guideName) => `Solo la Guida (${guideName}) può eseguire questa azione.`,
  errNotGuidePush: (guideName) => `Solo la Guida (${guideName}) può usare i pulsanti Superarsi.`,
  errNotGuideProceedDraw: (guideName) =>
    `Solo la Guida (${guideName}) può procedere all'estrazione.`,
  errNotGuideEnd: (guideName) => `Solo la Guida (${guideName}) può terminare la sessione.`,
  errRateLimitDraw: (retryAfter) =>
    `Stai andando troppo veloce! Aspetta **${retryAfter}** second(i) prima di estrarre di nuovo.`,
  errRateLimit: (retryAfter) => `Stai andando troppo veloce! Aspetta **${retryAfter}** second(i).`,
  errInvalidLabelType: (type) => `Tipo etichetta non valido: "${type}".`,
  errNegSideOnlyForTratt: 'Il lato negativo (lato_neg) è valido solo per etichette di tipo Tratto.',
  errInvalidSubtype: (subtype, primary, validList) =>
    `"${subtype}" non compatibile con "${primary}". Validi: ${validList}.`,
  errNegSideRequiredForTrattoSegnato:
    'Per Tratto-Segnato il lato negativo (lato_neg) è obbligatorio.',
  errTextRequired: 'Il campo testo è obbligatorio per questo tipo di etichetta.',
  errBagNotVisibleAfterDraw: 'Il sacchetto non è più visibile dopo la prima estrazione.',
  errDrawsAlreadyDone:
    'Le estrazioni base sono già state eseguite. Usa `/peril reset` per ricominciare o `/peril end` per terminare la sessione.',
  errDrawsAlreadyDoneReset:
    'Le estrazioni base sono già state eseguite. Usa `/peril reset` per ricominciare.',
  errBagEmptyDraw: 'Il sacchetto è vuoto! Aggiungi etichette con `/peril add` prima di estrarre.',
  errBagNoBagThreats:
    'Il sacchetto non contiene Minacce o Visioni. Usa `/peril add-threats` per aggiungerle prima di estrarre.',
  errBagEmptyPush: 'Il sacchetto è vuoto — nessuna etichetta da estrarre.',
  errThreatPoolAlreadyAdded: 'Il Pool Minacce è già stato aggiunto a questa sessione.',
  errNoThreatPool: 'Nessun Pool Minacce disponibile. Usa `/threats set` per impostarlo prima.',
  errNoThreatPoolList:
    'Nessun Pool Minacce impostato in questo canale. Usa `/threats set` per crearne uno.',
  errAtLeastOneLabel: 'Almeno una etichetta è richiesta.',
  errAct1Exactly2: 'Atto I richiede esattamente 2 etichette nel Pool Minacce.',
  errAct1NoVisioni: 'Atto I non ammette Visioni nel Pool Minacce.',
  errAct2Count: 'Atto II richiede esattamente 2 Minacce e 1 Visione nel Pool Minacce.',
  errAct2AtLeastOneVisione: 'Atto II richiede almeno 1 Visione nel Pool Minacce.',
  errAct3Exactly3: 'Atto III richiede esattamente 3 etichette nel Pool Minacce.',
  errMalformedButton: 'Parametro non valido nel pulsante Superarsi.',
  errInvalidPushCount: 'Conteggio non valido nel pulsante Superarsi.',
  errPushAlreadyDone: 'Il Superarsi è già stato eseguito per questa sessione.',
  errPushNeedBaseFirst: 'Esegui prima le estrazioni base con `/peril draw`.',
  errNoSessionChannel: 'Nessuna sessione attiva in questo canale.',
  errTextTooLong: 'Testo troppo lungo (massimo 200 caratteri per campo).',
  errUnexpected: 'Si è verificato un errore imprevisto. Riprova.',

  // ---- Suggestions ----
  suggestionAtLeast2:
    '\n\n*Suggerimento: si consiglia di inserire almeno 2 etichette nel Pool Minacce.*',

  // ---- Explorer profile ----
  titleExplorer: 'Esploratore',
  fieldExplorerTags: (n) => `Etichette (${n})`,
  explorerCleared: 'Profilo esploratore cancellato.',
  explorerNoProfile: 'Nessun profilo esploratore impostato. Usa `/explorer set` per crearne uno.',
  explorerNoTags: '*Nessuna etichetta nel profilo.*',
  explorerNoConditions:
    'Nessuna Condizione trovata nei profili degli Esploratori di questo canale.',
  explorerConditionsAdded: (count) =>
    `${count} Condizion${count === 1 ? 'e aggiunta' : 'i aggiunte'} al sacchetto dagli Esploratori.`,
  errNoResignations:
    'Nessuna Rassegnazione trovata nei profili degli Esploratori di questo canale.',
  explorerResignationsAdded: (count) =>
    `${count} Rassegnazion${count === 1 ? 'e aggiunta' : 'i aggiunte'} al sacchetto dagli Esploratori.`,

  // ---- Lang command ----
  langChanged: 'Lingua del bot impostata su **Italiano** per questo canale.',

  // ---- Help embed ----
  helpDescription:
    'Bot di supporto meccanico per la procedura **Affrontare il Pericolo** di *Antartica*.',
  helpFooter: 'Antartica by Stefano Vetrini · stefanovetrini.itch.io/antartica',
  helpFields: [
    {
      name: '/threats set <threat1> [threat2] [threat3] [type1] [type2] [type3] [act]',
      value:
        "Imposta il Pool Minacce del canale (2–3 etichette). Ogni etichetta può essere Minaccia o Visione. Specifica l'Atto per la validazione della composizione.",
    },
    {
      name: '/threats list',
      value: 'Mostra il Pool Minacce del canale corrente.',
    },
    {
      name: '/threats clear',
      value: 'Cancella il Pool Minacce del canale.',
    },
    {
      name: '/peril start <objective> [guide] [notes]',
      value: 'Inizia una nuova sessione di pericolo nel canale.',
    },
    {
      name: '/peril add <type> [subtype] [text] [owner] [neg_side]',
      value:
        "Aggiungi un'etichetta al sacchetto (Condizione, Tratto, Risorsa, Rassegnazione). Usa subtype per Terrore, Nome o Archetipo. Fornendo neg_side con type Tratto crei automaticamente un Tratto-Segnato.",
    },
    {
      name: '/peril add-threats',
      value:
        'Aggiungi tutte le etichette del Pool Minacce al sacchetto (nessuna selezione parziale).',
    },
    {
      name: '/peril add-resignations',
      value:
        'Aggiungi tutte le Rassegnazioni dai profili Esploratore di questo canale al sacchetto (Guida).',
    },
    {
      name: '/peril bag',
      value:
        'Mostra il contenuto del sacchetto (privato). Disponibile solo prima della prima estrazione.',
    },
    {
      name: '/peril draw',
      value: 'Estrai 3 etichette e mostra i pulsanti Superarsi.',
    },
    {
      name: '/peril end',
      value: 'Termina la sessione e mostra il riepilogo.',
    },
    {
      name: '/peril reset',
      value: "Azzera sacchetto e estrazioni (mantieni l'obiettivo).",
    },
    {
      name: '/language <language>',
      value: 'Imposta la lingua del bot per questo canale (it / en).',
    },
  ],

  // ---- Privacy embed ----
  privacyTitle: 'Antartica — Peril Bot · Privacy',
  privacyDescription:
    'Questo bot raccoglie il **minimo indispensabile** per funzionare. ' +
    'Nessun dato è venduto o condiviso con terze parti.',
  privacyFields: [
    {
      name: 'Dati raccolti',
      value:
        '• **Discord User ID** — identifica la Guida e i proprietari delle etichette\n' +
        '• **Discord Channel ID** — limita la sessione al canale di origine\n' +
        '• **Discord Guild ID** — limita il Pool Minacce alla gilda\n' +
        '• **Testo delle etichette e obiettivi** — archiviazione temporanea in sessione (max 6 ore)',
    },
    {
      name: 'Cosa NON facciamo',
      value:
        '• Non archiviamo dati in modo permanente\n' +
        '• Non registriamo il contenuto delle estrazioni nei log\n' +
        '• Non condividiamo dati con terze parti\n' +
        '• Non raccogliamo dati personali oltre agli ID Discord',
    },
    {
      name: 'Conservazione dati',
      value:
        'Le sessioni scadono automaticamente dopo **6 ore** (o al riavvio in modalità memoria). ' +
        'Il Pool Minacce persiste finché non viene cancellato manualmente.',
    },
  ],
  privacyFooter: (url) => `Privacy Policy completa: ${url}`,
  privacyContactFieldName: 'Contatto',
  privacyContact: (email) => `Per richieste GDPR: ${email}`,
};
