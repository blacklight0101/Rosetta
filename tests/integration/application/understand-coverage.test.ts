import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import {
  fullUnderstandRun,
  readJson,
  UNDERSTAND_TIMEOUT,
} from '../../support/understand-full-run.js';

// RF-230, ADR-005, ADR-008: the coverage of every area of an understand run on the C# fixture,
// with the recorded reader: (root) reads Default.aspx.cs:1-14, Services reads
// Services/CatalogService.cs:1-18 (its only file), the other areas read nothing.

const temp = useTempRoot('rosetta-coverage-');

const coverageSchema = z.object({
  schemaVersion: z.literal(1),
  areas: z.array(
    z.object({
      area: z.string(),
      files: z.array(
        z.object({
          path: z.string(),
          read: z.array(z.object({ startLine: z.number(), endLine: z.number() })),
        }),
      ),
      tokens: z.number(),
      readTokens: z.number(),
      readTokenShare: z.number(),
    }),
  ),
});

type Coverage = z.infer<typeof coverageSchema>;

async function coverageOf(folder: string): Promise<Coverage> {
  const path = join(folder, 'coverage.json');
  const exists = await access(path).then(
    () => true,
    () => false,
  );
  expect(exists).toBe(true);
  return coverageSchema.parse(await readJson(path));
}

function areaOf(coverage: Coverage, name: string): Coverage['areas'][number] | undefined {
  return coverage.areas.find((entry) => entry.area === name);
}

describe('an understand run on the C# fixture: coverage', UNDERSTAND_TIMEOUT, () => {
  it('RF-230 lists every file of each area as read with its line ranges or not read', async () => {
    const { folder } = await fullUnderstandRun(temp.path);

    const coverage = await coverageOf(folder);
    expect(coverage.areas.map((entry) => entry.area)).toEqual([
      '(root)',
      'Catalog',
      'Controllers',
      'Database',
      'Services',
    ]);
    const root = areaOf(coverage, '(root)');
    const read = root?.files.filter((file) => file.read.length > 0);
    expect(read).toEqual([{ path: 'Default.aspx.cs', read: [{ startLine: 1, endLine: 14 }] }]);
    expect(root?.files.map((file) => file.path)).toContain('Web.config');
    expect(areaOf(coverage, 'Services')?.files).toEqual([
      { path: 'Services/CatalogService.cs', read: [{ startLine: 1, endLine: 18 }] },
    ]);
    const catalog = areaOf(coverage, 'Catalog');
    expect(catalog?.files.length).toBeGreaterThan(0);
    expect(catalog?.files.every((file) => file.read.length === 0)).toBe(true);
  });

  it('RF-230 the run summary shows the percentage of area tokens read', async () => {
    const { folder } = await fullUnderstandRun(temp.path);

    const coverage = await coverageOf(folder);
    expect(areaOf(coverage, 'Services')?.readTokenShare).toBe(1);
    expect(areaOf(coverage, 'Catalog')?.readTokenShare).toBe(0);
    const rootShare = areaOf(coverage, '(root)')?.readTokenShare ?? 0;
    expect(rootShare).toBeGreaterThan(0);
    expect(rootShare).toBeLessThan(1);
    const text = await readFile(join(folder, 'coverage.md'), 'utf8');
    expect(text).toContain('## Run summary');
    expect(text).toContain('| Services | 1 of 1 | 100.0% |');
    expect(text).toContain('| Catalog | 0 of ');
    expect(text).toContain('| Default.aspx.cs | 1\\-14 |');
  });
});
