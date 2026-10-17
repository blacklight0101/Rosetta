import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { copyFixture } from '../../support/scan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-243, RF-240, DEC-136: the open questions of an understand run. A question asking what an area
// does is refused and the agent repairs its answer; the same question from three areas reaches
// `answers.md` once, with its three citations; the area of a vendored library writes no question.
// Answers already in `answers.md` stay attached to their questions.

const temp = useTempRoot('rosetta-questions-');

const indexSchema = z.object({ cards: z.array(z.object({ id: z.string(), type: z.string() })) });
const coverageSchema = z.object({
  areas: z.array(z.object({ area: z.string(), note: z.string().optional() })),
});

async function started(recording: string, repository?: string): Promise<UnderstandHarness> {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording,
    ...(repository === undefined ? {} : { repository }),
  });
  await h.scan();
  return h;
}

const areas = ['Catalog', 'Controllers', 'Services'];

describe('the open questions of three areas', UNDERSTAND_TIMEOUT, () => {
  it('RF-243 a question asking what the area does is refused, the agent repairs, and no such card is written', async () => {
    const h = await started('understand-questions.json');

    const run = await h.understand({ areas });

    expect(run.endState).toBe('Completed');
    const requests = h.providers.requests();
    const repair = requests[2]?.messages.at(-1)?.content ?? '';
    expect(repair).toContain('cards.2.question');
    expect(repair).toMatch(/read the code/iu);
    const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
    expect(index.cards.filter((card) => card.type === 'OQ')).toHaveLength(4);
    const answers = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    expect(answers).not.toContain('What does this area do?');
  });

  it('RF-243 the same question from three areas is merged once with its three citations', async () => {
    const h = await started('understand-questions.json');

    await h.understand({ areas });

    const answers = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    expect(answers.match(/^## .* - Who uses the catalog pages\?$/gmu)).toHaveLength(1);
    expect(answers.toLowerCase().match(/who uses the catalog pages/gu)).toHaveLength(1);
    const section = answers.split('\n## ').find((each) => each.includes('Who uses the catalog'));
    expect(section).toContain('Catalog/Details.aspx.cs:3-3');
    expect(section).toContain('Controllers/CatalogController.cs:1-12');
    expect(section).toContain('Services/CatalogService.cs:1-4');
  });
});

describe('the open questions of three areas, grouped', UNDERSTAND_TIMEOUT, () => {
  it('RF-243 the merged and the other questions are grouped by area and ordered by what depends on them', async () => {
    const h = await started('understand-questions.json');

    await h.understand({ areas });

    const answers = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    const headings = [...answers.matchAll(/^## (OQ-\d+) - (.*)$/gmu)].map((found) => found[2]);
    expect(headings).toEqual([
      'Who uses the catalog pages?',
      'How many catalog items are there in production?',
    ]);
  });

  it('RF-243 an answer already in answers.md stays attached to its question and is not asked again', async () => {
    const h = await started('understand-questions.json');
    await mkdir(h.projectFolder(), { recursive: true });
    const existing = [
      '# Answers to open questions',
      '',
      '## OQ-009 - Who uses the catalog pages?',
      '',
      '- Card: runs/20260101-000000-understand/cards/OQ/OQ-009.md',
      '- Context: Default.aspx.cs:1-2 A page.',
      '- Answer: Sales staff in three countries.',
      '',
    ].join('\n');
    await writeFile(join(h.projectFolder(), 'answers.md'), existing, 'utf8');

    await h.understand({ areas });

    const answers = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    expect(answers.startsWith(existing.trimEnd())).toBe(true);
    expect(answers).toContain('- Answer: Sales staff in three countries.');
    expect(answers.match(/Who uses the catalog pages\?/gu)).toHaveLength(1);
    expect(answers).toContain('How many catalog items are there in production?');
  });
});

describe('an area of third-party code', UNDERSTAND_TIMEOUT, () => {
  async function withLibrary(): Promise<string> {
    const repository = join(temp.path, 'repository');
    await copyFixture('webforms-csharp', repository);
    await mkdir(join(repository, 'Scripts'), { recursive: true });
    await writeFile(
      join(repository, 'Scripts', 'jquery-3.4.1.min.js'),
      '!function(e,t){"use strict";e.fn={}}(window);\n',
      'utf8',
    );
    return repository;
  }

  it('RF-243 writes no open question even when its agent asks one, and the coverage says no application logic', async () => {
    const h = await started('understand-third-party.json', await withLibrary());

    const run = await h.understand({ areas: ['Scripts'] });

    expect(run.endState).toBe('Completed');
    const folder = h.runFolder(run);
    const index = indexSchema.parse(await readJson(join(folder, 'cards', 'index.json')));
    expect(index.cards).toEqual([]);
    const coverage = coverageSchema.parse(await readJson(join(folder, 'coverage.json')));
    expect(coverage.areas.map((entry) => [entry.area, entry.note])).toEqual([
      ['Scripts', 'no application logic'],
    ]);
    const warning = h.logger.entries.find((entry) => entry.message.includes('third-party'));
    expect(warning).toMatchObject({ level: 'warn' });
  });

  it('RF-243 an area of own code keeps its questions', async () => {
    const h = await started('understand-questions.json', await withLibrary());

    const run = await h.understand({ areas });

    const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
    expect(index.cards.some((card) => card.type === 'OQ')).toBe(true);
  });
});
