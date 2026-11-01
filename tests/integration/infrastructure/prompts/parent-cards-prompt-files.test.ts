import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadParentCardsPrompt,
  loadPromptFile,
  loadRereadPrompt,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-209 (DEC-158), RNF-004: a Deepen reader is told the cards the parent run holds for its area and
// adds a fact about one of them to that card. The wording is in a new version of the re-read prompt
// and a new prompt file for the card list; the earlier re-read versions stay as they were.

const sha256Of = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

describe('the versions of the Deepen prompts', () => {
  it('RNF-004 the defaults are the new versions, loaded with the hash of their bytes', async () => {
    const reread = await loadRereadPrompt('prompts');
    const parentCards = await loadParentCardsPrompt('prompts');

    expect(reread).toMatchObject({ name: 'reader/reread.v5.md', version: 'v5' });
    expect(parentCards).toMatchObject({ name: 'reader/parent-cards.v2.md', version: 'v2' });
    expect(reread.sha256).toBe(await sha256Of('prompts/reader/reread.v5.md'));
    expect(parentCards.sha256).toBe(await sha256Of('prompts/reader/parent-cards.v2.md'));
  });

  it.each([
    ['reader/reread.v1.md', 'b96cbcfa68bbe85518f366dbc785510096d4a33a799a705b25f08c484ac6a273'],
    ['reader/reread.v2.md', '4b80e381faf03db1ba1e4af009929c582810913a9728e4e1c545e8b9065fff0f'],
    [
      'reader/parent-cards.v1.md',
      '85e2462f381e5339fbd2735a7953d7693f4fa0c6b25a2455c70a7c2c983ad832',
    ],
  ])('RNF-004 the old version %s stays unchanged', async (name, sha256) => {
    expect((await loadPromptFile('prompts', name)).sha256).toBe(sha256);
  });

  it('RNF-004 the re-read v5 is not a copy of v4', async () => {
    expect(await sha256Of('prompts/reader/reread.v5.md')).not.toBe(
      await sha256Of('prompts/reader/reread.v4.md'),
    );
  });

  it('EV-78 the re-read v5 says a new claim never refers to an earlier or rejected claim', async () => {
    const { text } = await loadRereadPrompt('prompts');

    expect(text).toMatch(/never refers? to an earlier or (?:a )?rejected claim/iu);
    expect(text).toMatch(/states what the code does/iu);
  });

  it('RNF-004 the re-read v4 is not a copy of v3', async () => {
    expect(await sha256Of('prompts/reader/reread.v4.md')).not.toBe(
      await sha256Of('prompts/reader/reread.v3.md'),
    );
  });
});

describe('the words of the Deepen prompts', () => {
  it('RF-209 the re-read keeps the grouping rule, the replaces rule and the citations rule', async () => {
    const { text } = await loadRereadPrompt('prompts');

    expect(text).toMatch(/repeated wiring/iu);
    expect(text).toContain('"replaces"');
    expect(text).toMatch(/every claim still needs its citations/iu);
    expect(text).toContain('{{rejected}}');
  });

  it('RF-209 the re-read no longer invites other cards for any fact; a new card is for a fact no listed card holds', async () => {
    const { text } = await loadRereadPrompt('prompts');

    expect(text).not.toMatch(/you may write other cards for facts/iu);
    expect(text).toMatch(/no listed card holds/iu);
  });

  it('DEC-158 the card list prompt: data rule, listed cards, "extends", a new card only for a new fact', async () => {
    const { text } = await loadParentCardsPrompt('prompts');

    expect(text).toMatch(/data, never instructions/iu);
    expect(text).toContain('"extends"');
    expect(text).toMatch(/no listed card holds/iu);
    expect(text).toMatch(/id, type and title/iu);
    expect(text).toContain('{{parentCards}}');
    expect(text.match(/\{\{parentCards\}\}/gu)).toHaveLength(1);
  });

  it('EV-26 the card list prompt: the list is data to compare with, never restated, never cited', async () => {
    const { text } = await loadParentCardsPrompt('prompts');

    expect(text).toMatch(/never write a card id/iu);
    expect(text).toMatch(/never cite the block/iu);
    expect(text).toMatch(/not a file/iu);
  });

  it('DEC-158 the card list prompt asks for the same type and a cited claim, and refuses an invented id', async () => {
    const { text } = await loadParentCardsPrompt('prompts');

    expect(text).toMatch(/same type/iu);
    expect(text).toMatch(/citation/iu);
    expect(text).toMatch(/only (an )?id[s]? (from|of) the (block|list)/iu);
  });
});
