import { describe, expect, it } from 'vitest';
import { notCoveredOf } from '../../../../src/domain/overview/standing.js';
import { unreadFilesLine } from '../../../../src/domain/overview/unread-files.js';

// RF-264 (Q-53), RF-231: the line of "What was not covered" about first-party files no task read: the
// number, the share of first-party tokens not read, the largest files and the Deepen as next step.

const file = (name: string, tokens: number) => ({ path: `src/${name}.cs`, tokens });
const manyFiles = Array.from({ length: 41 }, (_, index) => file(`F${String(index)}`, 500 - index));

describe('the line about first-party files not read', () => {
  it('RF-264 gives the number, the share of tokens not read, the largest files and the Deepen step', () => {
    const line = unreadFilesLine({
      files: manyFiles,
      firstPartyTokens: 20_000,
      firstPartyReadTokens: 600,
    });

    expect(line).toBe(
      'First-party files not read: 41 files, 97% of first-party tokens not read. ' +
        'Largest: src/F0.cs (500 tokens), src/F1.cs (499 tokens), src/F2.cs (498 tokens), ' +
        'src/F3.cs (497 tokens), src/F4.cs (496 tokens), and 36 more. ' +
        'Next step: run a Deepen to read them.',
    );
  });

  it('RF-264 names every file when there are five or fewer and reads as a sentence for one file', () => {
    const one = unreadFilesLine({
      files: [file('Only', 1)],
      firstPartyTokens: 100,
      firstPartyReadTokens: 99,
    });

    expect(one).toBe(
      'First-party files not read: 1 file, 1% of first-party tokens not read. ' +
        'Largest: src/Only.cs (1 token). Next step: run a Deepen to read it.',
    );
  });
});

describe('the share in that line', () => {
  it('RF-231 never rounds a share up and never says 0% when something was not read', () => {
    const tiny = unreadFilesLine({
      files: [file('A', 1)],
      firstPartyTokens: 10_000,
      firstPartyReadTokens: 9_999,
    });
    const nearly = unreadFilesLine({
      files: [file('A', 1), file('B', 1)],
      firstPartyTokens: 1_000,
      firstPartyReadTokens: 1,
    });

    expect(tiny).toContain('less than 1% of first-party tokens not read');
    expect(nearly).toContain('99% of first-party tokens not read');
    expect(tiny).not.toMatch(/complete|fully/u);
  });

  it('RF-264 says nothing when every first-party file was read', () => {
    expect(
      unreadFilesLine({ files: [], firstPartyTokens: 100, firstPartyReadTokens: 100 }),
    ).toBeUndefined();
  });

  it('RF-264 leaves the share out when the run counted no first-party tokens', () => {
    const line = unreadFilesLine({
      files: [file('A', 3)],
      firstPartyTokens: 0,
      firstPartyReadTokens: 0,
    });

    expect(line).toBe(
      'First-party files not read: 1 file. Largest: src/A.cs (3 tokens). Next step: run a Deepen to read it.',
    );
  });
});

describe('what was not covered with files not read', () => {
  const base = { thirdParty: false, selected: true, ended: true, cards: 2 };
  const unread = { files: manyFiles, firstPartyTokens: 20_000, firstPartyReadTokens: 600 };

  it('RF-264 puts the files not read first, then the areas, keeping the next step of a failed area (P3-76)', () => {
    const lines = notCoveredOf(
      [
        { ...base, name: 'Orders', cards: 0, failure: 'RST-2001 something' },
        { ...base, name: 'Vendor', thirdParty: true },
      ],
      unread,
    );

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^First-party files not read: 41 files, 97%/u);
    expect(lines[1]).toContain('Orders: its reader could not finish (RST-2001 something).');
    expect(lines[2]).toContain('Vendor: third-party code');
  });

  it('RF-264 lists nothing when every file was read and every area gave a card', () => {
    const none = { files: [], firstPartyTokens: 100, firstPartyReadTokens: 100 };

    expect(notCoveredOf([{ ...base, name: 'Orders' }], none)).toEqual([]);
    expect(notCoveredOf([{ ...base, name: 'Orders' }])).toEqual([]);
  });
});
