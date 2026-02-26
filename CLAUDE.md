# CLAUDE.md — Antartica Peril Bot

Project guide for AI assistants working on this codebase.

## Project Context

Discord bot for the **Antartica** TTRPG by Stefano Vetrini.
Scope: **Brave the Peril (Affrontare il Pericolo)** — Tag Pouch + extraction engine.

## Critical Rules

### Security

- NEVER use `Math.random()` — always `crypto.randomInt()` from `node:crypto`
- NEVER log tag text, objective text, or user content
- ALWAYS call `sanitizeText()` on user-provided tag text
- ALWAYS include `allowedMentions: { parse: [] }` in every Discord response
- NEVER hardcode any token, secret, or credential
- Button handlers MUST verify `interaction.user.id === session.guideId`

### Code Style

- TypeScript strict mode always on; no `@ts-ignore` without justification
- Use `.js` extensions in all ESM import paths
- `const` over `let`, never `var`
- Explicit return types on exported functions
- `interface` for object shapes, `type` for unions/aliases
- 2-space indentation, LF line endings, trailing newline

### Testing

- Always run: `npm test && npm run lint && npm run typecheck && npm run build`
- Fix all failures before committing
- New features require tests in `tests/`

## npm Scripts

```
npm run dev              Start bot in dev mode (gateway)
npm run deploy-commands  Register slash commands with Discord
npm run build            tsc
npm run start            node dist/index.js
npm test                 vitest run
npm run lint             eslint .
npm run format:check     prettier --check .
npm run typecheck        tsc --noEmit
```

## File Ownership

| Concern              | File(s)                       |
| -------------------- | ----------------------------- |
| Game domain logic    | `src/lib/domain.ts`           |
| Storage interfaces   | `src/lib/store-interface.ts`  |
| Memory store         | `src/lib/store.ts`            |
| Store factory        | `src/lib/store-factory.ts`    |
| Discord embeds       | `src/lib/embeds.ts`           |
| Threat pool commands | `src/commands/threats.ts`     |
| Session commands     | `src/commands/peril.ts`       |
| Explorer profiles    | `src/commands/explorer.ts`    |
| Language command     | `src/commands/language.ts`    |
| Help command         | `src/commands/help.ts`        |
| Privacy command      | `src/commands/privacy.ts`     |
| Translations         | `src/lib/i18n/`               |
| Button/modal/select  | `src/interactions/buttons.ts` |
| HTTP server          | `src/http/server.ts`          |
| Gateway mode         | `src/modes/gateway.ts`        |
| Entry point          | `src/index.ts`                |
| Command registration | `src/deploy-commands.ts`      |

## Key Invariants to Preserve

1. Only one active session per channel (`getSession(channelId)`)
2. Push allowed only ONCE per session (`pushDraws.length === 0` check)
3. Pouch draw is WITHOUT replacement (bag array is mutated in-place)
4. `tratto-segnato` polarity is `'uncertain'` at draw time — resolved at session end via `resolveUncertainDraws()`, NOT at draw time
5. Dire Consequences triggered by `isThreatOrVision` in `pushDraws` only
6. Explorer profiles are per-user per-channel; they never expire and are independent of sessions

## Change Protocol

1. Read all affected files before modifying
2. Write tests before or alongside implementation
3. Run full test/lint/typecheck/build suite
4. Document changes in CHANGELOG.md
5. **After every prompt**: verify that ARCHITECTURE.md, CLAUDE.md, and inline source comments
   still match the code. If any drift is found, fix it in the same response before finishing.

## Safe Operations

- Adding new tag display text in `embeds.ts`
- Adding new unit tests in `tests/`
- Updating documentation files

## DO NOT

- `git push --force` without explicit user request
- Weaken any security checks (auth, rate limit, sanitization)
- Commit `.env` files
- Add dependencies without justification
