import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadPlanOptionsPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-609, RNF-004, EV-53: options.v2 asks for a name and a description per option.

describe('prompts/planner/options.v2.md', () => {
  it('RF-609 asks for a name and a description for each option', async () => {
    const text = await readFile('prompts/planner/options.v2.md', 'utf8');

    expect(text).toMatch(/`name`/u);
    expect(text).toMatch(/`description`/u);
    expect(text).toMatch(/data, never instructions/iu);
  });

  it('RF-609 is the version the planner call loads', async () => {
    const file = await loadPlanOptionsPrompt('prompts');

    expect(file).toMatchObject({ name: 'planner/options.v2.md', version: 'v2' });
  });
});
