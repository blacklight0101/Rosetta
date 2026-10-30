import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadPlannerPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-608, RF-609, RF-610, RF-645, RNF-004, DEC-187, EV-60: package.v11.md tells the planner that
// the brief's choices are already recorded as ADRs, so it writes no decision of its own for them.

describe('prompts/planner/package.v11.md', () => {
  it('RF-608 is the version the plan run loads', async () => {
    const file = await loadPlannerPrompt('prompts');

    expect(file).toMatchObject({ name: 'planner/package.v11.md', version: 'v11' });
  });

  it('RF-645 says the style, the strategy, the stack and the typed answers are recorded already', async () => {
    const text = await readFile('prompts/planner/package.v11.md', 'utf8');

    expect(text).toMatch(/architecture style, the migration strategy, the technologies/iu);
    expect(text).toMatch(/typed answers?/iu);
    expect(text).toMatch(/Architecture Style Adoption/u);
    expect(text).toMatch(/Migration Order Focus/u);
    expect(text).toMatch(/Technology Stack Selection/u);
  });

  it('RNF-004 keeps package.v10.md as it was', async () => {
    const text = await readFile('prompts/planner/package.v10.md', 'utf8');

    expect(text).toContain('Write a decision only when a card makes it');
  });
});
