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

- A GitHub token is resolved by `src/auth.ts::resolveGitHubToken()` in priority order:
  `GITHUB_TOKEN` env (a PAT with `repo` scope, typically in `.env`) → `gh auth token` (the GitHub CLI,
  if installed and logged in) → an `AuthError`. So `GITHUB_TOKEN` is optional when `gh` is authenticated.
  `main()` primes auth up front via `getOctokit()` so the `AuthError` guidance prints and the process
  exits non-zero for every action.
- `REPO_FULL_NAME` (optional) pre-fills the `owner/repo` prompt.

## Architecture

The flow is a thin layered pipeline; `src/index.ts::main()` is the orchestrator and branches on one of
three `action`s (`copy` | `diff` | `export`):

- **`userInput.ts`** — all `prompts`-based interaction. `getInitialUserInput()` returns a `UserInputs`
  object; the remaining exports are per-step prompt helpers (`getFilePath`, `getSourceEnvName`,
  `getSecretValue`, source-choice pickers) that the manager modules call mid-flow.
- **`auth.ts`** — token resolution only. `resolveGitHubToken()` returns `{ token, source: 'env' | 'gh' }`
  or throws `AuthError`; `env`/`getGhToken` are injectable for testing. The `gh` path shells out to
  `gh auth token` and treats gh-missing/not-logged-in as "unavailable" (falls through, never errors).
- **`githubService.ts`** — the **only** module that constructs `Octokit` and touches the GitHub API
  (`getEnvironment`, `createEnvironment`, `list/createOrUpdate` for variables & secrets, public-key
  fetch). Octokit is built **lazily** via the exported, memoized `getOctokit()` (which calls
  `resolveGitHubToken()`) — no import-time side effects. Throwing paths funnel through
  `handleOctokitError`; `getEnvironment` returns `null` on 404, and `createOrUpdate{Variable,Secret}`
  intentionally log-and-continue (do **not** throw).
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

- **ESM project** (`"type": "module"`, `moduleResolution: bundler`). Relative imports **must** end in
  `.js` (even though the source is `.ts`) — e.g. `import { resolveGitHubToken } from './auth.js'`.
- Biome config: single quotes, trailing commas, 120-char width, space indent. `noForEach` is disabled.
  Note `pnpm lint` (`biome lint`) does **not** enforce quote style — that's a formatter rule; run
  `pnpm format` to normalize. Most existing files predate the single-quote config and use double quotes.
- `userInput.ts::offerTokenCreationGuidance()` is currently **exported but unreferenced** — it was the
  old interactive "no token → walk me through creating a PAT" flow, orphaned when auth moved to
  `auth.ts`. Delete it or re-wire it into the `AuthError` path.
- User-facing status uses emoji `console.log` (✅ ❌ ℹ️ 🎉) — keep that style for consistency.

## Releases

Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml`, which builds and `pnpm publish`es to npm
(needs `NPM_ACCESS_TOKEN`) and creates a GitHub Release. Bump `package.json` `version` before tagging.
