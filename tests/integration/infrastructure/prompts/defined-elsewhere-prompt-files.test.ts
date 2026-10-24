import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadPromptFile,
  loadRereadPrompt,
} from '../../../../src/infrastructure/prompts/prompt-files.js';
import { loadVerifierPrompts } from '../../../../src/infrastructure/prompts/verifier-prompt-files.js';

// P5-35, RNF-004: the verifier prompt v4 and the re-read prompt v4 carry the reason kind; the v3 files
// stay as they were for the runs that used them.

const sha256Of = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

describe('the prompts of the defined-elsewhere retry', () => {
  it('RNF-004 the old versions stay unchanged', async () => {
    expect((await loadPromptFile('prompts', 'verifier/claim.v3.md')).sha256).toBe(
      '4fcfb21e2e6f8f5d70e08275a27f649830ba989f4bfb7ebea64e50d62680491e',
    );
    expect((await loadPromptFile('prompts', 'reader/reread.v3.md')).sha256).toBe(
      '2896174e4fe2b42af5994210d43409a3da627cadcee2b4cca808ca459dc60a0d',
    );
  });

  it('RF-301 the verifier prompt v4 tells how to name the reason kind, and v3 does not', async () => {
    const { system } = await loadVerifierPrompts('prompts');
    const old = await loadPromptFile('prompts', 'verifier/claim.v3.md');

    expect(system.sha256).toBe(await sha256Of('prompts/verifier/claim.v4.md'));
    expect(system.text).toMatch(/Kind: defined elsewhere/u);
    expect(old.text).not.toMatch(/Kind: defined elsewhere/u);
  });

  it('RF-209 the re-read prompt v4 sends the reader to search for the definition and cite both', async () => {
    const { text } = await loadRereadPrompt('prompts');

    expect(text).toMatch(/"reasonKind": "definedElsewhere"/u);
    expect(text).toMatch(/`grep` and `codemap_query`/u);
    expect(text).toMatch(/cites both the lines that act and the lines that define/u);
  });
});
