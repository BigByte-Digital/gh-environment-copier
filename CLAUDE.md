# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An interactive CLI (published to npm as `@bigbyte-digital/gh-env-cleaner`) that copies GitHub Actions
**variables** and **secrets** between environments, imports them from local `.env` files, diffs two
environments, or exports one to a file. It talks to the GitHub REST API and encrypts secret values
client-side before upload.

## Commands

```bash
pnpm start          # run the CLI (tsx src/index.ts) — no build step needed for dev
pnpm build          # tsc → dist/
pnpm lint           # biome lint ./src
pnpm lint:fix       # biome lint --write (also fails on warnings)
pnpm format         # biome format --write ./src
pnpm ts             # tsc --noEmit type-check (use this to verify a change compiles)
```

There is **no test suite** (`pnpm test` is a stub that exits 1). CI (`.github/workflows/ci.yml`) only
runs `pnpm lint` + `pnpm build` on pushes/PRs to `main`, so keep both green.

## Runtime requirements

- `GITHUB_TOKEN` must be set (in `.env`) — a PAT with `repo` scope. `githubService.ts` calls
  `process.exit(1)` at import time if it's missing.
- `REPO_FULL_NAME` (optional) pre-fills the `owner/repo` prompt.

## Architecture

The flow is a thin layered pipeline; `src/index.ts::main()` is the orchestrator and branches on one of
three `action`s (`copy` | `diff` | `export`):

- **`userInput.ts`** — all `prompts`-based interaction. `getInitialUserInput()` returns a `UserInputs`
  object; the remaining exports are per-step prompt helpers (`getFilePath`, `getSourceEnvName`,
  `getSecretValue`, source-choice pickers) that the manager modules call mid-flow.
- **`githubService.ts`** — the **only** module that constructs `Octokit` and touches the GitHub API
  (`getEnvironment`, `createEnvironment`, `list/createOrUpdate` for variables & secrets, public-key
  fetch). Everything else goes through it. `getEnvironment` returns `null` on 404 (a valid "not found"),
  but re-throws other errors.
- **`variablesManager.ts` / `secretsManager.ts`** — resolve the chosen source (`env` GitHub environment,
  local `file`, or `skip`), then create/update entries in the target env. Secrets copied from another
  environment carry **names only** — the tool re-prompts for each value (GitHub never exposes secret
  values). Values from a `.env` file are used directly.
- **`encryptionUtils.ts`** — `encryptSecret()` seals a value with the target environment's public key via
  `libsodium-wrappers` (`crypto_box_seal`). Every secret is encrypted here before it reaches the API.
- **`environmentSetup.ts`** — `ensureTargetEnvExists` (create-if-missing), public-key fetching, and
  `exportEnvironmentToFile`.
- **`diffManager.ts`** — `performEnvDiff` (fetches both envs' vars + secret names in parallel) and
  `displayDiffResultsConsole`. Diffs variable values but only secret *names*.
- **`fileUtils.ts`** — `parseEnvFile` wraps `dotenv.parse`; returns `null` on missing/unreadable file.
- **`types.ts`** — shared interfaces (`UserInputs`, `Variable`, `Secret`, `DiffResults`, etc.).

## Conventions & gotchas

- **ESM project** (`"type": "module"`, `moduleResolution: bundler`). Relative imports are written with
  explicit `.js` extensions in some files and without in others — both currently resolve under `tsx`/
  bundler resolution, but match the neighboring file when editing.
- Biome config: single quotes, trailing commas, 120-char width, space indent. `noForEach` is disabled.
  Run `pnpm format` / `pnpm lint:fix` before committing.
- **`src/index.js` is a stale, unused CommonJS artifact** (older code, `require(...)`, no diff/export).
  Nothing imports it — the real entry is `src/index.ts`. Don't edit it; consider it dead.
- User-facing status uses emoji `console.log` (✅ ❌ ℹ️ 🎉) — keep that style for consistency.

## Releases

Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml`, which builds and `pnpm publish`es to npm
(needs `NPM_ACCESS_TOKEN`) and creates a GitHub Release. Bump `package.json` `version` before tagging.
