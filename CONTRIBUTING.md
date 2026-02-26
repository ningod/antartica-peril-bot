# Contributing

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm ci`
4. Copy `.env.example` to `.env` and fill in your credentials
5. Create a feature branch: `git checkout -b feature/my-feature`

## Development Workflow

Before submitting a PR:

```bash
npm test              # All tests must pass
npm run lint          # No lint errors
npm run format:check  # Code must be formatted
npm run typecheck     # No TypeScript errors
npm run build         # Must compile
```

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add X` — new feature
- `fix: correct Y` — bug fix
- `refactor: reorganize Z` — refactoring
- `docs: update README` — documentation
- `test: add tests for W` — tests
- `chore: update deps` — maintenance

## Pull Request Checklist

- [ ] Tests added for new functionality
- [ ] All checks pass (test, lint, typecheck, build)
- [ ] `CHANGELOG.md` updated
- [ ] No secrets committed
- [ ] Security checklist in PR template completed

## Game Rules

This bot is a mechanical support tool for the _Antartica_ TTRPG. Any changes to game mechanics
(label types, polarity rules, extraction logic) should reference the official game rules.

## Questions

Open a GitHub issue with the **question** label.
