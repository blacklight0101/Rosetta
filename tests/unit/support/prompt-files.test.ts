import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAgentPrompt, listPromptFiles } from '../../support/prompt-files.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-145, P1-90: the prompt tests check every prompt file under prompts/, in any folder.

const root = useTempRoot('rst-prompts-');

async function put(path: string): Promise<void> {
  const absolute = join(root.path, ...path.split('/'));
  await mkdir(join(absolute, '..'), { recursive: true });
  await writeFile(absolute, 'text\n');
}

describe('listPromptFiles', () => {
  it('RF-145 lists the prompt files of every folder, also folders no list names', async () => {
    for (const path of ['reader/area.v1.md', 'cards/repair.v1.md', 'judge/claim.v1.md']) {
      await put(path);
    }

    expect(await listPromptFiles(root.path)).toEqual([
      'cards/repair.v1.md',
      'judge/claim.v1.md',
      'reader/area.v1.md',
    ]);
  });

  it('RF-145 lists files in nested folders and at the root, whatever their extension', async () => {
    for (const path of ['top.md', 'reader/extra/deep.v1.md', 'reader/notes.txt', '.gitkeep']) {
      await put(path);
    }

    expect(await listPromptFiles(root.path)).toEqual([
      'reader/extra/deep.v1.md',
      'reader/notes.txt',
      'top.md',
    ]);
  });

  it('RF-145 a file in a new folder is an agent prompt; fragments are not', () => {
    expect(isAgentPrompt('judge/claim.v1.md')).toBe(true);
    expect(isAgentPrompt('cards/repair.v1.md')).toBe(false);
    expect(isAgentPrompt('shared/text-tool-protocol.v1.md')).toBe(false);
    expect(isAgentPrompt('catalogue/solid.v1.md')).toBe(false);
  });
});
