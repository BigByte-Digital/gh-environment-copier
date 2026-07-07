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
