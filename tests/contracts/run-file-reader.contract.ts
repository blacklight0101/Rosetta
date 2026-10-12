import { expect, it } from 'vitest';
import type { RunScope } from '../../src/application/ports/run-events.js';
import type { RunFileReader } from '../../src/application/ports/run-file-reader.js';
import { scopeFor } from '../support/run-event-fixtures.js';
import { collectBytes } from '../support/zip-reader.js';

// Architecture section 7: every RunFileReader (the Node reader, the memory reader) passes this
// suite. RF-506: a file of the run folder is read whole; RF-1105: the owner is part of the scope,
// so another user's scope finds nothing; RF-005: a path that leaves the run folder, is absolute or
// is not a plain name is refused with the answer of a file that does not exist.

interface ReaderFixture {
  readonly reader: RunFileReader;
  /** Gives the run a folder with these files (`path` relative to the run folder). */
  readonly seed: (scope: RunScope, files: Readonly<Record<string, string>>) => Promise<void>;
}

export type FreshReader = () => Promise<ReaderFixture>;

const scope = scopeFor('20261012-100000-understand');
const stranger = { ...scope, userId: '00000000-0000-4000-9000-0000000000b2' };
const files = {
  'manifest.json': '{"schemaVersion":1}\n',
  'cards/BR/BR-001.md': '# Orders\n',
  'report/replay.html': '<!doctype html>\n',
};
const notFound = { ok: false, error: 'not-found' } as const;

const refusedPaths = [
  '',
  '..',
  '../manifest.json',
  'cards/../manifest.json',
  'cards/../../manifest.json',
  '/manifest.json',
  '//manifest.json',
  'C:/Windows/win.ini',
  'cards\\BR\\BR-001.md',
  '..\\manifest.json',
  'cards//BR-001.md',
  './manifest.json',
  'cards/./BR/BR-001.md',
  '%2e%2e/manifest.json',
  'cards/%2e%2e/manifest.json',
  '.hidden',
  'manifest.json/',
  'manifest.json\u0000.txt',
  'cards',
  'cards/',
  'cards/BR',
  'nul',
];

export function runFileReaderContract(name: string, fresh: FreshReader): void {
  it(`RF-506 ${name} reads a file of the run folder, nested files included`, async () => {
    const { reader, seed } = await fresh();
    await seed(scope, files);

    for (const [path, text] of Object.entries(files)) {
      const opened = await reader.open(scope, path);
      if (!opened.ok) throw new Error(`${path} was refused`);
      expect(opened.value.size).toBe(Buffer.byteLength(text));
      expect((await collectBytes(opened.value.body)).toString('utf8')).toBe(text);
    }
  });

  it(`RF-506 ${name} refuses a file the run does not have, and a run without a folder`, async () => {
    const { reader, seed } = await fresh();

    expect(await reader.open(scope, 'manifest.json')).toEqual(notFound);
    await seed(scope, files);
    expect(await reader.open(scope, 'coverage.md')).toEqual(notFound);
  });

  it(`RF-1105 ${name} finds nothing in another user's folder`, async () => {
    const { reader, seed } = await fresh();
    await seed(scope, files);

    expect(await reader.open(stranger, 'manifest.json')).toEqual(notFound);
  });

  it.each(refusedPaths)(`RF-005 ${name} refuses the path %j`, async (path) => {
    const { reader, seed } = await fresh();
    await seed(scope, { ...files, '.hidden': 'x' });

    expect(await reader.open(scope, path)).toEqual(notFound);
  });
}
