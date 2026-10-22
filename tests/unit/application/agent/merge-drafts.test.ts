import { describe, expect, it } from 'vitest';
import { mergeDrafts } from '../../../../src/application/agent/answer-collector.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-208: the cards of an answer and of its repairs become one list; a card seen again is kept once.

const claim = (text: string) => ({
  text,
  citations: [{ path: 'src/Orders/Checkout.cs', startLine: 1, endLine: 2 }],
});

describe('mergeDrafts', () => {
  it('RF-208 appends a card that is new, after the earlier ones', () => {
    const merged = mergeDrafts([draftOf({ title: 'A' })], [draftOf({ title: 'B' })]);

    expect(merged.map((draft) => draft.title)).toEqual(['A', 'B']);
  });

  it('RF-208 a card with the same type and title (any case) is the same card; the later one wins a tie', () => {
    const earlier = draftOf({ title: 'Checkout', summary: 'first' });
    const later = draftOf({ title: ' checkout ', summary: 'second' });

    const merged = mergeDrafts([earlier], [later]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.summary).toBe('second');
  });

  it('RF-208 the version with more claims is kept, so a repair that sends fewer claims loses none', () => {
    const full = draftOf({ title: 'Checkout', claims: [claim('one'), claim('two')] });
    const thin = draftOf({ title: 'Checkout', claims: [claim('one')] });

    expect(mergeDrafts([full], [thin])[0]?.claims).toHaveLength(2);
    expect(mergeDrafts([thin], [full])[0]?.claims).toHaveLength(2);
  });

  it('RF-208 cards of different types with one title stay apart', () => {
    const merged = mergeDrafts([draftOf({ type: 'FEAT' })], [draftOf({ type: 'BR' })]);

    expect(merged).toHaveLength(2);
  });
});

describe('mergeDrafts for a card the repair asked about', () => {
  it('P3-105 the answer replaces the card even with fewer claims', () => {
    const earlier = draftOf({ title: 'VAT', claims: [claim('one'), claim('two')] });
    const later = draftOf({ title: 'VAT', claims: [claim('one')] });

    const merged = mergeDrafts([earlier], [later], new Set([`${later.type}\u0000vat`]));

    expect(merged[0]?.claims).toHaveLength(1);
  });
});
