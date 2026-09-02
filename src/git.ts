import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Matches the trailing owner/repo of both SSH (git@host:owner/repo.git) and
// HTTPS (https://host/owner/repo) remotes. The optional .git suffix is stripped,
// but a repo name that merely contains dots (owner/repo.js) keeps them.
const REMOTE_URL_PATTERN = /(?:[:/])([^/:]+)\/([^/]+?)(?:\.git)?$/;

export function parseRepoFullName(remoteUrl: string): string | null {
  const match = REMOTE_URL_PATTERN.exec(remoteUrl.trim());
  if (!match) {
    return null;
  }
  const [, owner, repo] = match;
  return `${owner}/${repo}`;
}

// Returns null when git is unavailable, the cwd is not a repository, or origin has no URL.
export async function detectRepoFullName(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
    return parseRepoFullName(stdout);
  } catch {
    return null;
  }
}
