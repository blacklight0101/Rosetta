import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { renderRepairRequest } from '../../../../src/application/cards/repair-request.js';
import {
  loadPromptFile,
  loadReaderPrompts,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-202 (Q-47), RNF-004: the reader prompts say that a citation uses the line numbers read_file
// shows, and the repair prompt names the citations that were dropped. New versions; old ones stay.

const sha256Of = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const oldVersions = [
  ['reader/area.v4.md', '73d8204ea4531826051be0344eddd61022dab225bec185f04c5e904d71e74ecc'],
  ['reader/workbook.v2.md', '1e3b6edc64e59f77d36c9d025d314a7aab5b8b8b502336776b3cd89b41fdb84f'],
  ['cards/repair.v1.md', 'eb55b847fcea5faab134f410b3db03c60dbf165070872ead0392a2914ab0a640'],
] as const;

describe('the reader prompts and the line numbers', () => {
  it('RNF-004 the defaults are the new versions, loaded with the hash of their bytes', async () => {
    const prompts = await loadReaderPrompts('prompts');

    expect(prompts.system).toMatchObject({ name: 'reader/area.v12.md', version: 'v12' });
    expect(prompts.workbook).toMatchObject({ name: 'reader/workbook.v5.md', version: 'v5' });
    expect(prompts.repair).toMatchObject({ name: 'cards/repair.v5.md', version: 'v5' });
    expect(prompts.system.sha256).toBe(await sha256Of('prompts/reader/area.v12.md'));
  });

  it('RF-202 the area prompt says read_file numbers its lines and a citation uses these numbers', async () => {
    const text = (await loadReaderPrompts('prompts')).system.text;

    expect(text).toMatch(/number before the colon|each line starts with its number/iu);
    expect(text).toMatch(/citation uses (these|the) (line )?numbers/iu);
    expect(text).toMatch(/never the text of a line/iu);
  });

  it('RF-202 the workbook prompt tells a row label from a line number', async () => {
    const text = (await loadReaderPrompts('prompts')).workbook?.text ?? '';

    expect(text).toMatch(/row label/iu);
    expect(text).toMatch(/not a line number/iu);
    expect(text).toMatch(/citation uses the line number/iu);
  });

  it('RF-202 the repair prompt names the dropped citations and the form', async () => {
    const { repair } = await loadReaderPrompts('prompts');
    const text = renderRepairRequest(repair.text, [
      { path: 'cards.0.claims.0.citations.0', message: 'Not a citation.' },
    ]);

    expect(text).toContain('cards.0.claims.0.citations.0');
    expect(repair.text).toMatch(/path:startLine-endLine/u);
    expect(repair.text).toMatch(/line numbers/iu);
    expect(repair.text.split('{{problems}}')).toHaveLength(2);
  });

  it('RF-207 the new area and workbook prompts still ask for a citation on every claim', async () => {
    const prompts = await loadReaderPrompts('prompts');

    for (const text of [prompts.system.text, prompts.workbook?.text ?? '']) {
      expect(text).toMatch(/every claim/iu);
      expect(text).toMatch(/repeated wiring/iu);
    }
  });
});

describe('the old versions stay', () => {
  it.each(oldVersions)(
    'RNF-004 %s is unchanged and does not mention the numbers',
    async (name, sha256) => {
      const file = await loadPromptFile('prompts', name);

      expect(file.sha256).toBe(sha256);
      expect(file.text).not.toMatch(/citation uses (these|the) (line )?numbers/iu);
      expect(file.text).not.toMatch(/not a line number/iu);
    },
  );

  it('RNF-004 each new version differs from the old one', async () => {
    for (const [before, after] of [
      ['reader/area.v4.md', 'reader/area.v5.md'],
      ['reader/workbook.v2.md', 'reader/workbook.v3.md'],
      ['cards/repair.v1.md', 'cards/repair.v2.md'],
    ] as const) {
      expect(await sha256Of(`prompts/${after}`)).not.toBe(await sha256Of(`prompts/${before}`));
    }
  });
});
