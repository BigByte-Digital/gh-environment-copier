# Optional `gh` CLI auth + cleanup/hardening — Design

**Date:** 2026-07-07
**Status:** Approved (pending spec review)

## Problem

The tool authenticates to GitHub only via a `GITHUB_TOKEN` PAT read from `.env`. Users must
hand-create and store a long-lived PAT. Many developers already have the GitHub CLI (`gh`)
authenticated via its OAuth device flow. We want to let the tool reuse that existing auth
**optionally**, without removing PAT support, and clean up some accumulated rough edges while we
are in this code.

## Goals

- Add a token-resolution layer so a token can come from the environment **or** the `gh` CLI.
- Keep `GITHUB_TOKEN` working exactly as today (highest priority, no behavior change).
- Remove the import-time side effects in `githubService.ts` that block testing and centralize
  error handling.
- Light cleanup + hardening of existing code.

## Non-goals

- **No built-in OAuth device flow.** Explicitly out of scope (no `@octokit/auth-oauth-device`
  dependency, no OAuth App registration, no `client_id`, no on-disk token cache).
- No new test framework. CI stays lint + build.
- No broader refactor beyond the listed cleanup items.

## Approach

### 1. Token resolver — `src/auth.ts` (new)

Single responsibility: produce a usable GitHub token, or fail with actionable guidance.

```ts
export type TokenSource = 'env' | 'gh';
export interface ResolvedToken { token: string; source: TokenSource; }

export async function resolveGitHubToken(): Promise<ResolvedToken>;
```

Resolution order:

| # | Source | Detection | On unavailable |
|---|--------|-----------|----------------|
| 1 | `GITHUB_TOKEN` env | `process.env.GITHUB_TOKEN` non-empty | fall through |
| 2 | GitHub CLI | run `gh auth token`, capture stdout | fall through |
| — | none | — | throw `AuthError` with guidance |

**`gh` detection details:**
- Spawn `gh auth token` (via `node:child_process`), trim stdout.
- `ENOENT` (gh not installed) → treated as unavailable, fall through silently.
- Non-zero exit / empty stdout (gh installed but not logged in) → unavailable, fall through.
- Only a non-empty token on exit code 0 counts as success. `source: 'gh'`.

**Failure message** (when nothing resolves) names both options concretely:
> No GitHub token found. Either set `GITHUB_TOKEN` in your `.env`, or authenticate the GitHub
> CLI with `gh auth login` (needs the `repo` scope).

**Testability seam:** the env lookup and the command runner are injected (default to the real
`process.env` and a real `execFile` wrapper) so resolution order can be unit-tested later without
a framework change. Kept as simple function parameters with defaults — no DI framework.

### 2. `githubService.ts` — lazy init + shared error handling

Current code constructs `Octokit` at module load and calls `process.exit(1)` if the token is
missing. This is an import-time side effect that also blocks any test of the module.

Change to lazy, memoized initialization:

```ts
let octokitPromise: Promise<Octokit> | null = null;
async function getOctokit(): Promise<Octokit> {
  if (!octokitPromise) {
    octokitPromise = resolveGitHubToken().then(({ token }) => new Octokit({ auth: token }));
  }
  return octokitPromise;
}
```

Every exported function awaits `getOctokit()` instead of referencing a module-level `octokit`.
No `process.exit` at import time — failures surface as thrown `AuthError`s that `main()` reports.

Add a shared helper to replace the repeated try/catch/`console.error` blocks:

```ts
function handleOctokitError(context: string, error: unknown): never;
```

It formats the message consistently (preserving the existing "return `null` on 404" behavior in
`getEnvironment`, which stays a special case handled before this helper).

### 3. `main()` / startup

`main()` wraps the flow so a thrown `AuthError` prints its guidance and exits non-zero cleanly,
rather than an unhandled rejection. The one-time token resolution is triggered lazily by the first
API call, so the interactive prompts that don't need the API still run first (unchanged UX).

### 4. Cleanup + hardening

- Delete `src/index.js` (dead, unused CommonJS — real entry is `src/index.ts`).
- Normalize relative imports to consistent `.js` extensions across `src/`.
- Fill the empty `// biome-ignore … <explanation>` placeholders with real reasons.
- Replace `interface Secret extends Variable {}` with `type Secret = Variable`.
- Replace stray `any` in `types.ts` (`protection_rules`, `deployment_branch_policy`,
  `OctokitError.response.data`) with `unknown` or minimal shapes.
- Set `package.json` `author` to `BigByte Digital`.

### 5. Docs

- README: replace the PAT-only auth section with "Authentication" covering (a) `GITHUB_TOKEN` in
  `.env` and (b) `gh auth login` reuse, noting the resolution priority.
- `.env.example`: keep `GITHUB_TOKEN`, add a comment that it is optional when `gh` is
  authenticated.

## Data flow

```
main()
  └─ getInitialUserInput()            (prompts; no token needed yet)
  └─ first githubService call
       └─ getOctokit()
            └─ resolveGitHubToken()   env → gh → AuthError
       └─ Octokit request …
```

## Error handling

- `AuthError` (thrown by resolver): caught at `main()` top level → print guidance, exit 1.
- `gh` unavailable/not-logged-in: not an error — silently falls through to the next source.
- Octokit 404 in `getEnvironment`: unchanged (`return null`).
- Other Octokit errors: routed through `handleOctokitError` for consistent reporting.

## Testing / verification

- No test framework added. `auth.ts` is written with injectable seams so it *can* be unit-tested
  later.
- Verify with `pnpm ts` (type-check) and `pnpm lint`.
- Manual runs: (a) `GITHUB_TOKEN` set → uses it; (b) unset + `gh` logged in → uses gh token;
  (c) unset + no gh → clean guidance error.

## Out-of-code follow-ups

- None. (Device flow's OAuth App registration is out of scope.)
