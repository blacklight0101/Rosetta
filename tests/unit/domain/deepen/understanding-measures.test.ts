import { describe, expect, it } from 'vitest';
import {
  readFirstPartyFiles,
  understandingMeasures,
  type MeasureInput,
} from '../../../../src/domain/deepen/understanding-measures.js';
import { entry } from '../../../support/code-map-builders.js';
import {
  cardOf,
  claimOf,
  coverageOf,
  deepenFiles,
  libraryPath,
} from '../../../support/deepen-fixtures.js';

// RF-231: the honest measures of an understand run.

const own = coverageOf('src', [
  { path: 'src/a.cs', read: 50 },
  { path: 'src/b.cs', read: 300 },
  { path: 'src/c.cs', read: 0 },
]);
const library = coverageOf('Scripts', [{ path: libraryPath, read: 1000 }]);

function measured(overrides: Partial<MeasureInput> = {}) {
  return understandingMeasures({
    cards: [],
    coverage: [own, library],
    files: deepenFiles,
    ...overrides,
  });
}

describe('understandingMeasures coverage', () => {
  it('RF-231 counts first-party tokens only and shows third-party code apart', () => {
    const measures = measured();

    expect(measures.firstPartyTokens).toBe(450);
    expect(measures.firstPartyReadTokens).toBe(350);
    expect(measures.firstPartyCoverage).toBe(0.7778);
    expect(measures.thirdParty).toEqual({ files: 1, tokens: 1000, claims: 0 });
  });

  it('RF-231 lists the first-party files not read, largest first, and never a library', () => {
    const unread = coverageOf('src', [
      { path: 'src/a.cs', read: 0 },
      { path: 'src/b.cs', read: 0 },
      { path: 'src/c.cs', read: 0 },
    ]);
    const measures = measured({
      coverage: [unread, coverageOf('Scripts', [{ path: libraryPath, read: 0 }])],
    });

    expect(measures.filesNotRead).toEqual([
      { path: 'src/b.cs', tokens: 300 },
      { path: 'src/a.cs', tokens: 100 },
      { path: 'src/c.cs', tokens: 50 },
    ]);
  });

  it('RF-231 joins the lines several tasks read of one file', () => {
    const first = coverageOf('src', [{ path: 'src/a.cs', read: 30 }]);
    const again = { ...coverageOf('src', [{ path: 'src/a.cs', read: 0 }]) };
    const later = {
      ...again,
      files: [{ path: 'src/a.cs', read: [{ startLine: 21, endLine: 60 }] }],
    };

    const measures = measured({ coverage: [first, later], files: [entry('src/a.cs', 100)] });

    expect(measures.firstPartyReadTokens).toBe(60);
    expect(measures.firstPartyCoverage).toBe(0.6);
  });

  it('RF-231 has no coverage share for a run with no first-party tokens', () => {
    expect(measured({ coverage: [library] }).firstPartyCoverage).toBeNull();
  });
});

describe('understandingMeasures claims', () => {
  const cards = [
    cardOf('src', [
      claimOf('BR-001.c1', 'Supported', ['src/a.cs']),
      claimOf('BR-001.c2', 'Rejected', ['src/a.cs']),
      claimOf('BR-001.c3', 'Rejected', ['src/b.cs']),
      claimOf('BR-001.c4', 'Unverified', ['src/b.cs']),
      claimOf('BR-001.c5', 'Proposed', ['src/b.cs']),
      claimOf('BR-001.c6', 'CitationInvalid', ['src/b.cs']),
    ]),
    cardOf('src', [
      claimOf('BR-002.c1', 'Supported', ['src/a.cs'], { replaces: 'BR-001.c2' }),
      claimOf('BR-002.c2', 'Rejected', ['src/b.cs'], { replaces: 'BR-001.c3' }),
    ]),
    cardOf('Scripts', [
      claimOf('BR-003.c1', 'Supported', [libraryPath]),
      claimOf('BR-003.c2', 'Rejected', [libraryPath]),
    ]),
  ];

  it('RF-231 states the Supported share of the judged first-party claims with its counts', () => {
    const measures = measured({ cards });

    expect(measures.supported).toBe(2);
    expect(measures.rejected).toBe(3);
    expect(measures.supportedShare).toBe(0.4);
    expect(measures.thirdParty.claims).toBe(2);
  });

  it('RF-231 counts the claims left Unverified or not judged', () => {
    expect(measured({ cards }).notJudged).toBe(2);
  });

  it('RF-231 counts the rejected claims without a supported replacement', () => {
    // BR-001.c2 has a supported replacement; BR-001.c3's replacement was rejected; BR-002.c2 has none.
    expect(measured({ cards }).rejectedUnresolved).toBe(2);
  });

  it('RF-231 lists the claims supported after a re-read apart', () => {
    expect(measured({ cards }).supportedAfterReread).toBe(1);
  });

  it('RF-231 has no Supported share when no first-party claim was judged', () => {
    expect(measured({ cards: [] }).supportedShare).toBeNull();
  });
});

describe('understandingMeasures well covered', () => {
  const files = [entry('src/a.cs', 100)];
  const read = (lines: number) => [coverageOf('src', [{ path: 'src/a.cs', read: lines }])];
  const supported = [cardOf('src', [claimOf('BR-001.c1', 'Supported', ['src/a.cs'])])];
  const unverified = [cardOf('src', [claimOf('BR-001.c1', 'Unverified', ['src/a.cs'])])];

  it('RF-231 calls a run well covered at 80% of the first-party tokens with no claim unjudged', () => {
    expect(understandingMeasures({ cards: supported, coverage: read(80), files }).wellCovered).toBe(
      true,
    );
  });

  it('RF-231 does not call a run well covered under 80%', () => {
    expect(understandingMeasures({ cards: supported, coverage: read(79), files }).wellCovered).toBe(
      false,
    );
  });

  it('RF-231 does not call a run well covered while a claim is Unverified', () => {
    expect(
      understandingMeasures({ cards: unverified, coverage: read(100), files }).wellCovered,
    ).toBe(false);
  });

  it('RF-231 does not count third-party code read towards well covered', () => {
    const coverage = [coverageOf('Scripts', [{ path: libraryPath, read: 1000 }]), ...read(0)];
    const all = [...files, entry(libraryPath, 1000)];

    expect(understandingMeasures({ cards: supported, coverage, files: all }).wellCovered).toBe(
      false,
    );
  });
});

describe('readFirstPartyFiles', () => {
  it('RF-209 names the first-party files some task read lines of', () => {
    expect([...readFirstPartyFiles({ coverage: [own, library], files: deepenFiles })]).toEqual([
      'src/a.cs',
      'src/b.cs',
    ]);
  });
});
