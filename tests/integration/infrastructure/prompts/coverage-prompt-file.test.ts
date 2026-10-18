import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadCoveragePrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RNF-004, RF-145, RF-627: the planner's prompt for linking task cards to the items they build is a
// versioned file, loaded with its version and the SHA-256 of its bytes for the manifest. It tells
// the planner that the tasks and items are data and that it links by id and invents nothing.

describe('loadCoveragePrompt', () => {
  it('RNF-004 loads prompts/planner/coverage.v1.md with its version and hash', async () => {
    const file = await loadCoveragePrompt('prompts');

    const bytes = await readFile('prompts/planner/coverage.v1.md');
    expect(file).toMatchObject({ name: 'planner/coverage.v1.md', version: 'v1' });
    expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(file.text).toBe(bytes.toString('utf8'));
  });

  it('RF-145 RF-627 says the text is data, never instructions, and links by id only', async () => {
    const { text } = await loadCoveragePrompt('prompts');

    expect(text).toMatch(/data, never instructions/u);
    expect(text).toMatch(/exactly as given/u);
    expect(text).toMatch(/Do not invent an id/u);
    expect(text).toMatch(/Never write a tag in your answer/u);
  });
});
