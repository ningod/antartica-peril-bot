# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

**About This Project:** This Discord bot was created by
[Stefano Vetrini](https://stefanovetrini.itch.io) to support
[Antartica](https://stefanovetrini.itch.io/antartica), a tabletop RPG.

---

## [Unreleased]

### Added

#### Commands

- **`/threats set|list|clear`** — channel-scoped Threat Pool management with optional Act-based
  composition validation (Act I: exactly 2 tags, no Visions; Act II: exactly 3 tags, at least
  1 Vision; Act III: exactly 3 tags, any mix)
- **`/peril start`** — open a new Brave the Peril session in the channel, with objective, optional
  Lead override, and optional notes
- **`/peril add`** — add a tag to the Pouch (type + optional subtype + text; `neg_side` auto-creates
  a Tratto-Segnato); supports autocomplete from the invoker's Explorer profile
- **`/peril add-threats`** — copy the channel Threat Pool into the Pouch (Guide only, once per session)
- **`/peril add-conditions`** — copy all Explorer Conditions from the channel into the Pouch (Guide only)
- **`/peril bag`** — show Pouch contents as an ephemeral embed (before the first draw only)
- **`/peril draw`** — draw 3 tags from the Pouch; shows Push Yourself buttons (+1/+2) if tags remain
- **`/peril end`** — end the session, resolve Tratto-Segnato coin flips, and show the full summary
- **`/peril reset`** — clear Pouch and draws while keeping the objective and Guide
- **`/explorer set|add|remove|clear|list`** — per-user per-channel Explorer character profile;
  tags are offered as autocomplete suggestions in `/peril add`
- **`/language`** — set the bot UI language for the channel (`it` / `en`; Italian is the default)
- **`/help`** — show command reference
- **`/privacy`** — show privacy policy

#### Tag type system

- Ten tag types: `tratto`, `tratto-nome`, `tratto-archetipo`, `risorsa`, `tratto-segnato`,
  `condizione`, `terrore`, `rassegnazione`, `minaccia`, `visione`
- `rassegnazione` carries no text; all others are sanitized and capped at 200 characters

#### Mechanics

- **Bag draw without replacement** using `crypto.randomInt()`
- **Tratto-Segnato deferred resolution** — polarity stays `'uncertain'` at draw time; coin flip
  runs at session end via `resolveUncertainDraws()`; result shown per-tag in the end-of-session embed
- **Push Yourself** (+1 or +2 extra draws) via buttons, restricted to the Guide, once per session
- **Dire Consequences** detection: triggered when any Push draw is a `minaccia` or `visione`
- **Interactive add-label flow**: Add Label button → type select menu → optional Explorer suggestion
  menu → modal form (pre-populated for Tratto-Segnato from Explorer profile)
- **Proceed-to-draw shortcut** button shown after every add-tag reply (Guide only)

#### Infrastructure

- Gateway mode (discord.js WebSocket) and HTTP mode (Node `http.createServer`, Ed25519 signature
  verification via `crypto.subtle`)
- In-memory store — no external dependencies; session TTL 6 h with 10-minute sweep; Explorer
  profiles and Threat Pools never expire
- **Redis store** (`STORAGE_BACKEND=redis`) — Upstash REST client; sessions use Redis native TTL
  (recalculated from `createdAt` on every write); Explorer profiles and Threat Pools have no TTL;
  Explorer channel membership tracked via a Redis Set for efficient `getExplorerProfilesForChannel`
- **Redis key prefix** (`UPSTASH_REDIS_KEY_PREFIX`, default `antartica`) — namespaces all Redis
  keys so multiple applications can share a single Upstash instance without key collisions
- `discord-api-types` moved to `dependencies` (was `devDependencies`); required at runtime in
  HTTP mode for interaction type enums
- Sliding-window rate limiter: 5 actions / 10 s per user
- Multilingual UI: Italian (default) and English translation bundles; per-channel preference
- Input sanitization against `@mention` injection on all user-provided text
- `allowedMentions: { parse: [] }` on every bot response
- Fly.io deployment configuration (`fly.toml`, `Dockerfile`)
- GitHub Actions CI pipeline (lint, typecheck, test, build)

[unreleased]: https://github.com/ningod/antartica-peril-bot/commits/main
