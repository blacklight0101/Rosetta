import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const packsFolder = ['infrastructure', 'scan', 'packs'].join('/');
const importsTreeSitter = /(?:from|import)\s*\(?\s*['"](?:web-)?tree-sitter[^'"]*['"]/u;

async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('tree-sitter boundary (ADR-004, DEC-11)', () => {
  it('RF-110 web-tree-sitter and the grammar are imported only under src/infrastructure/scan/packs/', async () => {
    const offenders: string[] = [];
    let inside = 0;
    for (const file of await sourceFiles()) {
      const path = relative(sourceRoot, file).split(sep).join('/');
      if (!importsTreeSitter.test(await readFile(file, 'utf8'))) continue;
      if (path.startsWith(`${packsFolder}/`)) inside += 1;
      else offenders.push(path);
    }

    expect(offenders).toEqual([]);
    expect(inside).toBeGreaterThan(0);
  });
});
