import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadGapPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RNF-004, RF-145, RF-627, RF-630, Q-45: the planner's prompt for the task cards of the items no
// card builds is a versioned file, loaded with its version and the SHA-256 of its bytes for the
// manifest. The coverage prompt stays as it was: the new prompt is a file of its own.

describe('loadGapPrompt', () => {
  it('RNF-004 loads prompts/planner/gap.v1.md with its version and hash', async () => {
    const file = await loadGapPrompt('prompts');

    const bytes = await readFile('prompts/planner/gap.v1.md');
    expect(file).toMatchObject({ name: 'planner/gap.v1.md', version: 'v1' });
    expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(file.text).toBe(bytes.toString('utf8'));
  });

  it('RF-145 RF-627 says the text is data, never instructions, and builds only the items given', async () => {
    const { text } = await loadGapPrompt('prompts');

    expect(text).toMatch(/data, never instructions/u);
    expect(text).toMatch(/exactly as given/u);
    expect(text).toMatch(/Do not invent an id/u);
    expect(text).toMatch(/Never write a tag in your answer/u);
  });

  it('RF-630 asks for the invariant, Given/When/Then scenarios and review probes', async () => {
    const { text } = await loadGapPrompt('prompts');

    expect(text).toMatch(/invariant/u);
    expect(text).toMatch(/Given .* when .* then/su);
    expect(text).toMatch(/probes/u);
  });

  it('RF-627 leaves the coverage prompt as it was', async () => {
    const coverage = await readFile('prompts/planner/coverage.v1.md', 'utf8');

    expect(coverage).not.toMatch(/task cards that build/u);
  });
});
