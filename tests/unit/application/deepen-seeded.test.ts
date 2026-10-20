import { describe, expect, it } from 'vitest';
import { seededCounts } from '../../../src/application/deepen/deepen-events.js';
import { cardOf, claimOf, libraryPath } from '../../support/deepen-fixtures.js';

// RF-209, RF-231: the counts a Deepen announces for the cards it starts from. Every claim is in
// exactly one group, so the groups add up to the claims.

describe('RF-209 the claims a Deepen starts from', () => {
  const cards = [
    cardOf('Core', [
      claimOf('BR-001.c1', 'Supported', ['src/a.cs']),
      claimOf('BR-001.c2', 'Rejected', ['src/b.cs']),
      claimOf('BR-001.c3', 'CitationInvalid', ['src/a.cs']),
      claimOf('BR-001.c4', 'Unverified', ['src/c.cs']),
      claimOf('BR-001.c5', 'Proposed', ['src/c.cs']),
    ]),
    cardOf('Lib', [
      claimOf('BR-002.c1', 'Rejected', [libraryPath]),
      claimOf('BR-002.c2', 'CitationInvalid', ['src/b.cs']),
    ]),
  ];

  it('RF-209 counts every status, so the groups add up to the claims', () => {
    const seeded = seededCounts(cards);

    expect(seeded).toEqual({
      cards: 2,
      claims: 7,
      supported: 1,
      rejected: 2,
      citationInvalid: 2,
      notJudged: 2,
    });
    const { claims, ...groups } = seeded;
    const parts = [groups.supported, groups.rejected, groups.citationInvalid, groups.notJudged];
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(claims);
  });
});
