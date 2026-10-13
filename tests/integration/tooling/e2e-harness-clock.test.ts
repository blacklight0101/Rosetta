import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// RNF-005, P1-132: the end-to-end harness takes the time from the harness clock (the `Clock` port,
// conventions.md section 3), never from `new Date()` or `Date.now()` of its own.

const e2eRoot = join(process.cwd(), 'tests', 'e2e');
const ownTime = /new Date\(|Date\.now\(/u;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('e2e harness clock', () => {
  it('RNF-005 no file of the end-to-end harness reads the time itself', async () => {
    const offending: string[] = [];
    for (const file of await sourceFiles(e2eRoot)) {
      const lines = (await readFile(file, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        if (ownTime.test(line))
          offending.push(`${relative(process.cwd(), file)}:${String(index + 1)}`);
      });
    }

    expect(offending).toEqual([]);
  });
});
