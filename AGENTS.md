# AGENTS.md — AI Agent Protocol

This document defines the agentic development protocol for AI assistants working on
Antartica — Peril Bot.

## 4-Step Change Protocol

Before making any code change:

1. **Plan** — Read CLAUDE.md, SPEC.md, and relevant source files. Understand the impact.
2. **Implement** — Make atomic, minimal changes. One concern per commit.
3. **Test** — Run `npm test && npm run lint && npm run typecheck && npm run build`.
4. **Document** — Update CHANGELOG.md and affected doc files.

## Security Threat-Modelling Checklist

Before submitting any PR, verify:

- [ ] No `Math.random()` — only `crypto.randomInt()`
- [ ] All user text sanitized via `sanitizeText()`
- [ ] `allowedMentions: { parse: [] }` on all responses
- [ ] No tag text or objective text logged
- [ ] Lead authorization enforced on Lead-only actions
- [ ] Button authorization checks `user.id === session.guideId`
- [ ] Rate limiter consulted before draw/push operations
- [ ] No secrets in source, config, or committed files

## Discord Interaction Protocol

- Slash commands must be deferred IMMEDIATELY (within 3s Discord deadline)
- `deferUpdate()` for buttons that edit the existing message
- `deferReply({ flags: Ephemeral })` for buttons that create new messages
- Always use `allowedMentions: { parse: [] }` to prevent mention abuse
- Button custom IDs must be ≤ 100 chars

## Session Invariants

- At most ONE active session per channel
- Push: exactly ONE push phase per session
- `baseDraws` must be non-empty before push is allowed
- `pushDraws` must be empty before push is allowed
- Lead ID immutable after session start
- `threatPoolAdded` flag prevents double-insertion

## Common Pitfalls

1. **Button message edit** — use `interaction.message.edit()`, not `interaction.editReply()`
   (editReply edits the deferred response, not the original button message)
2. **Tratto-Segnato** — polarity is `'uncertain'` at draw time; coin flip runs at session end via `resolveUncertainDraws()`, not at draw time
3. **Session look-up** — always by `channelId`, never by `sessionId`
4. **Dire Consequences** — only triggered by `pushDraws`, not `baseDraws`
5. **ESM imports** — always use `.js` extension even for `.ts` source files
