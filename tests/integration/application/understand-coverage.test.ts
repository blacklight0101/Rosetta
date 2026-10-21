import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import {
  readJson,
  UNDERSTAND_TIMEOUT,
  useSharedFullRun,
} from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-230, ADR-005, ADR-008: the coverage of every area of an understand run on the C# fixture,
// with the recorded reader: (root) reads Default.aspx.cs:1-14, Catalog reads Details.aspx.cs:1-10 (one
// of its two files), Controllers and Services read their only file, Database reads schema.sql:1-10
// (RF-206: a reader reads before it answers).

const temp = useTempRoot('rosetta-coverage-');
// The two tests of the full run only read its files; the early-end test makes its own run.
const full = useSharedFullRun('rosetta-coverage-shared-');

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

describe('an understand run on the C# fixture: coverage', () => {
  it('RF-230 lists every file of each area as read with its line ranges or not read', async () => {
    const { folder } = full.current();

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
    // The root area holds seven files; the reader reads three of them, more than half of its tokens.
    expect(read).toEqual([
      { path: 'Default.aspx', read: [{ startLine: 1, endLine: 8 }] },
      { path: 'Default.aspx.cs', read: [{ startLine: 1, endLine: 14 }] },
      { path: 'Web.config', read: [{ startLine: 1, endLine: 9 }] },
    ]);
    expect(root?.files).toHaveLength(7);
    expect(areaOf(coverage, 'Services')?.files).toEqual([
      { path: 'Services/CatalogService.cs', read: [{ startLine: 1, endLine: 18 }] },
    ]);
    const catalog = areaOf(coverage, 'Catalog');
    expect(catalog?.files.filter((file) => file.read.length > 0)).toEqual([
      { path: 'Catalog/Details.aspx.cs', read: [{ startLine: 1, endLine: 10 }] },
    ]);
    expect(catalog?.files.length).toBeGreaterThan(1);
  });

  it('RF-230 the run summary shows the percentage of area tokens read', async () => {
    const { folder } = full.current();

    const coverage = await coverageOf(folder);
    expect(areaOf(coverage, 'Services')?.readTokenShare).toBe(1);
    const catalogShare = areaOf(coverage, 'Catalog')?.readTokenShare ?? 0;
    expect(catalogShare).toBeGreaterThan(0);
    expect(catalogShare).toBeLessThan(1);
    const rootShare = areaOf(coverage, '(root)')?.readTokenShare ?? 0;
    expect(rootShare).toBeGreaterThan(0);
    expect(rootShare).toBeLessThan(1);
    const text = await readFile(join(folder, 'coverage.md'), 'utf8');
    expect(text).toContain('## Run summary');
    expect(text).toContain('| Services | 1 of 1 | 100.0% |');
    expect(text).toContain('| Catalog | 1 of ');
    expect(text).toContain('| Default.aspx.cs | 1\\-14 |');
  });
});

describe('an understand run whose tasks end early: coverage', UNDERSTAND_TIMEOUT, () => {
  it('RF-230 an InvalidOutput task and a task of a stopped run keep the coverage of the lines they read', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-coverage-early-ends.json',
      beforeCall: async (call, harness) => {
        if (call === 11) await harness.stopRunning();
      },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('Interrupted');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
      ['Catalog', 'InvalidOutput'],
      ['Services', 'Failed'],
    ]);
    const coverage = await coverageOf(h.runFolder(run));
    expect(coverage.areas.map((entry) => [entry.area, entry.files])).toEqual([
      [
        'Catalog',
        [
          { path: 'Catalog/Details.aspx', read: [{ startLine: 2, endLine: 2 }] },
          {
            path: 'Catalog/Details.aspx.cs',
            read: [{ startLine: 1, endLine: 10 }],
          },
        ],
      ],
      ['Services', [{ path: 'Services/CatalogService.cs', read: [{ startLine: 1, endLine: 9 }] }]],
    ]);
  });
});
