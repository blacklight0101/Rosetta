import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSqlTemplates } from '../../support/sql-template-scan.js';

// ADR-016, RNF-003, F-20: no file of src/infrastructure/db builds SQL text with `${}`; statements are
// constant strings (joined with `+` when they are long) and the values travel in the array.

const folder = join(process.cwd(), 'src', 'infrastructure', 'db');

describe('SQL text in src/infrastructure/db', () => {
  it('ADR-016 builds no statement with a template substitution', async () => {
    const entries = await readdir(folder, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'));

    const found = (
      await Promise.all(
        files.map(async (entry) => {
          const path = join(entry.parentPath, entry.name);
          const findings = findSqlTemplates(await readFile(path, 'utf8'), path);
          return findings.map((finding) => `${entry.name}:${String(finding.line)} ${finding.kind}`);
        }),
      )
    ).flat();

    expect(files.length).toBeGreaterThan(20);
    expect(found.sort()).toEqual([]);
  });
});
