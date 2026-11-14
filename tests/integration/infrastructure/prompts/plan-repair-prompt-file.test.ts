import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadPlanRepairPrompt,
  loadPromptFile,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RNF-004, RF-604 (P10-07): the plan repair prompt kept by the lab round is `plan-repair.v3`, loaded
// with its version and the SHA-256 of its bytes for the manifest; `plan-repair.v2` stays loadable.

describe('loadPlanRepairPrompt', () => {
  it('RNF-004 loads prompts/planner/plan-repair.v3.md with its version and hash', async () => {
    const file = await loadPlanRepairPrompt('prompts');

    const bytes = await readFile('prompts/planner/plan-repair.v3.md');
    expect(file).toMatchObject({ name: 'planner/plan-repair.v3.md', version: 'v3' });
    expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(file.text).toBe(bytes.toString('utf8'));
  });

  it('RF-604 P10-07 asks to keep every card that is not an open question and to list every requirement', async () => {
    const { text } = await loadPlanRepairPrompt('prompts');

    expect(text).toMatch(/not an open question \(`OQ`\) stays in the `sources`/u);
    expect(text).toMatch(/Every requirement is in the `requirements` of at least one task card/u);
    expect(text).toMatch(/Write no text other than the JSON/u);
  });

  it('RNF-004 keeps plan-repair.v2 loadable as it was', async () => {
    const file = await loadPromptFile('prompts', 'planner/plan-repair.v2.md');

    expect(file).toMatchObject({ name: 'planner/plan-repair.v2.md', version: 'v2' });
    expect(file.text).not.toMatch(/Every requirement is in the `requirements`/u);
  });
});
