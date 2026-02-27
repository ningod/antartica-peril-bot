# Testing Rules

These rules are automatically loaded at every session start.

## Mandatory Tests for New Features

Every request that introduces a **new feature** — meaning any addition of user-visible
behaviour, a new command, subcommand, button/select/modal flow, domain function, or
storage operation — MUST be accompanied by tests that validate its correct implementation.

### What counts as a new feature

- New slash command or subcommand
- New button, select menu, or modal flow
- New domain function (e.g. a new algorithm or computation in `src/lib/domain.ts`)
- New store operation or session field that changes observable behaviour
- New embed or user-facing message path (when it results from new control flow)
- New idempotency guard, rate-limit rule, or authorization check

### What does NOT require new tests

- Pure documentation changes (ARCHITECTURE.md, CLAUDE.md, comments)
- Refactoring that preserves existing behaviour already covered by tests
- Dependency upgrades (unless behaviour changes)
- Adding or updating translations for keys already exercised by existing tests

## Test Requirements

1. **Location**: `tests/*.test.ts`, using Vitest (`describe` / `it` structure).
2. **Scope**: each new exported function or handler must have at least one test file
   or test block dedicated to it.
3. **Coverage targets** (per feature):
   - Happy path: feature works as expected under normal conditions.
   - Guard / error path: feature rejects invalid state (wrong user, missing session,
     already-used flag, etc.).
   - Edge cases: empty inputs, boundary values, count mismatches, etc.
4. **No mocking of crypto unless necessary**: use `vi.spyOn(crypto, 'randomInt')` only
   when deterministic randomness is required (e.g. tratto-segnato flip tests).
5. Tests must pass `npm test` without modification to production code after being written.

## Workflow

1. Write tests **alongside** the implementation (not after).
2. Run the full suite before declaring the task done:
   ```
   npm test && npm run lint && npm run typecheck && npm run build
   ```
3. All failures must be fixed before the task is considered complete.
4. If a test reveals a bug in the implementation, fix the implementation — never weaken
   the test to make it pass.
