# Code Style Rules

These rules are automatically loaded at every session start.

## Language Policy

- **Source code and comments**: always in English, regardless of the language used in the prompt or
  conversation. This applies to: identifiers, inline comments, JSDoc, commit messages, and any text
  that lives inside `.ts` / `.js` / `.json` / config files.
- **User-facing strings**: always kept multilingual via the `src/lib/i18n/` translation bundles.
  Every new user-facing string MUST be added to `Tr` in `types.ts` and implemented in both `it.ts`
  and `en.ts`. Hard-coding a user-facing string directly in source code is not allowed.

## TypeScript

- Strict mode always on — no `@ts-ignore` without explicit justification in a comment
- All imports use `.js` extensions (ESM requirement): `import { foo } from './lib/foo.js'`
- `const` over `let`, never `var`
- Explicit return types on all exported functions
- `interface` for object shapes; `type` for unions and type aliases
- No `any` — use proper types or `unknown` with narrowing

## Formatting

- 2-space indentation
- LF line endings
- Trailing newline at end of file
- Single quotes for strings
- Trailing commas in multi-line structures (ES5 style)
- 100 chars print width

## File Conventions

- Source files: `src/**/*.ts`
- Test files: `tests/**/*.test.ts`, Vitest framework
- All ESM imports must use `.js` suffix

## Embed Guidelines

- All embeds use `allowedMentions: { parse: [] }`
- Use `EmbedBuilder` from `discord.js`
- Import colors from `discord.js` Colors enum
- Polarity indication: ✨ for positive, 💀 for negative

## Test Guidelines

- Tests live in `tests/`, named `*.test.ts`
- Use `describe`/`it` structure
- Test each public function independently
- Mock `crypto.randomInt` for tratto-segnato flip tests
- Always test edge cases: empty bag, count > bag size, expired sessions

## Verification After Every Change

After completing any code modification, always run the full suite in this exact order:

```
npm test           # Vitest — all tests must pass
npm run lint       # ESLint — zero errors, zero warnings
npm run typecheck  # tsc --noEmit — zero type errors
npm run build      # tsc — must compile cleanly
```

All four commands must exit with code 0 before the work is considered done.
Never skip or reorder them; lint catches style issues that typecheck does not, and
typecheck catches type errors that lint does not.
