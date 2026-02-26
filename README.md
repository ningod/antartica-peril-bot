# Antartica — Peril Bot

🇬🇧 [English](#english) · 🇮🇹 [Italiano](#italiano)

[![CI](https://github.com/ningod/antartica-peril-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/ningod/antartica-peril-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

<a name="english"></a>

## 🇬🇧 English

> Discord bot for **[Antartica](https://stefanovetrini.itch.io/antartica)** by Stefano Vetrini.
> Mechanical support for the **Brave the Peril** procedure — the Tag Pouch and draw engine
> that sits at the heart of every tense expedition into the eternal ice.

### Features

- **Threat Pool** (`/threats`) — channel-scoped pool of Threats and Visions
- **Brave the Peril** (`/peril`) — full Tag Pouch + draw engine with session lifecycle
- **Language setting** (`/language`) — per-channel bot language (Italian / English)
- **Secure extraction** via `crypto.randomInt()` — cryptographically fair, never `Math.random()`
- **Marked-Trait deferred resolution** — polarity stays uncertain until `/peril end`
- **Push** — 1–2 extra draws with Dire Consequences detection
- **Add-label modal** — add tags mid-session via an interactive Discord form
- **Rate limiting** — 5 actions / 10 s per user
- **Mention sanitization** — prevents @everyone / @here injection in user input
- **Gateway + HTTP mode** — discord.js WebSocket or HTTP interactions endpoint
- **Memory + Redis store** — zero external dependencies by default

### Quick Start

**Prerequisites:** Node.js 22+ · A Discord application with a bot token

```bash
npm ci
cp .env.example .env          # fill in tokens and IDs
npm run deploy-commands        # register slash commands
npm run dev                    # start in gateway mode
```

#### Environment Variables

| Variable                   | Required  | Default   | Description                               |
| -------------------------- | --------- | --------- | ----------------------------------------- |
| `DISCORD_BOT_TOKEN`        | ✅        | —         | Bot token from Discord Developer Portal   |
| `DISCORD_CLIENT_ID`        | ✅        | —         | Application client ID                     |
| `DISCORD_GUILD_ID`         | dev only  | —         | Guild ID for instant command registration |
| `INTERACTIONS_MODE`        | —         | `gateway` | `gateway` or `http`                       |
| `DISCORD_PUBLIC_KEY`       | HTTP mode | —         | Application public key                    |
| `PORT`                     | HTTP mode | `3000`    | HTTP server port                          |
| `STORAGE_BACKEND`          | —         | `memory`  | `memory` or `redis`                       |
| `UPSTASH_REDIS_REST_URL`   | Redis     | —         | Upstash Redis endpoint                    |
| `UPSTASH_REDIS_REST_TOKEN` | Redis     | —         | Upstash Redis token                       |
| `SESSION_TTL_HOURS`        | —         | `6`       | Session auto-expire duration              |

### Commands

#### `/threats` — Threat Pool

| Command                                                       | Description                   |
| ------------------------------------------------------------- | ----------------------------- |
| `/threats set <threat1> [threat2] [threat3] [type1..3] [act]` | Set the channel threat pool   |
| `/threats list`                                               | Show current pool (ephemeral) |
| `/threats clear`                                              | Remove the pool               |

#### `/peril` — Brave the Peril Session

| Command                                                  | Description                                    |
| -------------------------------------------------------- | ---------------------------------------------- |
| `/peril start <objective> [lead] [notes]`               | Start a new session                            |
| `/peril add <type> [subtype] [text] [owner] [neg_side]` | Add a tag to the Pouch                         |
| `/peril add-threats`                                    | Copy threat pool into Pouch                    |
| `/peril bag`                                            | Show Pouch contents (ephemeral, pre-draw only) |
| `/peril draw`                                           | Draw 3 tags + show Push buttons                |
| `/peril end`                                            | End session + show summary                     |
| `/peril reset`                                          | Clear Pouch & draws, keep objective            |

#### `/language` · `/help` · `/privacy`

**Tag types for `/peril add`:**

| Type               | Polarity     | Notes                                                                  |
| ------------------ | ------------ | ---------------------------------------------------------------------- |
| `Trait`            | ✨ Positive  |                                                                        |
| `Name`             | ✨ Positive  | Subtype of Trait                                                       |
| `Archetype`        | ✨ Positive  | Subtype of Trait                                                       |
| `Supply`           | ✨ Positive  |                                                                        |
| `Marked Trait`     | ❓ Uncertain | Resolved at session end. Use `neg_side` + `type=trait` to auto-create  |
| `Condition`        | 💀 Negative  |                                                                        |
| `Dread`            | 💀 Negative  | Subtype of Condition                                                   |
| `Resignation`      | 💀 Negative  |                                                                        |
| `Threat`           | 💀 Negative  | ⚠️ Dire Consequences if drawn during Push                              |
| `Vision`           | 💀 Negative  | ⚠️ Dire Consequences if drawn during Push                              |

### Session Lifecycle

```
/peril start  →  add tags  →  /peril draw  →  [Push]  →  /peril end
```

- One active session per channel at a time
- Only the Lead can draw, end, reset, or add the threat pool
- Push buttons restricted to the Lead (1 or 2 extra draws)
- Marked Trait stays uncertain until `/peril end` — coin flip resolved there
- Sessions auto-expire after 6 hours

### Development

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # tsc --noEmit
npm test              # Vitest
npm run build         # Compile TypeScript
```

### Deployment (Fly.io)

```bash
fly secrets set DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=...
fly deploy
```

`fly.toml` uses `INTERACTIONS_MODE=http`. `npm run deploy-commands` runs as the release command on every deploy.

### Architecture

- **`src/lib/domain.ts`** — Tag types, extraction, polarity resolution, uncertain-draw resolution
- **`src/lib/store*.ts`** — Session / threat pool / language storage
- **`src/commands/`** — Slash command handlers (`threats`, `danger`, `language`, `help`, `privacy`)
- **`src/interactions/buttons.ts`** — Push, proceed-draw, add-label modal
- **`src/http/`** — HTTP server, Ed25519 verification, interaction adapters
- **`src/modes/gateway.ts`** — discord.js WebSocket gateway mode

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design document.

### License & Security

MIT — see [LICENSE](LICENSE). · Security policy: [SECURITY.md](SECURITY.md) · Privacy: [PRIVACY.md](PRIVACY.md)

Game: **[Antartica](https://stefanovetrini.itch.io/antartica)** by Stefano Vetrini.

---

<a name="italiano"></a>

## 🇮🇹 Italiano

> Bot Discord per **[Antartica](https://stefanovetrini.itch.io/antartica)** di Stefano Vetrini.
> Supporto meccanico per la procedura **Affrontare il Pericolo** — il motore di sacchetto ed estrazione
> che governa ogni spedizione nel ghiaccio eterno.

### Funzionalità

- **Pool Minacce** (`/threats`) — pool di Minacce e Visioni per canale
- **Sessione Affrontare il Pericolo** (`/peril`) — sacchetto etichette + motore di estrazione completo
- **Lingua** (`/language`) — lingua del bot per canale (Italiano / Inglese)
- **Estrazione sicura** via `crypto.randomInt()` — casuale crittograficamente corretto
- **Tratto-Segnato a risoluzione differita** — la polarità rimane incerta fino a `/peril end`
- **Superarsi** — 1–2 estrazioni extra con rilevamento Conseguenze Nefaste
- **Modal aggiungi etichetta** — aggiunta etichette a sessione in corso tramite form Discord
- **Rate limiting** — 5 azioni / 10 s per utente
- **Sanitizzazione menzioni** — impedisce injection di @everyone / @here nell'input utente
- **Modalità Gateway + HTTP** — WebSocket discord.js o endpoint HTTP interactions
- **Store Memory + Redis** — zero dipendenze esterne di default

### Avvio Rapido

**Prerequisiti:** Node.js 22+ · Un'applicazione Discord con bot token

```bash
npm ci
cp .env.example .env          # compila token e ID
npm run deploy-commands        # registra i comandi slash
npm run dev                    # avvia in modalità gateway
```

#### Variabili d'Ambiente

| Variabile                  | Richiesta | Default   | Descrizione                                   |
| -------------------------- | --------- | --------- | --------------------------------------------- |
| `DISCORD_BOT_TOKEN`        | ✅        | —         | Token bot dal Discord Developer Portal        |
| `DISCORD_CLIENT_ID`        | ✅        | —         | Client ID dell'applicazione                   |
| `DISCORD_GUILD_ID`         | solo dev  | —         | Guild ID per registrazione istantanea comandi |
| `INTERACTIONS_MODE`        | —         | `gateway` | `gateway` oppure `http`                       |
| `DISCORD_PUBLIC_KEY`       | modo HTTP | —         | Chiave pubblica dell'applicazione             |
| `PORT`                     | modo HTTP | `3000`    | Porta del server HTTP                         |
| `STORAGE_BACKEND`          | —         | `memory`  | `memory` oppure `redis`                       |
| `UPSTASH_REDIS_REST_URL`   | Redis     | —         | Endpoint Upstash Redis                        |
| `UPSTASH_REDIS_REST_TOKEN` | Redis     | —         | Token Upstash Redis                           |
| `SESSION_TTL_HOURS`        | —         | `6`       | Durata auto-scadenza sessione                 |

### Comandi

#### `/threats` — Pool Minacce

| Comando                                                       | Descrizione                        |
| ------------------------------------------------------------- | ---------------------------------- |
| `/threats set <threat1> [threat2] [threat3] [type1..3] [act]` | Imposta il Pool Minacce del canale |
| `/threats list`                                               | Mostra il pool corrente (effimero) |
| `/threats clear`                                              | Rimuove il pool                    |

#### `/peril` — Sessione Pericolo

| Comando                                                  | Descrizione                                        |
| -------------------------------------------------------- | -------------------------------------------------- |
| `/peril start <objective> [lead] [notes]`               | Avvia una nuova sessione                           |
| `/peril add <type> [subtype] [text] [owner] [neg_side]` | Aggiunge un'etichetta al sacchetto                 |
| `/peril add-threats`                                    | Copia il Pool Minacce nel sacchetto                |
| `/peril bag`                                            | Mostra il contenuto del sacchetto (effimero)       |
| `/peril draw`                                           | Estrai 3 etichette + mostra pulsanti Superarsi     |
| `/peril end`                                            | Termina la sessione + mostra riepilogo             |
| `/peril reset`                                          | Azzera sacchetto ed estrazioni, mantieni obiettivo |

#### `/language` · `/help` · `/privacy`

**Tipi di etichetta per `/peril add`:**

| Tipo               | Polarità    | Note                                                                    |
| ------------------ | ----------- | ----------------------------------------------------------------------- |
| `Tratto`           | ✨ Positivo |                                                                         |
| `Nome`             | ✨ Positivo | Sottotipo di Tratto                                                     |
| `Archetipo`        | ✨ Positivo | Sottotipo di Tratto                                                     |
| `Risorsa`          | ✨ Positivo |                                                                         |
| `Tratto Segnato`   | ❓ Incerto  | Risolto a fine sessione. Usa `neg_side` + `type=tratto` per auto-creare |
| `Condizione`       | 💀 Negativo |                                                                         |
| `Terrore`          | 💀 Negativo | Sottotipo di Condizione                                                 |
| `Rassegnazione`    | 💀 Negativo |                                                                         |
| `Minaccia`         | 💀 Negativo | ⚠️ Conseguenze Nefaste se estratta durante Superarsi                    |
| `Visione`          | 💀 Negativo | ⚠️ Conseguenze Nefaste se estratta durante Superarsi                    |

### Ciclo di Vita della Sessione

```
/peril start  →  aggiungi etichette  →  /peril draw  →  [Superarsi]  →  /peril end
```

- Una sola sessione attiva per canale alla volta
- Solo la Guida può estrarre, terminare, azzerare o aggiungere il pool minacce
- I pulsanti Superarsi sono riservati alla Guida (1 o 2 estrazioni extra)
- Il Tratto-Segnato rimane incerto fino a `/peril end` — lancio della moneta risolto lì
- Le sessioni scadono automaticamente dopo 6 ore

### Sviluppo

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # tsc --noEmit
npm test              # Vitest
npm run build         # Compila TypeScript
```

### Deploy (Fly.io)

```bash
fly secrets set DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=...
fly deploy
```

`fly.toml` usa `INTERACTIONS_MODE=http`. `npm run deploy-commands` viene eseguito come release command ad ogni deploy.

### Architettura

- **`src/lib/domain.ts`** — Tipi etichetta, estrazione, risoluzione polarità e draw incerti
- **`src/lib/store*.ts`** — Sessioni, Pool Minacce, lingua per canale
- **`src/commands/`** — Handler comandi slash (`threats`, `danger`, `language`, `help`, `privacy`)
- **`src/interactions/buttons.ts`** — Superarsi, proceed-draw, modal aggiungi etichetta
- **`src/http/`** — Server HTTP, verifica Ed25519, adapter interazioni
- **`src/modes/gateway.ts`** — Modalità gateway WebSocket discord.js

Vedi [ARCHITECTURE.md](ARCHITECTURE.md) per il documento di design completo.

### Licenza e Sicurezza

MIT — vedi [LICENSE](LICENSE). · Policy di sicurezza: [SECURITY.md](SECURITY.md) · Privacy: [PRIVACY.md](PRIVACY.md)

Gioco: **[Antartica](https://stefanovetrini.itch.io/antartica)** di Stefano Vetrini.
