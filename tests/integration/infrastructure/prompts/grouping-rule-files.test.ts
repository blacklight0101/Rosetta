import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadPromptFile,
  loadReaderPrompts,
  loadRereadPrompt,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-202 (DEC-157), RNF-004: the reader prompts carry one short rule that groups repeated wiring into
// one claim. The rule is in new versions of the area, workbook and re-read prompts; the old versions stay.

const sha256Of = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

async function textsWithTheRule(): Promise<Record<string, string>> {
  const prompts = await loadReaderPrompts('prompts');
  return {
    area: prompts.system.text,
    workbook: prompts.workbook?.text ?? '',
    reread: (await loadRereadPrompt('prompts')).text,
  };
}

const oldVersions = [
  ['reader/area.v3.md', '6dda0756d3ce51d4f7d62f6db60cb5504a77a20488ea9cd66ee7b2dd56630149'],
  ['reader/workbook.v1.md', '1cbd72282def68ab1d17c2f5d110a720fafa7455894b5b94dc9913d0b3108505'],
  ['reader/reread.v1.md', 'b96cbcfa68bbe85518f366dbc785510096d4a33a799a705b25f08c484ac6a273'],
] as const;

const newVersions = [
  ['area.v3', 'area.v4'],
  ['workbook.v1', 'workbook.v2'],
  ['reread.v1', 'reread.v2'],
] as const;

describe.each(['area', 'workbook', 'reread'] as const)(
  'the grouping rule in the %s prompt',
  (which) => {
    it('RF-202 states the rule: one claim, the controls or the range, representative lines, a separate claim', async () => {
      const text = (await textsWithTheRule())[which] ?? '';

      expect(text).toMatch(/repeated wiring/iu);
      expect(text).toMatch(/one claim/iu);
      expect(text).toMatch(/lists? the controls or the range/iu);
      expect(text).toMatch(/representative/iu);
      expect(text).toMatch(/separate claim/iu);
      expect(text).toMatch(/differs/iu);
    });

    it('RF-202 carries a short generic example', async () => {
      const text = (await textsWithTheRule())[which] ?? '';

      expect(text).toMatch(/Example:/u);
      expect(text).toMatch(/Day1/u);
    });

    it('RF-207 still asks for citations on every claim', async () => {
      const text = (await textsWithTheRule())[which] ?? '';

      expect(text).toMatch(/cit(e|es|ing|ation|ations)\b/iu);
      expect(text).toMatch(/every claim/iu);
    });
  },
);

describe('the versions of the reader prompts', () => {
  it('RNF-004 the defaults are the new versions, loaded with the hash of their bytes', async () => {
    const prompts = await loadReaderPrompts('prompts');
    const reread = await loadRereadPrompt('prompts');

    expect(prompts.system).toMatchObject({ name: 'reader/area.v12.md', version: 'v12' });
    expect(prompts.workbook).toMatchObject({ name: 'reader/workbook.v5.md', version: 'v5' });
    // P7-22: the re-read default moved on to v5, which keeps the rule (parent-cards-prompt-files.test.ts).
    expect(reread).toMatchObject({ name: 'reader/reread.v5.md', version: 'v5' });
  });

  it.each(oldVersions)(
    'RNF-004 the old version %s stays unchanged, without the rule',
    async (name, sha256) => {
      const file = await loadPromptFile('prompts', name);

      expect(file.sha256).toBe(sha256);
      expect(file.text).not.toMatch(/repeated wiring/iu);
    },
  );

  it.each(newVersions)('RNF-004 %s is not a copy of %s', async (before, after) => {
    expect(await sha256Of(`prompts/reader/${after}.md`)).not.toBe(
      await sha256Of(`prompts/reader/${before}.md`),
    );
  });
});

describe('the size of the reader prompts', () => {
  it.each([
    ['area.v3', 'area.v4'],
    ['reread.v1', 'reread.v2'],
    ['workbook.v1', 'workbook.v2'],
  ] as const)('RF-202 %s grows by at most 700 characters in %s', async (before, after) => {
    const size = async (name: string) =>
      (await readFile(`prompts/reader/${name}.md`, 'utf8')).length;

    expect((await size(after)) - (await size(before))).toBeLessThanOrEqual(700);
  });

  it('RF-207 the card format still asks for path:startLine-endLine citations', async () => {
    const prompts = await loadReaderPrompts('prompts');

    expect(prompts.cardFormat.text).toMatch(/path:startLine-endLine/u);
  });
});
