# Optional `gh` CLI Auth + Cleanup/Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the CLI reuse a GitHub token from the `gh` CLI when `GITHUB_TOKEN` is unset, keeping PAT support unchanged, and clean up accumulated rough edges.

**Architecture:** A new `src/auth.ts` resolves a token from `GITHUB_TOKEN` → `gh auth token` → an `AuthError`. `src/githubService.ts` stops constructing Octokit at import time and instead builds it lazily via that resolver, with a shared error-logging helper. `main()` reports `AuthError` cleanly.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), `@octokit/rest`, `prompts`, Biome, run via `tsx`. **No new dependencies.**

## Global Constraints

- ESM project: every relative import MUST end in `.js` (e.g. `./auth.js`), even though the source file is `.ts`.
- **No new runtime or dev dependencies.** No `@octokit/auth-oauth-device`, no device flow, no OAuth App, no on-disk token cache.
- **No test framework exists and none is added.** CI (`.github/workflows/ci.yml`) runs only `pnpm lint` + `pnpm build`. Verification in this plan uses `pnpm ts` (type-check), `pnpm lint`, and `tsx` one-liner checks — not a test runner.
- Biome formatting: single quotes, trailing commas, 120-char width, 2-space indent. Run `pnpm format` before committing if lint complains about style.
- Preserve existing behavior: `getEnvironment` returns `null` on HTTP 404; `createOrUpdateVariable` and `createOrUpdateSecret` log-and-continue (they do NOT throw).
- `GITHUB_TOKEN` env var always takes priority over `gh` (least-surprising default).

## File Structure

- `src/auth.ts` — **new.** Token resolution only. Exports `resolveGitHubToken()`, `AuthError`, and the `ResolvedToken`/`TokenSource` types. Injectable env + gh-runner seams for testability.
- `src/githubService.ts` — **modify.** Lazy memoized Octokit via the resolver; shared `handleOctokitError` helper; no import-time side effects.
- `src/types.ts` — **modify.** Replace `any` with `unknown`/minimal shapes; `Secret` becomes a type alias; drop now-unneeded biome-ignores.
- `src/index.ts` — **modify.** `.js` imports; catch `AuthError` and exit non-zero cleanly; drop the `err as any` biome-ignore.
- `src/environmentSetup.ts` — **modify.** `.js` on the two local imports.
- `src/index.js` — **delete.** Dead CommonJS artifact.
- `package.json` — **modify.** Set `author`.
- `README.md` — **modify.** Document the two auth methods.
- `.env.example` — **modify** (best-effort; see note in Task 4).

---

### Task 1: Cleanup & type hardening (no behavior change)

Mechanical hygiene with zero runtime behavior change. Isolated from `index.ts` (handled in Task 4).

**Files:**
- Modify: `src/types.ts` (lines 9-12, 20-26, 33)
- Modify: `src/environmentSetup.ts:7-8`
- Modify: `package.json` (`author` field)
- Delete: `src/index.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Secret = Variable`; `OctokitError.response?.data?: unknown` — relied on by Tasks 3 and 4.

- [ ] **Step 1: Harden `src/types.ts`**

Replace lines 9-13 (the `protection_rules`/`deployment_branch_policy` fields with their biome-ignores):

```ts
  protection_rules?: unknown[];
  deployment_branch_policy?: unknown;
}
```

Replace the `OctokitError` interface (lines 20-26):

```ts
export interface OctokitError extends Error {
  status?: number;
  response?: {
    data?: unknown;
  };
}
```

Replace line 33:

```ts
export type Secret = Variable;
```

- [ ] **Step 2: Add `.js` to local imports in `src/environmentSetup.ts`**

Change line 7 `from "./githubService"` → `from "./githubService.js"` and line 8 `from "./types"` → `from "./types.js"`.

- [ ] **Step 3: Set `author` in `package.json`**

Change `"author": "",` to `"author": "BigByte Digital",`.

- [ ] **Step 4: Delete the dead CommonJS file**

```bash
git rm src/index.js
```

- [ ] **Step 5: Verify type-check and lint pass**

Run: `pnpm ts && pnpm lint`
Expected: both exit 0, no errors. (If Biome reports formatting nits, run `pnpm format` and re-run.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: type hardening and dead-code cleanup"
```

---

### Task 2: Token resolver — `src/auth.ts`

**Files:**
- Create: `src/auth.ts`

**Interfaces:**
- Consumes: nothing (uses `node:child_process`, `node:util`, `process.env`).
- Produces:
  - `type TokenSource = 'env' | 'gh'`
  - `interface ResolvedToken { token: string; source: TokenSource }`
  - `class AuthError extends Error`
  - `function resolveGitHubToken(deps?: ResolveDeps): Promise<ResolvedToken>`
  - `interface ResolveDeps { env?: NodeJS.ProcessEnv; getGhToken?: () => Promise<string | null> }`

- [ ] **Step 1: Write `src/auth.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type TokenSource = 'env' | 'gh';

export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const NO_TOKEN_MESSAGE = [
  'No GitHub token found. Authenticate using either:',
  "  • Set GITHUB_TOKEN in your .env file (a PAT with the 'repo' scope), or",
  "  • Log in with the GitHub CLI: `gh auth login` (needs the 'repo' scope).",
].join('\n');

export interface ResolveDeps {
  env?: NodeJS.ProcessEnv;
  getGhToken?: () => Promise<string | null>;
}

// Returns the gh CLI's token, or null if gh is missing (ENOENT) or not logged in (non-zero exit).
async function defaultGetGhToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token']);
    const token = stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function resolveGitHubToken(deps: ResolveDeps = {}): Promise<ResolvedToken> {
  const env = deps.env ?? process.env;
  const getGhToken = deps.getGhToken ?? defaultGetGhToken;

  const envToken = env.GITHUB_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  const ghToken = await getGhToken();
  if (ghToken) {
    return { token: ghToken, source: 'gh' };
  }

  throw new AuthError(NO_TOKEN_MESSAGE);
}
```

- [ ] **Step 2: Verify all three resolution branches with injected deps**

Run:

```bash
npx tsx -e '
import { resolveGitHubToken, AuthError } from "./src/auth.ts";
const a = await resolveGitHubToken({ env: { GITHUB_TOKEN: "pat123" }, getGhToken: async () => null });
if (!(a.source === "env" && a.token === "pat123")) throw new Error("env branch failed");
const b = await resolveGitHubToken({ env: {}, getGhToken: async () => "gh456" });
if (!(b.source === "gh" && b.token === "gh456")) throw new Error("gh branch failed");
let threw = false;
try { await resolveGitHubToken({ env: {}, getGhToken: async () => null }); }
catch (e) { threw = e instanceof AuthError; }
if (!threw) throw new Error("no-token did not throw AuthError");
console.log("auth.ts resolution order OK");
'
```

Expected: prints `auth.ts resolution order OK` and exits 0. (An assertion failure throws and exits non-zero.)

- [ ] **Step 3: Verify env-priority precedence explicitly**

Run:

```bash
npx tsx -e '
import { resolveGitHubToken } from "./src/auth.ts";
const r = await resolveGitHubToken({ env: { GITHUB_TOKEN: "envwins" }, getGhToken: async () => "ghtoken" });
if (r.source !== "env") throw new Error("expected env to win over gh");
console.log("env precedence OK");
'
```

Expected: prints `env precedence OK`.

- [ ] **Step 4: Type-check and lint**

Run: `pnpm ts && pnpm lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts
git commit -m "feat: add gh CLI token resolver"
```

---

### Task 3: Wire the resolver into `src/githubService.ts`

Replace import-time Octokit construction with lazy, memoized init, and DRY the throwing error paths.

**Files:**
- Modify: `src/githubService.ts` (full rewrite of the top; per-function edits below)

**Interfaces:**
- Consumes: `resolveGitHubToken` from `./auth.js`; `OctokitError` from `./types.js`.
- Produces: unchanged public function signatures (`getEnvironment`, `createEnvironment`, `listVariables`, `createOrUpdateVariable`, `listSecrets`, `createOrUpdateSecret`, `getEnvironmentPublicKey`).

- [ ] **Step 1: Replace the header (lines 1-18) with lazy init + shared helper**

```ts
import { Octokit } from '@octokit/rest';
import { resolveGitHubToken } from './auth.js';
import { encryptSecret } from './encryptionUtils.js';
import type { GitHubEnvironment, GitHubPublicKey, Variable, Secret, OctokitError } from './types.js';

let octokitPromise: Promise<Octokit> | null = null;

async function getOctokit(): Promise<Octokit> {
  if (!octokitPromise) {
    octokitPromise = resolveGitHubToken().then(({ token }) => new Octokit({ auth: token }));
  }
  return octokitPromise;
}

function handleOctokitError(context: string, error: unknown): never {
  const octokitError = error as OctokitError;
  console.error(`${context}:`, octokitError.message ?? String(error));
  throw octokitError;
}
```

- [ ] **Step 2: Update `getEnvironment` to fetch octokit lazily and use the helper**

Replace the body with:

```ts
export async function getEnvironment(
  owner: string,
  repo: string,
  environment_name: string,
): Promise<GitHubEnvironment | null> {
  try {
    const octokit = await getOctokit();
    const { data: environment } = await octokit.rest.repos.getEnvironment({ owner, repo, environment_name });
    return environment as GitHubEnvironment;
  } catch (error) {
    if ((error as OctokitError).status === 404) {
      return null; // Environment not found is a valid case
    }
    handleOctokitError(`Error getting environment '${environment_name}'`, error);
  }
}
```

- [ ] **Step 3: Update `createEnvironment`**

```ts
export async function createEnvironment(owner: string, repo: string, environment_name: string): Promise<void> {
  try {
    const octokit = await getOctokit();
    console.log(`Creating environment '${environment_name}'...`);
    await octokit.rest.repos.createOrUpdateEnvironment({ owner, repo, environment_name });
    console.log(`Environment '${environment_name}' created successfully.`);
  } catch (error) {
    handleOctokitError(`Error creating environment '${environment_name}'`, error);
  }
}
```

- [ ] **Step 4: Update `listVariables`**

```ts
export async function listVariables(owner: string, repo: string, environment_name: string): Promise<Variable[]> {
  try {
    const octokit = await getOctokit();
    const variables = await octokit.paginate(octokit.rest.actions.listEnvironmentVariables, {
      owner,
      repo,
      environment_name,
      per_page: 100,
    });
    return variables as Variable[];
  } catch (error) {
    handleOctokitError(`Error listing variables for environment '${environment_name}'`, error);
  }
}
```

- [ ] **Step 5: Update `createOrUpdateVariable`** (keep its log-and-continue behavior — do NOT use `handleOctokitError` here)

Add `const octokit = await getOctokit();` as the first line inside the outer `try` (before the `createEnvironmentVariable` call). Leave the rest of the function — including the "already exists" update fallback and its `console.error` calls — unchanged.

- [ ] **Step 6: Update `listSecrets`**

```ts
export async function listSecrets(owner: string, repo: string, environment_name: string): Promise<Secret[]> {
  try {
    const octokit = await getOctokit();
    const secrets = await octokit.paginate(octokit.rest.actions.listEnvironmentSecrets, {
      owner,
      repo,
      environment_name,
      per_page: 100,
    });
    return secrets.map((s) => ({ name: s.name, value: '' }));
  } catch (error) {
    handleOctokitError(`Error listing secrets for environment '${environment_name}'`, error);
  }
}
```

- [ ] **Step 7: Update `createOrUpdateSecret`** (keep its log-and-continue behavior)

Add `const octokit = await getOctokit();` as the first line inside the `try` (before the `encryptSecret` call is fine too, but placing it first is simplest). Leave the bespoke error logging (`octokitError.response?.data`, the PAT-scope hint) unchanged — it already works with `data?: unknown`.

- [ ] **Step 8: Update `getEnvironmentPublicKey`**

```ts
export async function getEnvironmentPublicKey(
  owner: string,
  repo: string,
  environment_name: string,
): Promise<GitHubPublicKey | null> {
  try {
    const octokit = await getOctokit();
    const { data } = await octokit.rest.actions.getEnvironmentPublicKey({ owner, repo, environment_name });
    return { key: data.key, key_id: data.key_id } as GitHubPublicKey;
  } catch (error) {
    handleOctokitError(`Error getting public key for environment '${environment_name}'`, error);
  }
}
```

- [ ] **Step 9: Type-check and lint**

Run: `pnpm ts && pnpm lint`
Expected: both exit 0. (The `never` return of `handleOctokitError` satisfies the "must return" checks in each function.)

- [ ] **Step 10: Integration check — real `gh` path, no token leak**

Requires `gh` logged in locally. Confirms lazy resolution reaches the gh token when `GITHUB_TOKEN` is empty:

```bash
GITHUB_TOKEN= npx tsx -e '
import { resolveGitHubToken } from "./src/auth.ts";
const r = await resolveGitHubToken();
console.log("resolved source:", r.source, "| token length:", r.token.length);
'
```

Expected: `resolved source: gh | token length: <n>` (n > 0). Prints only the source and length, never the token. (If `gh` is not logged in, expect the `AuthError` guidance instead — also acceptable.)

- [ ] **Step 11: Commit**

```bash
git add src/githubService.ts
git commit -m "feat: build Octokit lazily from resolved token"
```

---

### Task 4: `main()` error handling + docs

**Files:**
- Modify: `src/index.ts:2-14` (imports), `src/index.ts:153-166` (catch)
- Modify: `README.md`
- Modify: `.env.example` (best-effort)

**Interfaces:**
- Consumes: `AuthError` from `./auth.js`.
- Produces: nothing downstream.

- [ ] **Step 1: Normalize `src/index.ts` local imports to `.js` and import `AuthError`**

In the import block (lines 2-14), add `.js` to all five local imports: `./environmentSetup` → `./environmentSetup.js`, `./secretsManager` → `./secretsManager.js`, `./userInput` → `./userInput.js`, `./variablesManager` → `./variablesManager.js`, `./diffManager` → `./diffManager.js`. Then add this import directly below line 14:

```ts
import { AuthError } from './auth.js';
```

- [ ] **Step 2: Replace the `main().catch(...)` block (lines 153-166)**

```ts
main().catch((err) => {
  if (err instanceof AuthError) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }
  console.error('\nAn unexpected error occurred:', err.message);
  const apiErr = err as { response?: { data?: unknown } };
  if (apiErr.response?.data) {
    console.error('GitHub API Error:', JSON.stringify(apiErr.response.data, null, 2));
  }
  process.exit(1);
});
```

This removes the `// biome-ignore lint/suspicious/noExplicitAny` at old line 155 and makes the process exit non-zero on failure.

- [ ] **Step 3: Type-check and lint**

Run: `pnpm ts && pnpm lint`
Expected: both exit 0. Confirm the biome-ignore is gone:
Run: `grep -rn "biome-ignore" src/`
Expected: no output (all four placeholders removed across Tasks 1 and 4).

- [ ] **Step 4: Verify the no-token guidance end-to-end**

With no env token and `gh` forced unavailable via PATH, `main`'s first API call must surface the `AuthError` guidance and exit 1. Use the "diff" action which hits the API immediately after minimal prompts is still interactive, so instead verify the catch wiring directly:

```bash
GITHUB_TOKEN= npx tsx -e '
import { resolveGitHubToken, AuthError } from "./src/auth.ts";
try {
  await resolveGitHubToken({ env: {}, getGhToken: async () => null });
  console.log("FAIL: expected AuthError");
} catch (e) {
  if (e instanceof AuthError) { console.log("guidance:\n" + e.message); }
  else throw e;
}
'
```

Expected: prints the two-option guidance message (mentions both `GITHUB_TOKEN` and `gh auth login`).

- [ ] **Step 5: Update `README.md` — document both auth methods**

Immediately after the Setup section's step 3 (the `.env` / `GITHUB_TOKEN` block ending with the `.gitignore` note), insert:

```markdown

### Authentication options

The tool resolves a GitHub token in this order:

1. **`GITHUB_TOKEN`** in your `.env` file — a PAT with the `repo` scope (and `admin:org` if needed). Highest priority.
2. **GitHub CLI** — if `GITHUB_TOKEN` is not set and you have the [GitHub CLI](https://cli.github.com/) installed and logged in (`gh auth login`), the tool reuses its token automatically. No PAT required.

If neither is available, the tool prints guidance and exits.
```

- [ ] **Step 6: Update `.env.example`** (best-effort)

Add a comment above the `GITHUB_TOKEN` line noting it is optional when `gh` is authenticated:

```
# Optional: a PAT with the 'repo' scope. If omitted, the tool falls back to `gh auth token`.
GITHUB_TOKEN=your_github_pat_here
```

> Note: if the harness denies editing dotfiles (`.env.example` sits in a restricted path), skip this step and tell the user to apply the two-line change manually. It does not affect functionality.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts README.md .env.example
git commit -m "feat: report auth errors clearly and document gh auth"
```

---

## Self-Review

**Spec coverage:**
- Resolver `env → gh → error` — Task 2. ✅
- `GITHUB_TOKEN` unchanged & highest priority — Task 2 Step 3. ✅
- No import-time side effects; lazy Octokit — Task 3 Step 1. ✅
- Shared error handling — Task 3 `handleOctokitError`. ✅
- Delete `src/index.js` — Task 1 Step 4. ✅
- Consistent `.js` imports — Task 1 (environmentSetup) + Task 4 (index). ✅
- Fill/remove empty biome-ignores — Task 1 (types.ts ×3) + Task 4 (index.ts ×1), verified by grep in Task 4 Step 3. ✅
- `Secret` type alias — Task 1 Step 1. ✅
- `any` → `unknown`/minimal — Task 1 Step 1. ✅
- `package.json` author — Task 1 Step 3. ✅
- README + `.env.example` — Task 4 Steps 5-6. ✅
- No new deps / no device flow / no cache — honored throughout; Global Constraints. ✅
- No new test framework; verify via `pnpm ts`/`pnpm lint`/`tsx` — Global Constraints + every task's verify step. ✅

**Placeholder scan:** No TBD/TODO; all code shown in full; no "handle errors appropriately". ✅

**Type consistency:** `resolveGitHubToken`, `ResolvedToken`, `AuthError`, `TokenSource`, `ResolveDeps`, `getOctokit`, `handleOctokitError` are named identically everywhere they appear. `OctokitError.response?.data?: unknown` (Task 1) matches the `apiErr` shape used in Task 4 Step 2 and the existing `createOrUpdateSecret` usage. ✅
