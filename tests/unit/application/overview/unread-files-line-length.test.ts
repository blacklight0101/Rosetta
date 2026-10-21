import { describe, expect, it } from 'vitest';
import {
  parseOverview,
  serialiseOverview,
} from '../../../../src/application/overview/overview-file.js';
import { notCoveredOf } from '../../../../src/domain/overview/standing.js';
import { unreadFilesLine } from '../../../../src/domain/overview/unread-files.js';

// RF-264 (Q-53): the line about first-party files not read always fits what `overview.json` accepts
// for a line (1000 characters), however deep the paths are, so the overview is never lost for it.

const deep = (name: string): string => `${'segment/'.repeat(25)}${name.padEnd(6, 'x')}.java`;
const unread = {
  files: ['A', 'B', 'C', 'D', 'E', 'F'].map((name, index) => ({
    path: deep(name),
    tokens: 900 - index,
  })),
  firstPartyTokens: 10_000,
  firstPartyReadTokens: 500,
};

describe('the line about files not read with deep paths', () => {
  it('RF-264 stays under 1000 characters and keeps the count, the share and the Deepen step', () => {
    const line = unreadFilesLine(unread) ?? '';

    expect(line.length).toBeLessThan(1000);
    expect(line).toContain('6 files, 95% of first-party tokens not read.');
    expect(line).toContain('Next step: run a Deepen to read them.');
    expect(line).toContain('Aaxxxx.java');
  });

  it('RF-264 round-trips through overview.json, so the overview is not lost', () => {
    const overview = {
      state: 'full' as const,
      sections: [],
      notCovered: notCoveredOf([], unread),
      questions: [],
    };

    expect(parseOverview(serialiseOverview(overview))).toEqual(overview);
  });

  it('RF-264 a path of the longest length the code map accepts still fits', () => {
    const long = { ...unread, files: [{ path: 'd/'.repeat(511) + 'x', tokens: 5 }] };

    expect((unreadFilesLine(long) ?? '').length).toBeLessThan(1000);
  });
});
