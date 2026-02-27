# Bug-Fix Rules

These rules are automatically loaded at every session start.

## Test-First Bug Fix Workflow

Every request that involves fixing a bug or resolving a problem MUST follow this sequence:

1. **Reproduce first** — write one or more failing tests that demonstrate the bug
   *before* touching the production code. The tests must fail for the right reason
   (i.e. they expose the defective behaviour, not an unrelated error).
2. **Fix** — apply the minimal change to production code that makes the failing tests
   pass without breaking any previously passing test.
3. **Verify** — run the full suite and confirm that:
   - The new tests now pass.
   - No previously passing test has regressed.
   ```
   npm test && npm run lint && npm run typecheck && npm run build
   ```
4. **Never modify a test to make it pass** — if a test still fails after the fix,
   diagnose the root cause and fix the production code further. Weakening or deleting
   a test to achieve a green suite is forbidden.

## Modifying Existing Tests

Existing tests represent a contract: they document the expected behaviour of the system
at the time they were written.

**Before modifying the behaviour of any existing test, explicit user permission MUST
be requested**, with a clear explanation of:

- Which test(s) would be changed and why.
- What behaviour the current test asserts.
- Why that assertion is no longer correct or needs to change.
- What the new assertion would be.

Acceptable reasons to modify an existing test (with permission):
- The feature the test covers has intentionally changed (e.g. a deliberate behaviour
  change requested by the user).
- The test was itself incorrect (wrong expectation, wrong setup) and the bug is in
  the test, not the production code — this must be demonstrated clearly.

Never acceptable:
- Changing a test solely to make it pass after a production code change.
- Relaxing assertions (e.g. removing an `.toBe()` check, changing expected values)
  without user approval.
- Deleting tests to reduce the failure count.
