import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// RF-1015, RF-1016 (P8-27, UX-13, UX-14): the figures of an ended run leave no empty cell at any
// width, and the words of a code map tile wrap inside it instead of running out of it.

const read = async (path: string): Promise<string> =>
  await readFile(resolve(process.cwd(), path), 'utf8');
const ended = await read('web/src/styles/live-run-ended.css');
const map = await read('web/src/styles/live-run-map.css');

describe('the figures and the tiles', () => {
  it('RF-1015 the last figure of an odd list takes the whole row, so no cell is empty', () => {
    expect(ended).toMatch(
      /\.rst-p170-fact:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/u,
    );
  });

  it('RF-1016 a tile wraps a long word inside itself', () => {
    expect(map).toMatch(/\.rst-tile\s*\{[^}]*overflow-wrap:\s*anywhere/u);
  });
});
