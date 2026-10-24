import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadPromptFile,
  loadReaderPrompts,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-243 (Q-46), RNF-004: the reader prompts carry a short list of questions to read instead of ask.
// The rule is in new versions of the area and workbook prompts; the earlier versions stay unchanged.

const oldVersions = [
  ['reader/area.v4.md', '73d8204ea4531826051be0344eddd61022dab225bec185f04c5e904d71e74ecc'],
  ['reader/workbook.v2.md', '1e3b6edc64e59f77d36c9d025d314a7aab5b8b8b502336776b3cd89b41fdb84f'],
  ['reader/area.v5.md', '59059b03bcaac885cdf202c72fe38e13d8598688eacc45fbc1e3c8f8c505dfa2'],
  ['reader/workbook.v3.md', 'b46d124bde81292b0ef3aa06d61ce178dfde7ff48455342a0d833a6c5579cad3'],
] as const;

async function textsWithTheRule(): Promise<Record<string, string>> {
  const prompts = await loadReaderPrompts('prompts');
  return { area: prompts.system.text, workbook: prompts.workbook?.text ?? '' };
}

describe.each(['area', 'workbook'] as const)('the questions rule in the %s prompt', (which) => {
  it('RF-243 tells the reader to read, not ask, for a value, a formula, a count, columns or a match', async () => {
    const text = (await textsWithTheRule())[which] ?? '';

    expect(text).toMatch(/read, do not ask/iu);
    for (const word of [
      /a value/iu,
      /a formula/iu,
      /a count/iu,
      /columns or headers/iu,
      /match/iu,
    ]) {
      expect(text).toMatch(word);
    }
  });

  it('RF-243 gives examples of questions to read instead of ask', async () => {
    const text = (await textsWithTheRule())[which] ?? '';

    expect(text).toMatch(/Do not ask:/u);
    expect(text).toMatch(/formula logic used in column F/u);
    expect(text).toMatch(/What does this function return\?/u);
  });

  it('RF-243 keeps the questions about intent, reasons, systems, volumes and users', async () => {
    const text = (await textsWithTheRule())[which] ?? '';

    expect(text).toMatch(/Ask:/u);
    expect(text).toMatch(/Why is the discount capped at 10%\?/u);
    expect(text).toMatch(/REPAIR, DAMAGED and USABLE mean/u);
  });
});

describe('the versions of the reader prompts', () => {
  it('RNF-004 the defaults are the new versions, loaded with the hash of their bytes', async () => {
    const prompts = await loadReaderPrompts('prompts');

    expect(prompts.system).toMatchObject({ name: 'reader/area.v12.md', version: 'v12' });
    expect(prompts.workbook).toMatchObject({ name: 'reader/workbook.v5.md', version: 'v5' });
  });

  it.each(oldVersions)(
    'RNF-004 the old version %s stays unchanged, without the rule',
    async (name, sha256) => {
      const file = await loadPromptFile('prompts', name);

      expect(file.sha256).toBe(sha256);
      expect(file.text).not.toMatch(/read, do not ask/iu);
    },
  );

  it.each([
    ['area.v5', 'area.v6'],
    ['workbook.v3', 'workbook.v4'],
  ] as const)('RF-243 %s grows by at most 900 characters in %s', async (before, after) => {
    const size = async (name: string) =>
      (await readFile(`prompts/reader/${name}.md`, 'utf8')).length;

    expect((await size(after)) - (await size(before))).toBeLessThanOrEqual(900);
  });
});
