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

const SOURCE_LABELS: Record<TokenSource, string> = {
  env: 'GITHUB_TOKEN',
  gh: 'the GitHub CLI',
};

export function describeTokenSource(source: TokenSource): string {
  return SOURCE_LABELS[source];
}

const AUTH_OPTIONS = [
  "  • Set GITHUB_TOKEN in your .env file (a PAT with the 'repo' scope), or",
  "  • Log in with the GitHub CLI: `gh auth login` (needs the 'repo' scope).",
];

function buildAuthErrorMessage(rejected: TokenSource[]): string {
  if (rejected.length === 0) {
    return ['No GitHub token found. Authenticate using either:', ...AUTH_OPTIONS].join('\n');
  }

  const sources = rejected.map(describeTokenSource).join(' and ');
  return [
    `GitHub rejected every token available (${sources}). Authenticate with a working credential:`,
    ...AUTH_OPTIONS,
  ].join('\n');
}

export interface ResolveDeps {
  env?: NodeJS.ProcessEnv;
  getGhToken?: () => Promise<string | null>;
  // Decides whether a candidate is usable. A candidate that fails is skipped in favour of
  // the next source, so one expired credential does not strand a working one.
  validate?: (candidate: ResolvedToken) => Promise<boolean>;
}

// Returns the gh CLI's token, or null if gh is missing (ENOENT) or not logged in (non-zero exit).
async function defaultGetGhToken(): Promise<string | null> {
  // gh prefers GITHUB_TOKEN/GH_TOKEN over the credential it stores and echoes them straight
  // back, so they are withheld from the child to reach the stored login. Without this the
  // gh fallback returns the same token it is meant to replace.
  const { GITHUB_TOKEN, GH_TOKEN, ...childEnv } = process.env;

  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { env: childEnv });
    const token = stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function resolveGitHubToken(deps: ResolveDeps = {}): Promise<ResolvedToken> {
  const env = deps.env ?? process.env;
  const getGhToken = deps.getGhToken ?? defaultGetGhToken;
  const validate = deps.validate ?? (async () => true);

  // Sources are read in order and only as far as needed, so gh is never invoked while
  // GITHUB_TOKEN is present and accepted.
  const sources: { source: TokenSource; read: () => Promise<string | null> }[] = [
    { source: 'env', read: async () => env.GITHUB_TOKEN?.trim() || null },
    { source: 'gh', read: getGhToken },
  ];

  const rejected: TokenSource[] = [];

  for (const { source, read } of sources) {
    const token = await read();
    if (!token) {
      continue;
    }

    const candidate: ResolvedToken = { token, source };
    if (await validate(candidate)) {
      return candidate;
    }
    rejected.push(source);
  }

  throw new AuthError(buildAuthErrorMessage(rejected));
}
