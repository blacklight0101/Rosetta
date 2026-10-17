import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RNF-004, Q-25: the reader's flows and screens fragments are loaded with their version and the
// SHA-256 of their bytes, next to the other reader prompts.

async function sha256Of(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

describe('loadReaderPrompts: flows and screens', () => {
  it('RNF-004 loads the flows and screens fragments with their versions and hashes', async () => {
    const { surface } = await loadReaderPrompts('prompts');

    expect(surface?.flows).toMatchObject({ name: 'cards/flows.v1.md', version: 'v1' });
    expect(surface?.screens).toMatchObject({ name: 'cards/screens.v1.md', version: 'v1' });
    expect(surface?.flows.sha256).toBe(await sha256Of('prompts/cards/flows.v1.md'));
    expect(surface?.screens.sha256).toBe(await sha256Of('prompts/cards/screens.v1.md'));
  });
});
