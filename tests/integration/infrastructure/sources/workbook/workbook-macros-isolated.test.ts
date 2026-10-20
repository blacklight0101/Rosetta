import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import {
  buildCompound,
  directorySectors,
  type EntrySpec,
} from '../../../../support/hand-made-compound.js';
import { buildVbaProject } from '../../../../support/vba-project.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';

// RF-154: each file below is built to make `cfb`, left alone, use memory or time without end: a
// directory that loops, 16,000 nested storages, a chain read against the file order, and 2,000
// streams that start inside one long chain. They are read in a child process with a 256 MB heap and
// a time limit, so a missing guard shows as a dead or stuck child, never as a dead test run.

const root = useWritableTempRoot('rosetta-macros-isolated-');
const CHILD = 'tests/support/read-project-child.ts';
const SECTOR = 512;

interface Outcome {
  /** The exit code of the child; absent when it was killed. */
  readonly code: number;
  readonly state: string;
  readonly reason: string;
}

const run = promisify(execFile);

async function readIsolated(bytes: Buffer): Promise<Outcome> {
  const file = join(root.path, 'project.bin');
  await writeFile(file, bytes);
  const args = ['--max-old-space-size=256', '--import', './scripts/register-ts.mjs', CHILD, file];
  try {
    const { stdout } = await run(process.execPath, args, { timeout: 60_000, encoding: 'utf8' });
    const [state = 'no answer', reason = ''] = stdout.split('	');
    return { code: 0, state, reason };
  } catch {
    return { code: 1, state: 'child failed', reason: '' };
  }
}

function entriesFile(entries: readonly EntrySpec[], count: number, next: (s: number) => number) {
  return buildCompound({ sectors: directorySectors(entries), count, next });
}

it('RF-154 refuses a directory that loops, in a real project, without using memory', async () => {
  const bytes = Buffer.from(
    buildVbaProject({ modules: [{ name: 'M', kind: 'standard', source: 'x' }] }),
  );
  const dirAt = (bytes.readInt32LE(0x30) + 1) * SECTOR;
  bytes.writeInt32LE(2, dirAt + 128 + 0x48);
  bytes.writeInt32LE(1, dirAt + 256 + 0x48);

  const outcome = await readIsolated(bytes);

  expect(outcome).toMatchObject({ code: 0, state: 'unreadable' });
  expect(outcome.reason).toContain('reached twice');
});

it('RF-154 refuses 16,000 nested storages in milliseconds', async () => {
  const entries: EntrySpec[] = Array.from({ length: 16_000 }, (_, i) => ({
    type: i === 0 ? 5 : 1,
    child: i + 1 < 16_000 ? i + 1 : -1,
  }));

  const outcome = await readIsolated(entriesFile(entries, 4000, (s) => (s < 3999 ? s + 1 : -2)));

  expect(outcome).toMatchObject({ code: 0, state: 'unreadable' });
  expect(outcome.reason).toContain('too large');
});

it('RF-154 refuses a chain that runs against the file order', async () => {
  const entries: EntrySpec[] = [{ type: 5 }];
  const outcome = await readIsolated(entriesFile(entries, 6000, (s) => (s > 1 ? s - 1 : -2)));

  expect(outcome).toMatchObject({ code: 0, state: 'unreadable' });
  expect(outcome.reason).toContain('walked too many times');
});

it('RF-154 refuses 2,000 streams that each start inside one long chain', async () => {
  const entries: EntrySpec[] = [
    { type: 5, child: 1 },
    ...Array.from({ length: 2000 }, (_, i): EntrySpec => ({
      type: 2,
      start: 600 + i,
      size: 4096,
      ...(i + 1 < 2000 ? { right: i + 2 } : {}),
    })),
  ];
  const dirSectors = Math.ceil(entries.length / 4);
  const next = (s: number): number => {
    if (s < dirSectors) return s === dirSectors - 1 ? -2 : s + 1;
    return s < dirSectors + 2999 ? s + 1 : -2;
  };

  const outcome = await readIsolated(entriesFile(entries, dirSectors + 3000, next));

  expect(outcome).toMatchObject({ code: 0, state: 'unreadable' });
  expect(outcome.reason).toMatch(/share a sector|declare more bytes/);
});
