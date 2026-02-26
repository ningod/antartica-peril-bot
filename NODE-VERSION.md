# Node.js Version Management

This document lists every place where the Node.js version is referenced in the project
and explains how to update them when a new version is adopted.

## Source of truth

| File               | Field      | Current value |
| ------------------ | ---------- | ------------- |
| [`.nvmrc`](.nvmrc) | plain text | `22.22.0`     |

**`.nvmrc` is the canonical source of truth.** All other references must be kept in sync
with it every time the version is bumped.

---

## Files to update

### 1. `.nvmrc`

The version pin used by `nvm use` and `nvm install`.
Edit the single line to the new `<major>.<minor>.<patch>` string.

```
22.22.0
```

---

### 2. `Dockerfile`

```dockerfile
ARG NODE_VERSION=22.22.0   # ← update here
FROM node:${NODE_VERSION}-slim AS base
```

The `ARG` value is the Docker image tag fetched from Docker Hub (`node:<version>-slim`).
It must be a full semver string (`major.minor.patch`).

> The Dockerfile intentionally does **not** read `.nvmrc` at build time so that the Docker
> image is fully self-contained and reproducible without the project source tree.

---

### 3. `package.json` — `engines` field

```json
"engines": {
  "node": ">=22.22.0"
}
```

This declares the minimum supported runtime to package managers and hosting platforms.
Update the lower bound to match `.nvmrc` whenever the project drops support for older
patch/minor releases.

---

### 4. `package.json` — `@types/node` dev dependency

```json
"@types/node": "^22.13.5"
```

The major version (`22`) must match the Node.js major.
The `^` range means npm will automatically resolve to the highest compatible patch, so a
minor-version bump inside the same major only requires updating `package-lock.json`
(`npm install`). A **major** Node.js upgrade (e.g. 22 → 24) requires changing both this
and all entries below.

---

### 5. `README.md` — prerequisites text

Appears twice (English section and Italian section):

```
Node.js 22+
```

This is a human-readable minimum, not a pinned version. Update the **major** number only
when the minimum supported major changes.

---

### 6. `.github/workflows/ci.yml` — test matrix

```yaml
node-version: ['22']
```

This matrix tests across LTS major versions for backwards-compatibility coverage.
It uses major-only strings so GitHub Actions automatically resolves them to the latest
available patch for each major — **no manual update is needed on a patch bump**.

Update this list only when:

- a new LTS major is added to the support matrix, or
- an old LTS major is dropped.

The `if: matrix.node-version == '22'` condition on the coverage-upload step must also be
updated if the canonical major changes.

---

### 7. `.github/workflows/ci.yml` and `.github/workflows/release.yml` — `node-version-file`

```yaml
node-version-file: '.nvmrc'
```

These jobs already read the version directly from `.nvmrc` — **no manual update needed**.

---

## Checklist for a version bump

When moving from one Node.js version to another (e.g. `22.22.0` → `24.x.y`):

- [ ] Edit `.nvmrc` — new `<major>.<minor>.<patch>`
- [ ] Edit `Dockerfile` — `ARG NODE_VERSION=<major>.<minor>.<patch>`
- [ ] Edit `package.json` `engines.node` — `>=<major>.<minor>.<patch>`
- [ ] Edit `package.json` `@types/node` — bump major if Node.js major changed
- [ ] Run `npm install` to update `package-lock.json`
- [ ] Edit `README.md` (×2) — update `Node.js <major>+` if major changed
- [ ] Edit `.github/workflows/ci.yml` test matrix — add/remove major versions as needed
- [ ] Run `npm test && npm run lint && npm run typecheck && npm run build` to verify
