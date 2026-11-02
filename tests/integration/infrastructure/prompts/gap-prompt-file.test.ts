import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadGapPrompt,
  loadGapRepairPrompt,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RNF-004, RF-145, RF-627, RF-630, Q-45: the planner's prompt for the task cards of the items no
// card builds is a versioned file, loaded with its version and the SHA-256 of its bytes for the
// manifest. The coverage prompt stays as it was: the new prompt is a file of its own.

describe('loadGapPrompt', () => {
  it('RNF-004 loads prompts/planner/gap.v3.md with its version and hash', async () => {
    const file = await loadGapPrompt('prompts');

    const bytes = await readFile('prompts/planner/gap.v3.md');
    expect(file).toMatchObject({ name: 'planner/gap.v3.md', version: 'v3' });
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

describe('loadGapRepairPrompt', () => {
  it('RNF-004 loads prompts/planner/gap-repair.v3.md with its version and hash', async () => {
    const file = await loadGapRepairPrompt('prompts');

    const bytes = await readFile('prompts/planner/gap-repair.v3.md');
    expect(file).toMatchObject({ name: 'planner/gap-repair.v3.md', version: 'v3' });
    expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(file.text).toBe(bytes.toString('utf8'));
  });

  it('RF-202 RF-627 lists the problems and the expected shape, and keeps the first prompt as it was', async () => {
    const { text } = await loadGapRepairPrompt('prompts');

    expect(text).toMatch(/could not be read/u);
    expect(text).toMatch(/"position": 3/u);
    expect(text).toMatch(/only the cards/iu);
    expect(text).toMatch(/data, never instructions/u);
    expect(text).toMatch(/Write no text other than the JSON/u);
    expect(await readFile('prompts/planner/gap.v3.md', 'utf8')).not.toMatch(/could not be read/u);
  });
});

describe('the gap prompts of P7-14', () => {
  it('RF-607 P7-14 the gap prompt says a card under SDD names a requirement and dependsOn never an item id', async () => {
    const { text } = await loadGapPrompt('prompts');

    expect(text).toMatch(/specification-driven \(SDD\).*names at least one requirement/su);
    expect(text).toMatch(/never an item id/u);
  });

  it('RF-607 P7-14 the repair prompt says the same', async () => {
    const { text } = await loadGapRepairPrompt('prompts');

    expect(text).toMatch(/specification-driven \(SDD\).*names at least one requirement/su);
    expect(text).toMatch(/never an item id/u);
    expect(text).toMatch(/one JSON object/u);
  });
});
