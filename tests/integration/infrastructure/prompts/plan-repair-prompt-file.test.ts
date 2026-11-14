import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadPlanRepairPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RNF-004, RF-604 (P10-07): a plan run loads `plan-repair.v2` with its version and the SHA-256 of
// its bytes for the manifest. The lab round's v3 regressed on Sonnet on the fixed check and was not
// kept; its text is in the round log (`docs/evaluation/prompt-lab/plan-gap.md`), not in the folder.

describe('loadPlanRepairPrompt', () => {
  it('RNF-004 loads prompts/planner/plan-repair.v2.md with its version and hash', async () => {
    const file = await loadPlanRepairPrompt('prompts');

    const bytes = await readFile('prompts/planner/plan-repair.v2.md');
    expect(file).toMatchObject({ name: 'planner/plan-repair.v2.md', version: 'v2' });
    expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(file.text).toBe(bytes.toString('utf8'));
  });

  it('RF-604 P10-07 sends the repair prompt without the rules of the reverted round', async () => {
    const { text } = await loadPlanRepairPrompt('prompts');

    expect(text).not.toMatch(
      /Every requirement is in the `requirements` of at least one task card/u,
    );
    expect(text).toMatch(/Write no text other than the JSON/u);
  });
});
