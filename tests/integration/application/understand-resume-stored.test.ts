import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-006, RF-208, RF-250: a resumed run reports what an uninterrupted one does. The result of a
// finished task carries its coverage failure and note and the merged areas of its cards; the
// resume restores them and writes them into coverage.json and the card file.

const temp = useTempRoot('rosetta-understand-resume-stored-');
const areas = ['Catalog', 'Services'];

const capped = understandSettings((settings) => ({
  ...settings,
  budget: { ...settings.budget, run: { maxCostMicros: 500_000, maxTokens: 205_000 } },
}));

function raised(settings: ProjectSettings): ProjectSettings {
  const run = { maxCostMicros: 50_000_000, maxTokens: 5_000_000 };
  return { ...settings, budget: { ...settings.budget, run } };
}

const objectSchema = z.record(z.string(), z.unknown());
const coverageSchema = z.object({
  areas: z.array(
    z.object({ area: z.string(), failure: z.string().optional(), note: z.string().optional() }),
  ),
});

describe('RF-006 resuming a run, what the stored result carries', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 RF-250 keeps the coverage failure and note and the card mergedAreas on resume', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-resume.json',
      settings: capped,
      verifierRecording: 'verifier-all-supported.json',
    });
    await h.scan();
    const run = await h.understand({ areas });
    await h.changeSettings(raised);
    // The first area ended without a usable card and a merge named it: stored as such.
    const file = join(h.runFolder(run), 'task-results.json');
    const raw = objectSchema.parse(await readJson(file));
    const [first] = z.array(objectSchema).parse(raw['tasks']);
    const task = {
      ...first,
      state: 'InvalidOutput',
      coverage: {
        ...objectSchema.parse(first?.['coverage']),
        failure: 'invalid output (RST-1300)',
        note: 'not read',
      },
      cards: z
        .array(objectSchema)
        .parse(first?.['cards'])
        .map((card) => ({ ...card, mergedAreas: ['Catalog', 'Services'] })),
    };
    await writeFile(file, JSON.stringify({ ...raw, tasks: [task] }));

    await h.resume(run);

    const written = coverageSchema.parse(await readJson(join(h.runFolder(run), 'coverage.json')));
    expect(written.areas.find((each) => each.area === 'Catalog')).toMatchObject({
      failure: 'invalid output (RST-1300)',
      note: 'not read',
    });
    const card = await readFile(join(h.runFolder(run), 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(card).toMatch(/mergedAreas:\s+- "?Catalog"?\s+- "?Services"?/);
  });
});
