import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// RF-250, RF-145, RNF-004: the summariser's prompt is a versioned file that states the answer shape and what the model may merge.

describe('prompts/summariser/merge.v1.md', () => {
  it('RF-250 names the answer shape and says to merge only listed cards of one type', async () => {
    const text = await readFile('prompts/summariser/merge.v1.md', 'utf8');

    expect(text).toContain('"merges"');
    expect(text).toContain('"ids"');
    expect(text).toMatch(/only (the )?ids (that are )?listed/iu);
    expect(text).toMatch(/same type/iu);
    expect(text).toMatch(/do not drop|never drop|keeps? every/iu);
  });
});
