import { describe, expect, it } from 'vitest';
import { loadPromptFile } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { loadVerifierPrompts } from '../../../../src/infrastructure/prompts/verifier-prompt-files.js';

// P10-06, RF-301, RF-1411, RNF-004: the verifier prompt v6 is the one a run loads; it asks for a
// shorter reason and keeps every rule of v5, which stays loadable.

describe('the verifier claim prompt v6', () => {
  it('RNF-004 is the system prompt a run loads, and v5 stays loadable', async () => {
    const { system } = await loadVerifierPrompts('prompts');
    const old = await loadPromptFile('prompts', 'verifier/claim.v5.md');

    expect(system).toMatchObject({ name: 'verifier/claim.v6.md', version: 'v6' });
    expect(old).toMatchObject({ name: 'verifier/claim.v5.md', version: 'v5' });
  });

  it('RF-1411 asks for a reason of at most 150 characters and keeps the rules of v5', async () => {
    const { system } = await loadVerifierPrompts('prompts');
    const old = await loadPromptFile('prompts', 'verifier/claim.v5.md');

    expect(system.text).toMatch(/at most 150 characters/u);
    expect(system.text).toMatch(/do not quote code/u);
    for (const rule of [
      'Kind: defined elsewhere',
      '[MASKED:<kind>]',
      'workbook.md',
      '[context] ',
    ]) {
      expect(old.text).toContain(rule);
      expect(system.text).toContain(rule);
    }
  });
});
