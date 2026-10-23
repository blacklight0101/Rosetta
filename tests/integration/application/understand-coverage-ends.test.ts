import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarnessOptions,
} from '../../support/understand-run-harness.js';

// RF-230, RNF-002, ADR-005: the coverage of a task that ends in any state keeps what its tools
// returned. Each recording reads lines 5-8 of Catalog/Details.aspx.cs (or finds and queries lines
// of Services/CatalogService.cs) and then the task ends in the state under test.

const temp = useTempRoot('rosetta-coverage-ends-');

const coverageSchema = z.object({
  areas: z.array(
    z.object({
      area: z.string(),
      files: z.array(
        z.object({
          path: z.string(),
          read: z.array(z.object({ startLine: z.number(), endLine: z.number() })),
        }),
      ),
    }),
  ),
});

interface Ended {
  readonly files: readonly { path: string; read: readonly object[] }[];
  readonly markdown: string;
  readonly taskStates: readonly string[];
}

async function endedRun(
  options: Omit<UnderstandHarnessOptions, 'dataDir'>,
  area: string,
): Promise<Ended> {
  const h = await createUnderstandHarness({ dataDir: temp.path, ...options });
  await h.scan();
  const run = await h.understand({ areas: [area] });
  const folder = h.runFolder(run);
  const coverage = coverageSchema.parse(await readJson(join(folder, 'coverage.json')));
  const files = coverage.areas.find((entry) => entry.area === area)?.files ?? [];
  const markdown = await readFile(join(folder, 'coverage.md'), 'utf8');
  const manifest = await h.manifestOf(run);
  return { files, markdown, taskStates: manifest.agentTasks.map((task) => task.state) };
}

const catalogRead = { path: 'Catalog/Details.aspx.cs', read: [{ startLine: 5, endLine: 8 }] };
const catalogRow = '| Catalog/Details.aspx.cs | 5\\-8 |';

describe('an understand run whose task ends without a card: coverage', UNDERSTAND_TIMEOUT, () => {
  it('RF-230 a task that ends Failed keeps the lines it read', async () => {
    const ended = await endedRun({ recording: 'understand-read-then-failure.json' }, 'Catalog');

    expect(ended.taskStates).toEqual(['Failed']);
    expect(ended.files).toContainEqual(catalogRead);
    expect(ended.markdown).toContain(catalogRow);
  });

  it('RF-230 a task that ends InvalidOutput keeps the lines it read', async () => {
    const ended = await endedRun({ recording: 'understand-read-then-invalid.json' }, 'Catalog');

    expect(ended.taskStates).toEqual(['InvalidOutput']);
    expect(ended.files).toContainEqual(catalogRead);
    expect(ended.markdown).toContain(catalogRow);
  });

  it('RF-230 RNF-002 a task cut short by the run stop keeps the lines it read', async () => {
    const ended = await endedRun(
      {
        recording: 'understand-read-then-answer.json',
        beforeCall: async (call, harness) => {
          if (call === 2) await harness.stopRunning();
        },
      },
      'Catalog',
    );

    expect(ended.taskStates).toEqual(['Failed']);
    expect(ended.files).toContainEqual(catalogRead);
    expect(ended.markdown).toContain(catalogRow);
  });

  it('RF-230 RF-422 a task stopped by the budget cap keeps the lines it read', async () => {
    const capped = understandSettings((settings) => ({
      ...settings,
      budget: { ...settings.budget, run: { maxCostMicros: 500_000, maxTokens: 55_000 } },
    }));

    const ended = await endedRun(
      { recording: 'understand-read-then-answer.json', settings: capped },
      'Catalog',
    );

    expect(ended.taskStates).toEqual(['StoppedByCap']);
    expect(ended.files).toContainEqual(catalogRead);
    expect(ended.markdown).toContain(catalogRow);
  });
});

describe(
  'an understand run whose reader greps and queries the code map',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-230 RF-209 the lines of grep matches count as read, the code map statements do not', async () => {
      const ended = await endedRun({ recording: 'understand-grep-codemap.json' }, 'Services');

      expect(ended.taskStates).toEqual(['Done']);
      // Line 8 is the only grep match; lines 7, 12 and 13 are the code map's SQL statements, which
      // a query only lists (EV-38).
      expect(ended.files).toEqual([
        { path: 'Services/CatalogService.cs', read: [{ startLine: 8, endLine: 8 }] },
      ]);
      expect(ended.markdown).toContain('| Services/CatalogService.cs | 8\\-8 |');
    });
  },
);
