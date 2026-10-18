import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layoutProblems, layoutRows } from '../../support/architecture-layout.js';

// RNF-005 (offline suite) and RNF-013 (layers): the src/ fence of docs/architecture.md section 4 is the
// canonical map of src/, so each layer's folders need a row under that layer, and the layers must be the
// folders of src/ themselves.

async function foldersOf(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function actualLayers(): Promise<Map<string, string[]>> {
  const src = join(process.cwd(), 'src');
  const layers = new Map<string, string[]>();
  for (const layer of await foldersOf(src)) layers.set(layer, await foldersOf(join(src, layer)));
  return layers;
}

const docText = (): Promise<string> =>
  readFile(join(process.cwd(), 'docs', 'architecture.md'), 'utf8');

/** A minimal section 4 with the given rows, for the cases that break the real block on purpose. */
function block(rows: Record<string, readonly string[]>, prose = ''): string {
  const lines = Object.entries(rows).flatMap(([layer, folders]) => [
    `  ${layer}/`,
    ...folders.map((folder) => `    ${folder}/          a description`),
  ]);
  return [
    '## 4. Repository and solution layout',
    '',
    '```text',
    'src/',
    ...lines,
    'web/                    front-end',
    '```',
    prose,
    '## 5. Domain model',
    '',
  ].join('\n');
}

describe('architecture section 4 names every folder of src/ under its own layer', () => {
  it('RNF-005 the layers of the src/ fence are the folders of src/', async () => {
    const layers = [...layoutRows(await docText()).keys()].sort();

    expect(layers).toEqual([...(await actualLayers()).keys()].sort());
  });

  it('RNF-005 every folder of each src layer has a row under that layer', async () => {
    expect(layoutProblems(await docText(), await actualLayers())).toEqual([]);
  });
});

describe('section 4 rows that do not satisfy the guard', () => {
  it('RNF-005 a row under another layer does not stand in for a folder', () => {
    const actual = new Map([
      ['domain', ['eval']],
      ['presentation', ['eval']],
    ]);
    const text = block({ domain: ['eval'], presentation: [] });

    expect(layoutProblems(text, actual)).toEqual(['presentation/eval has no row']);
  });

  it('RNF-005 a dropped layer heading is reported', () => {
    const actual = new Map([
      ['domain', ['eval']],
      ['presentation', ['eval']],
    ]);
    const text = block({ domain: ['eval'], presentation: ['eval'] }).replace(
      '  presentation/\n',
      '',
    );

    expect(layoutProblems(text, actual)).toEqual([
      'presentation/ has no heading',
      'presentation/eval has no row',
    ]);
  });

  it('RNF-005 a prose line naming a folder outside the fence is not a row', () => {
    const actual = new Map([['infrastructure', ['report']]]);
    const text = block({ infrastructure: [] }, '    report/          named in prose, not a row\n');

    expect(layoutProblems(text, actual)).toEqual(['infrastructure/report has no row']);
  });

  it('RNF-005 a folder whose row is removed from the real block is reported', async () => {
    const real = await docText();
    const removed = real.replace(/^ {4}report\/ {2,}the report file writer.*\n/m, '');

    expect(removed).not.toBe(real);
    expect(layoutProblems(removed, await actualLayers())).toEqual([
      'infrastructure/report has no row',
    ]);
  });
});
