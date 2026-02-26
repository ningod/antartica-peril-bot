# Code Style Rules

These rules are automatically loaded at every session start.

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
