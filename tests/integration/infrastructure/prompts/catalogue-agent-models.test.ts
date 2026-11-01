import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

// P7-23, RF-639, RF-645, RNF-004, DEC-190, DEC-200: the default tier models of Claude Code and Codex
// are a catalogue file, versioned by its name, and no model name is a literal in code.

const file = 'agent-models.v1.yaml';

describe('the agent models file of the catalogue', () => {
  it('RNF-004 is shipped in the catalogue folder with the version of its name', async () => {
    expect(await readdir('prompts/catalogue')).toContain(file);
  });

  it('RF-639 names the Claude Code aliases and the Codex models for each tier', async () => {
    const document: unknown = parse(await readFile(join('prompts/catalogue', file), 'utf8'));

    expect(document).toEqual({
      'claude-code': { smallest: 'haiku', middle: 'sonnet', largest: 'opus' },
      codex: { smallest: 'gpt-5-mini', middle: 'gpt-5-codex', largest: 'gpt-5' },
    });
  });
});
