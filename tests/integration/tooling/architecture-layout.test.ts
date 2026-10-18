import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// RNF-005 (offline suite) and RNF-013 (layers): the layout block of docs/architecture.md section 4 is the
// canonical map of src/, so every folder of a layer must have its own row in that block.

const LAYERS = ['domain', 'application', 'infrastructure', 'presentation'] as const;

async function layoutBlock(): Promise<string> {
  const text = await readFile(join(process.cwd(), 'docs', 'architecture.md'), 'utf8');
  const start = text.indexOf('## 4. Repository and solution layout');
  const end = text.indexOf('## 5. Domain model');
  if (start < 0 || end < start) throw new Error('Section 4 of docs/architecture.md is not found');
  return text.slice(start, end);
}

async function foldersOf(layer: (typeof LAYERS)[number]): Promise<string[]> {
  const entries = await readdir(join(process.cwd(), 'src', layer), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

describe('architecture section 4 names every folder of src/', () => {
  it.each(LAYERS)('RNF-005 every folder of src/%s has a row in the layout block', async (layer) => {
    const block = await layoutBlock();
    const folders = await foldersOf(layer);

    const missing = folders.filter((name) => !new RegExp(`^ +${name}/`, 'm').test(block));

    expect(missing).toEqual([]);
  });
});
