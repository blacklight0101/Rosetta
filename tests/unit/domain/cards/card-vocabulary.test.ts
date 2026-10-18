import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CARD_TYPES } from '../../../../src/domain/cards/card-vocabulary.js';

const architecture = await readFile('docs/architecture.md', 'utf8');

describe('CARD_TYPES', () => {
  it('Q-24 names FLOW and SCRN next to the first five types', () => {
    expect(CARD_TYPES).toEqual(['FEAT', 'BR', 'ENT', 'INT', 'OQ', 'FLOW', 'SCRN']);
  });

  it('RF-260 architecture section 5 lists exactly the types of the vocabulary', () => {
    // Prettier pads table cells to the column width, so the spaces after the first cell may be more than one.
    const row = /^\| `CardType` +\| (.+?) \|/m.exec(architecture)?.[1] ?? '';
    const listed = [...row.matchAll(/`(\w+)`/g)].map((match) => match[1]);

    expect(listed).toEqual([...CARD_TYPES]);
  });
});
