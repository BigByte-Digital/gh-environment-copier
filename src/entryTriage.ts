import * as readline from 'node:readline';
import type { Variable } from './types.js';

export type EntryKind = 'secret' | 'variable';

// Seeds each row. The guess is a starting point the operator corrects, never a decision:
// names like AUTH_COGNITO_REFRESH_TOKEN_ENDPOINT match while holding nothing sensitive.
const SECRET_NAME_PATTERN =
  /(SECRET|PASSWORD|PASSWD|PASSPHRASE|TOKEN|API_?KEY|_KEY$|_KEY_|CREDENTIAL|PRIVATE|SALT|SIGNING|DSN)/i;

export function guessKind(name: string): EntryKind {
  return SECRET_NAME_PATTERN.test(name) ? 'secret' : 'variable';
}

const VIEWPORT = 12;

const HIDE_CURSOR = '\u001b[?25l';
const SHOW_CURSOR = '\u001b[?25h';

const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

// Deliberately different silhouettes rather than the two padlock glyphs, which are the same
// shape at terminal sizes. Both are default-emoji and double width, so the rows stay aligned.
const SECRET_ICON = '\u{1F512}';
const VARIABLE_ICON = '\u{1F4C4}';

interface Row {
  name: string;
  kind: EntryKind;
}

function buildLines(rows: Row[], cursor: number, offset: number): string[] {
  const lines = ['  Mark each key   ↑↓ move   s secret   v variable   ⏎ apply   esc cancel', ''];

  const visible = rows.slice(offset, offset + VIEWPORT);
  visible.forEach((row, index) => {
    const isCursor = offset + index === cursor;
    const isSecret = row.kind === 'secret';
    const icon = isSecret ? SECRET_ICON : VARIABLE_ICON;
    const marker = isSecret ? `${YELLOW}s${RESET}` : `${DIM}v${RESET}`;
    lines.push(`${isCursor ? '❯' : ' '} ${icon} ${marker}  ${row.name}`);
  });

  const remaining = rows.length - (offset + visible.length);
  if (remaining > 0) {
    lines.push(`      … ${remaining} more`);
  }

  const secrets = rows.filter((row) => row.kind === 'secret').length;
  lines.push('', `  ${secrets} secrets · ${rows.length - secrets} variables`);

  return lines;
}

// Resolves to the chosen classification, or null when the operator cancels. Requires a TTY;
// callers check process.stdin.isTTY first, because guessing on an operator's behalf is
// exactly what this screen exists to prevent.
export function triageEntries(entries: Variable[]): Promise<Map<string, EntryKind> | null> {
  const rows: Row[] = entries.map((entry) => ({ name: entry.name, kind: guessKind(entry.name) }));
  const output = process.stdout;

  let cursor = 0;
  let offset = 0;
  let painted = 0;

  const paint = () => {
    if (painted > 0) {
      readline.moveCursor(output, 0, -painted);
      readline.clearScreenDown(output);
    }
    const lines = buildLines(rows, cursor, offset);
    output.write(`${lines.join('\n')}\n`);
    painted = lines.length;
  };

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    output.write(HIDE_CURSOR);

    const finish = (result: Map<string, EntryKind> | null) => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      output.write(SHOW_CURSOR);
      resolve(result);
    };

    function onKeypress(_input: string, key: readline.Key): void {
      switch (key.name) {
        case 'up':
          cursor = Math.max(0, cursor - 1);
          break;
        case 'down':
          cursor = Math.min(rows.length - 1, cursor + 1);
          break;
        case 's':
        case 'v':
          rows[cursor].kind = key.name === 's' ? 'secret' : 'variable';
          cursor = Math.min(rows.length - 1, cursor + 1);
          break;
        case 'return':
          finish(new Map(rows.map((row) => [row.name, row.kind])));
          return;
        case 'escape':
          finish(null);
          return;
        case 'c':
          if (key.ctrl) {
            finish(null);
            return;
          }
          return;
        default:
          return;
      }

      if (cursor < offset) {
        offset = cursor;
      } else if (cursor >= offset + VIEWPORT) {
        offset = cursor - VIEWPORT + 1;
      }
      paint();
    }

    process.stdin.on('keypress', onKeypress);
    paint();
  });
}
