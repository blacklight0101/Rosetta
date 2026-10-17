import { describe, expect, it } from 'vitest';
import {
  citesAnyPath,
  hitsAbsence,
  matchesFinding,
} from '../../../../src/domain/eval/claim-match.js';
import { absence, claim, finding } from '../../../support/eval-fixtures.js';

// RNF-006, RNF-015, DEC-57: how a claim of a run is compared with the hand-checked golden set: a
// finding is matched by a claim of an accepted card type that cites lines overlapping its evidence
// and names one of its keywords; an absence is hit by a claim whose words state what is not in the
// code.

describe('a claim against a golden finding', () => {
  it('RNF-006 matches when a citation overlaps the evidence and a keyword is named', () => {
    const rule = finding({ evidence: ['Models/Item.cs:20-24'], keywords: ['price'] });

    expect(matchesFinding(claim({ text: 'The Price must be positive.' }), rule)).toBe(true);
    const touching = claim({ citations: ['Models/Item.cs:24-30'], text: 'price' });
    expect(matchesFinding(touching, rule)).toBe(true);
  });

  it('RNF-006 does not match lines next to the evidence, another file or no keyword', () => {
    const rule = finding({ evidence: ['Models/Item.cs:20-24'], keywords: ['price'] });

    expect(matchesFinding(claim({ citations: ['Models/Item.cs:25-30'] }), rule)).toBe(false);
    expect(matchesFinding(claim({ citations: ['Models/Other.cs:20-24'] }), rule)).toBe(false);
    expect(matchesFinding(claim({ text: 'The stock is kept.' }), rule)).toBe(false);
  });

  it('RNF-006 reads the keyword in the card title too, in any case', () => {
    const rule = finding({ keywords: ['Catalog Item'] });

    expect(matchesFinding(claim({ cardTitle: 'CATALOG ITEM', text: 'It has an id.' }), rule)).toBe(
      true,
    );
  });

  it('RNF-006 keeps to the card types a finding accepts, any type when it names none', () => {
    const entity = finding({ cardTypes: ['ENT'] });

    expect(matchesFinding(claim({ cardType: 'BR' }), entity)).toBe(false);
    expect(matchesFinding(claim({ cardType: 'ENT' }), entity)).toBe(true);
    expect(matchesFinding(claim({ cardType: 'SCRN' }), finding({ cardTypes: [] }))).toBe(true);
  });

  it('RNF-006 finds the paths a claim cites', () => {
    const cited = claim({ citations: ['Models/Item.cs:1-2', 'Services/Store.cs:3-4'] });

    expect(citesAnyPath(cited, new Set(['Services/Store.cs']))).toBe(true);
    expect(citesAnyPath(cited, new Set(['Default.aspx.cs']))).toBe(false);
  });
});

describe('a claim against a "not in the code" case', () => {
  it('RNF-015 DEC-57 is hit when every word of one pattern is in the claim', () => {
    const reorder = absence({ claimPatterns: [['reorder', 'automatic'], ['email']] });

    expect(
      hitsAbsence(claim({ text: 'An automatic Reorder starts at the threshold.' }), reorder),
    ).toBe(true);
    expect(hitsAbsence(claim({ text: 'An email goes to the buyer.' }), reorder)).toBe(true);
    expect(hitsAbsence(claim({ text: 'The reorder flag is stored.' }), reorder)).toBe(false);
  });

  it('RNF-015 is not hit when the claim names one of the words that state the absence', () => {
    const reorder = absence({ claimPatterns: [['reorder']], unless: ['no code', 'never'] });

    expect(
      hitsAbsence(claim({ text: 'Nothing will ever reorder: no code sets it.' }), reorder),
    ).toBe(false);
    expect(hitsAbsence(claim({ text: 'Items reorder by themselves.' }), reorder)).toBe(true);
  });
});

describe('a claim against a golden finding: whole words', () => {
  it('RNF-006 matches a keyword as a whole word, never inside another word', () => {
    const size = finding({ keywords: ['10'] });
    const add = finding({ keywords: ['add'] });

    expect(matchesFinding(claim({ text: 'A page shows 100 items.' }), size)).toBe(false);
    expect(matchesFinding(claim({ text: 'A page shows 10 items.' }), size)).toBe(true);
    expect(matchesFinding(claim({ text: 'The address is kept.' }), add)).toBe(false);
    expect(matchesFinding(claim({ text: 'A clerk adds an item.' }), add)).toBe(true);
  });

  it('RNF-006 reads the -s, -ed and -ing forms of a keyword, and a stem ending in * as a word start', () => {
    const page = finding({ keywords: ['page'] });
    const stem = finding({ keywords: ['generat*'] });

    expect(matchesFinding(claim({ text: 'The items are paged.' }), page)).toBe(true);
    expect(matchesFinding(claim({ text: 'The paging is done in SQL.' }), page)).toBe(true);
    expect(matchesFinding(claim({ text: 'The pager is hidden.' }), page)).toBe(false);
    expect(matchesFinding(claim({ text: 'The id is generated.' }), stem)).toBe(true);
    expect(matchesFinding(claim({ text: 'It regenerates the list.' }), stem)).toBe(false);
  });
});

describe('a claim against a "not in the code" case: whole words', () => {
  it('RNF-015 DEC-57 reads the pattern and the unless words as whole words', () => {
    const remove = absence({ claimPatterns: [['delet*']], unless: ['no'] });

    expect(hitsAbsence(claim({ text: 'Nothing deletes an item.' }), remove)).toBe(true);
    expect(hitsAbsence(claim({ text: 'No page deletes an item.' }), remove)).toBe(false);
    expect(hitsAbsence(claim({ text: 'The item is undeleted.' }), remove)).toBe(false);
  });
});
