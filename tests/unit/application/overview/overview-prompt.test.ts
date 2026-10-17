import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadOverviewPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-264, RF-145, RNF-004: the overview prompt is a versioned file; it states the answer shape and
// the rule that every statement links a listed card.

describe('prompts/summariser/overview.v1.md', () => {
  it('RF-264 names the sections, asks for card ids and forbids guessing', async () => {
    const text = await readFile('prompts/summariser/overview.v1.md', 'utf8');

    for (const section of ['application', 'users', 'features', 'screens', 'data', 'integrations']) {
      expect(text).toContain(`\`${section}\``);
    }
    expect(text).toContain('"cards"');
    expect(text).toMatch(/only ids that are listed/iu);
    expect(text).toMatch(/no card supports is not written/iu);
    expect(text).toMatch(/do not guess/iu);
  });

  it('RF-264 is loaded with its version and hash and holds no data block marker', async () => {
    const file = await loadOverviewPrompt('prompts');

    expect(file).toMatchObject({ name: 'summariser/overview.v1.md', version: 'v1' });
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});
