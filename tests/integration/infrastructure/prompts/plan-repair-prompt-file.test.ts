import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadPlanRepairPrompt,
  loadPromptFile,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RNF-004, RF-604 (P10-07): a plan run loads `plan-repair.v2` with its version and the SHA-256 of
// its bytes for the manifest. The lab round's `plan-repair.v3` regressed on Sonnet on the fixed
// check and is kept only as a recorded candidate: loadable by name, never loaded by a run.

describe('loadPlanRepairPrompt', () => {
  it('RNF-004 loads prompts/planner/plan-repair.v2.md with its version and hash', async () => {
    const file = await loadPlanRepairPrompt('prompts');

    const bytes = await readFile('prompts/planner/plan-repair.v2.md');
    expect(file).toMatchObject({ name: 'planner/plan-repair.v2.md', version: 'v2' });
    expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(file.text).toBe(bytes.toString('utf8'));
  });

  it('RF-604 P10-07 keeps the candidate plan-repair.v3 loadable with its two rules', async () => {
    const { text, version } = await loadPromptFile('prompts', 'planner/plan-repair.v3.md');

    expect(version).toBe('v3');
    expect(text).toMatch(/not an open question \(`OQ`\) stays in the `sources`/u);
    expect(text).toMatch(/Every requirement is in the `requirements` of at least one task card/u);
    expect((await loadPlanRepairPrompt('prompts')).text).not.toMatch(/Every requirement is in/u);
  });
});
