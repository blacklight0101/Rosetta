import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadDataModelPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// P3-120, RF-623: the data-model prompt v3 tells the planner to use the chosen database's types,
// to keep a legacy integer key and to build the tables the rule cards name. v1 and v2 stay.

const text = () => readFile('prompts/planner/data-model.v3.md', 'utf8');

describe('prompts/planner/data-model.v3.md', () => {
  it('RF-623 is the prompt the loader gives', async () => {
    const loaded = await loadDataModelPrompt('prompts');

    expect(loaded.text).toBe(await text());
    expect(loaded.name).toContain('data-model.v3.md');
  });

  it('RF-623 asks for the types of the chosen database from databaseTypes', async () => {
    const prompt = await text();

    expect(prompt).toContain('databaseTypes');
    expect(prompt).toMatch(/only (?:the )?type names (?:listed )?in `databaseTypes`/iu);
  });

  it('RF-623 keeps a legacy integer key and asks for a migration note when it changes', async () => {
    const prompt = await text();

    expect(prompt).toMatch(/legacy[^.]*integer[^.]*key[^.]*(?:stays|keep)/iu);
    expect(prompt).toMatch(/migration/iu);
  });

  it('RF-623 asks for the columns and tables the ruleCards name', async () => {
    expect(await text()).toContain('ruleCards');
  });

  it('RF-623 keeps v1 and v2', async () => {
    for (const name of ['v1', 'v2']) {
      expect(
        (await readFile(`prompts/planner/data-model.${name}.md`, 'utf8')).length,
      ).toBeGreaterThan(100);
    }
  });
});
