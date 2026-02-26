# SPEC.md — Antartica Peril Bot

> Mechanical support bot for the **Antartica** TTRPG by Stefano Vetrini.
> Scope: **Brave the Peril (Affrontare il Pericolo)** procedure — Tag insertion and extraction.

---

## 1. Command List

### `/threats` — Threat Pool (channel-scoped)

| Subcommand | Required  | Optional                                | Behaviour                     |
| ---------- | --------- | --------------------------------------- | ----------------------------- |
| `set`      | `threat1` | `threat2`, `threat3`, `type1..3`, `act` | Replace channel threat pool   |
| `list`     | —         | —                                       | Show current pool (ephemeral) |
| `clear`    | —         | —                                       | Remove all pool tags          |

### `/peril` — Danger Session (channel-scoped)

| Subcommand    | Required    | Optional                               | Behaviour                           |
| ------------- | ----------- | -------------------------------------- | ----------------------------------- |
| `start`       | `objective` | `lead`, `notes`                        | Open new session (one per channel)  |
| `add`         | `type`      | `subtype`, `text`, `owner`, `neg_side` | Add one tag to the Pouch            |
| `add-threats` | —           | —                                      | Copy threat pool into Pouch         |
| `bag`         | —           | —                                      | Show Pouch contents (ephemeral)     |
| `draw`        | —           | —                                      | Draw 3 tags; show Push buttons      |
| `end`         | —           | —                                      | Close session, show summary         |
| `reset`       | —           | —                                      | Clear Pouch & draws, keep objective |

### `/language` — Bot language (channel-scoped)

| Option     | Required | Behaviour                                   |
| ---------- | -------- | ------------------------------------------- |
| `language` | ✅       | Set bot language for this channel (it / en) |

### `/help` — Bot help

### `/privacy` — Privacy policy

---

## 2. Label Type System

### Type Choices for `/peril add`

| Value              | Display          | Polarity      | Triggers Severe            |
| ------------------ | ---------------- | ------------- | -------------------------- |
| `tratto`           | Tratto           | **Positive**  | No                         |
| `tratto-nome`      | Nome      | **Positive**  | No (subtype of tratto)     |
| `tratto-archetipo` | Archetipo | **Positive**  | No (subtype of tratto)     |
| `risorsa`          | Risorsa          | **Positive**  | No                         |
| `tratto-segnato`   | Tratto-Segnato   | **Uncertain** | No                         |
| `condizione`       | Condizione       | **Negative**  | No                         |
| `terrore`          | Terrore          | **Negative**  | No (subtype of condizione) |
| `rassegnazione`    | Rassegnazione    | **Negative**  | No                         |
| `minaccia`         | Minaccia         | **Negative**  | **Yes** (Push only)        |
| `visione`          | Visione          | **Negative**  | **Yes** (Push only)        |

### Tratto-Segnato Flip Logic

- At draw time: polarity is `'uncertain'`; `displayText` = positive side text (`text` field)
- At session end only: `resolveUncertainDraws()` flips each uncertain draw
  - `crypto.randomInt(0, 2)` → 0 = positive side (`posSide`), 1 = negative side (`negSide`)
- Auto-creation: providing `neg_side` with `type=tratto` creates a `tratto-segnato` automatically
  (`text` = positive side, `neg_side` = negative side)

---

## 3. Session Lifecycle

```
null
  │  /peril start
  ▼
ACTIVE ──────────────────────────────────┐
  │  /peril add (repeat)                │
  │  /peril add-threats                 │
  │  /peril reset (clears bag+draws)    │
  │                                      │
  │  /peril draw                        │
  ▼                                      │
DRAWN (base draws present)               │
  │  [+1] or [+2] Push Yourself buttons  │
  ▼                                      │
PUSHED (optional, exactly 1 push phase)  │
  │                                      │
  │  /peril end ────────────────────────┘
  ▼
null (session deleted; uncertain draws resolved via coin flip at end)
```

**Constraints:**

- Only one active session per channel at a time
- Only the Guide can call `/peril draw`, `end`, `reset`, `add-threats`
- Only the Guide can press Push Yourself buttons
- Base draw is exactly 3 labels (or bag size if < 3)
- Push phase happens at most once per session (1 or 2 extra draws)
- Session auto-expires after **6 hours**

---

## 4. Domain Model

```typescript
type LabelType =
  | 'tratto'
  | 'tratto-nome'
  | 'tratto-archetipo'
  | 'risorsa'
  | 'tratto-segnato'
  | 'condizione'
  | 'terrore'
  | 'rassegnazione'
  | 'minaccia'
  | 'visione';

interface Label {
  id: string; // crypto.randomUUID()
  type: LabelType;
  text: string; // sanitized, max 200 chars
  ownerId?: string; // Discord user ID
  posSide?: string; // tratto-segnato positive side
  negSide?: string; // tratto-segnato negative side
}

interface DrawnLabel {
  label: Label;
  polarity: 'positive' | 'negative' | 'uncertain';
  displayText: string; // positive side text for uncertain draws
  isThreatOrVision: boolean; // true for minaccia | visione
}

interface UncertainFlip {
  label: Label;
  polarity: 'positive' | 'negative'; // result of coin flip at session end
  displayText: string;
}

interface ThreatPool {
  channelId: string;
  labels: Label[];
  updatedAt: Date;
}

interface PericoloSession {
  sessionId: string;
  channelId: string;
  guildId: string;
  guideId: string;
  guideName: string; // stored at session start for embed display
  objective: string; // max 500 chars
  notes?: string; // max 500 chars
  bag: Label[]; // remaining labels (after draws)
  allLabels: Label[]; // all labels ever added (for bag display)
  baseDraws: DrawnLabel[];
  pushDraws: DrawnLabel[];
  threatPoolAdded: boolean; // prevent double-adding
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 5. Storage Design

```
IPericoloStore
├── getThreatPool(channelId)     → ThreatPool | null
├── setThreatPool(pool)
├── clearThreatPool(channelId)
├── getSession(channelId)        → PericoloSession | null
├── setSession(session)
├── deleteSession(channelId)     → boolean
├── getChannelLang(channelId)    → Lang
└── setChannelLang(channelId, lang)
```

**Backends:**

- `memory` (default): `MemoryPericoloStore`, session TTL = 6h, swept every 10 min
- `redis` (planned): Upstash Redis, `STORAGE_BACKEND=redis`

**Env vars:**

```
STORAGE_BACKEND=memory|redis          # default: memory
SESSION_TTL_HOURS=6                   # default: 6
```

---

## 6. Interaction Flow

### `/peril draw`

1. Check active session, check base draws empty
2. `drawFromBag(bag, 3)` → `{ drawn, remaining }`
3. Save updated session with `baseDraws` and new `bag`
4. Build draw embed (drawn labels + positive/negative/uncertain counts)
5. Add action row: `[+1 Push Yourself]` `[+2 Push Yourself]` `[Fine Pericolo]`
6. Send public reply (visible to channel)

### Push Yourself Buttons (`push:<count>:<channelId>`)

1. `deferUpdate()` — acknowledge, don't change message yet
2. Verify `interaction.user.id === session.guideId`; else `followUp(ephemeral error)`
3. Check `session.pushDraws.length === 0` (no double push)
4. `drawFromBag(session.bag, count)` → push draws (count = 1 or 2)
5. Check `hasThreatOrVision(pushDraws)` → set `severeConsequences` flag
6. Save updated session
7. `interaction.message.edit(updatedEmbed, noButtons)`

### `/peril end`

1. Load session
2. `resolveUncertainDraws(session.baseDraws)` + `resolveUncertainDraws(session.pushDraws)`
   — coin flip for each Tratto-Segnato; build `UncertainFlip[]` list
3. Delete session
4. Build summary embed: objective, guide, all draws (resolved), uncertain resolutions, totals
5. Send public reply

---

## 7. Button Custom ID Format

```
push:<count>:<channelId>         — count is 1 or 2
end-peril:<channelId>
proceed-draw:<channelId>
add-label:<channelId>
add-label-modal:<channelId>
```

All ≤ 100 chars. Example: `push:2:1234567890123456789` = 26 chars ✓

---

## 8. Security / Input Constraints

| Input                | Limit                   | Enforced in                             |
| -------------------- | ----------------------- | --------------------------------------- |
| Label text           | Max 200 chars           | `/peril add` option + `sanitizeText()` |
| Objective/notes      | Max 500 chars           | `/peril start` option                  |
| @mention suppression | All user text           | `sanitizeText()` in `domain.ts`         |
| Rate limit           | 5 actions / 10 s / user | `RateLimiter` in lib                    |
| Push count           | 1–2                     | Button IDs + validation in handler      |
| Threat pool size     | 1–3 labels              | `/threats set` validation               |

---

## 9. Acceptance Criteria

- [ ] `/threats` CRUD works channel-scoped
- [ ] `/peril` session lifecycle is channel-scoped, one session at a time
- [ ] Draw 3 labels without replacement using `crypto.randomInt()`
- [ ] Push Yourself draws 1–2 extra without replacement
- [ ] Minaccia/Visione in push draws → Severe Consequences flagged
- [ ] Only Guide can use push buttons and Guide-only commands
- [ ] `tratto-segnato` stays uncertain at draw time; resolved at session end via `crypto.randomInt(0, 2)`
- [ ] All label types classified correctly (positive/negative/uncertain)
- [ ] Session auto-expires after 6 hours
- [ ] Input sanitized (no @everyone/@here/@mentions)
- [ ] `allowedMentions: { parse: [] }` on all embeds
- [ ] Rate limited (5 actions/10 s per user)
- [ ] All Vitest tests pass
- [ ] ESLint + Prettier + TypeScript strict pass
- [ ] Dockerfile + fly.toml deploy-ready
- [ ] GitHub Actions CI/CD mirrors template
