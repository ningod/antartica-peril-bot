# Security Policy

## Secret Management

- **Bot token** (`DISCORD_BOT_TOKEN`) and **client ID** (`DISCORD_CLIENT_ID`) are loaded
  exclusively from environment variables via `dotenv`.
- **No secrets are hardcoded** in source files, configuration, or documentation.
- `.env` and `.env.*` files (except `.env.example`) are excluded from version control.

## HTTP Mode — Signature Verification

When `INTERACTIONS_MODE=http`, every incoming request is verified using Ed25519 signatures
per the [Discord HTTP interactions spec](https://discord.com/developers/docs/interactions/overview).

- `DISCORD_PUBLIC_KEY` is required for HTTP mode.
- Requests with missing or invalid signatures receive `401 Unauthorized`.
- Verification uses Node.js native `crypto.subtle` (Ed25519) — no external crypto deps.

## Logging Policy

**What IS logged** (metadata only):

- User IDs, channel IDs, guild IDs
- Command/subcommand names
- Session IDs (first 8 chars for correlation)
- Timestamps and error messages (no stack traces in production)

**What is NEVER logged:**

- Tag text content or extraction results
- Objective/notes text
- Bot token or any credentials
- Full interaction payloads

## Input Validation

| Constraint           | Limit           | Enforced in                       |
| -------------------- | --------------- | --------------------------------- |
| Tag text             | Max 200 chars   | Slash option + `sanitizeText()`   |
| Objective/notes      | Max 500 chars   | Slash option                      |
| @mention suppression | All user text   | `domain.ts` → `sanitizeText()`    |
| `allowedMentions`    | `{ parse: [] }` | All `editReply()`/`reply()` calls |
| Push count           | 1–2             | Button IDs + handler validation   |
| Threat pool size     | 1–3 tags        | `/threats set` validation         |

## Authorization

### Lead-only Actions

`/peril draw`, `add-threats`, `end`, `reset` are restricted to the Lead.
The Lead's Discord user ID is stored when `/peril start` is called.
Every protected action checks `interaction.user.id === session.guideId`.

### Push Buttons

Button handler checks `interaction.user.id !== session.guideId` and rejects non-Leads
with an ephemeral error without processing the draw.

## Rate Limiting

| Parameter              | Value               |
| ---------------------- | ------------------- |
| Max actions per window | 5                   |
| Window duration        | 10 seconds          |
| Scope                  | Per Discord user ID |

Enforced on draw and push operations.

## Random Number Generation

All randomness uses `crypto.randomInt()` from `node:crypto`. `Math.random()` is never used.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x.x   | ✅        |

## Reporting Vulnerabilities

**Do not report security vulnerabilities through public GitHub issues.**

Use one of:

1. [GitHub Security Advisories](https://github.com/ningod/antartica-peril-bot/security/advisories)
   (Security tab → "Report a vulnerability")
2. Contact the maintainer via the repository

**Expected response time:** 48 hours.

Please include: description, reproduction steps, potential impact, and suggested fix.
