# Architecture

## Overview

Antartica — Peril Bot is a focused mechanical support tool for the _Antartica_ TTRPG.
It implements the **Brave the Peril (Affrontare il Pericolo)** procedure: Tag Pouch composition
and random extraction.

## Interaction Modes

| Mode                | Transport | How it works                                                              |
| ------------------- | --------- | ------------------------------------------------------------------------- |
| `gateway` (default) | WebSocket | discord.js `Client`, event-driven                                         |
| `http`              | HTTP POST | Node `http.createServer()`, Ed25519 verify, `@discordjs/rest` for replies |

Both modes share the same command/button handlers via an adapter pattern.

## File Structure

```
src/
  lib/
    domain.ts          Label types, drawFromBag, resolveLabel, resolveUncertainDraws, sanitizeText
    store-interface.ts IPericoloStore, PericoloSession, ThreatPool, ExplorerProfile, ExplorerTag
    store.ts           MemoryPericoloStore (6h session TTL, 10min sweep; profiles never expire)
    redis-store.ts     RedisPericoloStore (Upstash REST; TTL via Redis EX; configurable key prefix)
    store-factory.ts   createStore() — selects backend from env
    config.ts          Legal URL config
    logger.ts          Structured JSON logger
    ratelimit.ts       Sliding-window per-user rate limiter
    embeds.ts          All Discord EmbedBuilder factories
    i18n/              Translation bundles (it, en) and Tr type
  commands/
    threats.ts         /threats set|list|clear
    peril.ts           /peril start|add|add-threats|add-conditions|add-resignations|bag|draw|end|reset
    explorer.ts        /explorer set|add|remove|clear|list
    language.ts        /language
    help.ts            /help
    privacy.ts         /privacy
  interactions/
    buttons.ts         Push, end-peril, proceed-draw, add-label-type/suggest/modal handlers
  http/
    verify.ts          Ed25519 signature verification (crypto.subtle)
    adapter.ts         HTTP interaction adapters (matches discord.js API surface)
    server.ts          HTTP server + interaction routing
  modes/
    gateway.ts         discord.js WebSocket gateway mode
  index.ts             Entry point, mode selection
  deploy-commands.ts   Slash command registration
```

## Domain Model

```
Label {
  id: crypto.randomUUID()
  type: LabelType
  text?: string         // optional (sanitized, max 200); absent for rassegnazione
  ownerId?: string
  posSide?: string      // tratto-segnato positive side
  negSide?: string      // tratto-segnato negative side
}

DrawnLabel {
  label: Label
  polarity: 'positive' | 'negative' | 'uncertain'
  displayText: string         // resolved text (positive side for tratto-segnato)
  isThreatOrVision: boolean   // minaccia | visione
}

UncertainFlip {
  label: Label
  polarity: 'positive' | 'negative'   // result of the coin flip
  displayText: string
}

ThreatPool { channelId, labels[], updatedAt }

PericoloSession {
  sessionId, channelId, guildId, guideId, guideName
  objective, notes?
  bag: Label[]          // remaining (Pouch)
  allLabels: Label[]    // for display
  baseDraws: DrawnLabel[]
  pushDraws: DrawnLabel[]
  threatPoolAdded: boolean
  createdAt, updatedAt
}

ExplorerTag {
  id: string
  type: LabelType
  text: string          // empty string for rassegnazione
  posSide?: string      // tratto-segnato positive side
  negSide?: string      // tratto-segnato negative side
}

ExplorerProfile {
  userId, channelId     // composite key (user+channel scoped)
  tags: ExplorerTag[]
  updatedAt
  // No TTL — persists until cleared by the user
}
```

## Extraction Algorithm

```typescript
function drawFromBag(pouch, count):
  for i in range(min(count, bag.length)):
    idx = crypto.randomInt(0, remaining.length)
    drawn.push(resolveLabel(remaining.splice(idx, 1)[0]))
  return { drawn, remaining }

function resolveLabel(label):
  if tratto | tratto-nome | tratto-archetipo | risorsa:
                          → positive, displayText = label.text
  if tratto-segnato:      → uncertain (polarity deferred; displayText = positive side text)
  if everything else:     → negative, isThreatOrVision = minaccia|visione

function resolveUncertainDraws(draws):
  // Called at /peril end only — coin flip for each uncertain draw
  for each uncertain DrawnLabel:
    crypto.randomInt(0, 2) === 0 → positive (posSide text)
                                 → negative (negSide text)
  return { resolved: DrawnLabel[], flips: UncertainFlip[] }
```

## Session State Machine

```
null ──[/peril start]──► ACTIVE
 ▲                             │
 │    [/peril end]            │ [/peril add, add-threats, add-conditions, add-resignations, reset]
 └──────────────────────────┐  │ [add-label button → type select → modal]
                            │  ▼
                            ACTIVE (tags in Pouch)
                               │
                    [/peril draw | proceed-draw button]
                               │
                               ▼
                         DRAWN (baseDraws set)
                               │
                    [Push buttons]
                               │
                               ▼
                         PUSHED (pushDraws set)
```

## Button / Select / Modal Custom ID Format

```
push:<count>:<channelId>               — Push (+1 or +2 draws); deferUpdate
end-peril:<channelId>                  — End session shortcut; deferUpdate
proceed-draw:<channelId>               — Draw shortcut from add-label reply; deferReply (public)
add-label:<channelId>                  — Open type-selection select menu; reply ephemeral (no defer)
add-label-type:<channelId>             — Type selection select menu custom_id; deferUpdate
add-label-suggest:<channelId>:<type>   — Explorer suggestion select menu custom_id; deferUpdate
add-label-modal:<channelId>:<type>     — Modal form custom_id; deferReply (ephemeral)
```

All IDs ≤ 100 chars. Example: `push:2:1234567890123456789` = 26 chars ✓

**Add-label flow:**

1. User clicks `add-label:<channelId>` button → bot replies with ephemeral `add-label-type:` select menu
2. User selects a type:
   - `rassegnazione` → `deferUpdate` → added directly (no modal)
   - Other type, user has matching Explorer tags → `deferUpdate` → `add-label-suggest:` select menu shown
   - Other type, no Explorer tags → `showModal` with blank `add-label-modal:` form
3. From suggest menu: select a tag → direct add; select `__custom__` or `tratto-segnato` → `showModal`
4. Modal submitted → `deferReply` (ephemeral) → label added to bag

## Storage Interface

```typescript
interface IPericoloStore {
  start() / stop()
  // Threat pool (channel-scoped)
  getThreatPool(channelId) / setThreatPool(pool) / clearThreatPool(channelId)
  // Session (channel-scoped)
  getSession(channelId) / setSession(session) / deleteSession(channelId)
  // Language preference (channel-scoped)
  getChannelLang(channelId) / setChannelLang(channelId, lang)
  // Explorer profile (user+channel-scoped)
  getExplorerProfile(userId, channelId) / setExplorerProfile(profile)
  clearExplorerProfile(userId, channelId)
  getExplorerProfilesForChannel(channelId)
}
```

`MemoryPericoloStore`: Map-based, session TTL = 6h, sweep every 10 min.
Threat pools, language prefs, and Explorer profiles never expire.

`RedisPericoloStore`: Upstash REST client. Sessions use Redis `EX` TTL (recalculated
from `createdAt` on every write). Threat pools, language prefs, and Explorer profiles
have no TTL. Explorer channel membership tracked via a Redis Set
(`{prefix}:explorers-ch:{channelId}`).

**Key prefix** — All Redis keys are namespaced with a configurable prefix
(env `UPSTASH_REDIS_KEY_PREFIX`, default `antartica`). This allows multiple
applications on Fly.io to share a single Upstash instance without key collisions.
Key format: `{prefix}:<type>:<id>` (e.g. `antartica:session:1234567890`).

## Security Invariants

1. `crypto.randomInt()` for all randomness — never `Math.random()`
2. All user text passes through `sanitizeText()` before storage
3. `allowedMentions: { parse: [] }` on every Discord response
4. Lead authorization checked before every Lead-only action
5. Button authorization: user ID vs `session.guideId`
6. Rate limit: 5 actions per 10s per user
7. No session data logged; only IDs and counts
8. No secrets hardcoded; all via env vars
