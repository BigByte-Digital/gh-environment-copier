import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as dotenvParse } from 'dotenv';

export interface EnvFileCandidate {
  path: string;
  relPath: string;
  entryCount: number;
  depth: number;
}

// Grandchildren of the root are still reachable (apps/api/.env), deeper is not.
const MAX_DEPTH = 2;

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'tmp']);

// Counting entries means parsing the file, so an oversized match is listed without a count
// rather than pulled into memory.
const MAX_PARSE_BYTES = 512 * 1024;

function isEnvFile(name: string): boolean {
  return name === '.env' || name.startsWith('.env.') || name.endsWith('.env');
}

function isSkippedDirectory(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRECTORIES.has(name);
}

async function countEntries(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_PARSE_BYTES) {
      return 0;
    }
    const contents = await fs.readFile(filePath, { encoding: 'utf8' });
    return Object.keys(dotenvParse(contents)).length;
  } catch {
    return 0;
  }
}

async function walk(dir: string, root: string, depth: number, found: EnvFileCandidate[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // An unreadable directory is skipped, not fatal to the scan.
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (depth >= MAX_DEPTH || isSkippedDirectory(entry.name)) {
        continue;
      }
      await walk(fullPath, root, depth + 1, found);
      continue;
    }

    if (entry.isFile() && isEnvFile(entry.name)) {
      found.push({
        path: fullPath,
        relPath: path.relative(root, fullPath) || entry.name,
        entryCount: await countEntries(fullPath),
        depth,
      });
    }
  }
}

export async function findEnvFiles(root: string): Promise<EnvFileCandidate[]> {
  const found: EnvFileCandidate[] = [];
  await walk(root, root, 0, found);
  return found.sort((a, b) => a.depth - b.depth || a.relPath.localeCompare(b.relPath));
}
