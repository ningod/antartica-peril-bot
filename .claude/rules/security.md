# Security Rules

These rules are automatically loaded at every session start.

## Critical — Never Violate

1. **Randomness**: ONLY `crypto.randomInt()` from `node:crypto`. NEVER `Math.random()`.
2. **Logging**: NEVER log label text, objective text, or any user-provided content.
   Only metadata (user IDs, counts, event names).
3. **Mentions**: ALWAYS include `allowedMentions: { parse: [] }` in every Discord response.
   ALWAYS call `sanitizeText()` on all user-provided text before storage/display.
4. **Authorization**:
   - Guide-only actions: verify `interaction.user.id === session.guideId` before executing.
   - Push buttons: reject non-Guide users with ephemeral error.
5. **Secrets**: NEVER hardcode tokens, keys, or credentials. All via env vars / `dotenv`.
6. **HTTP mode**: Ed25519 signature MUST be verified before processing any interaction.
7. **Rate limiting**: Check `limiter.consume()` before draw/superarsi operations.

## Security Checklist Before Any Commit

- [ ] No `Math.random()` anywhere in src/
- [ ] All user text through `sanitizeText()`
- [ ] `allowedMentions: { parse: [] }` on all responses
- [ ] Guide check present on all Guide-only paths
- [ ] No session content in log output
- [ ] No secrets in source or config files
