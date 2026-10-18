import { describe, expect, it } from 'vitest';
import { breakMarkers, holdsMarker } from '../../../../src/domain/egress/marker-skeleton.js';

// RF-145, P2-44: a header is the name, then at most one word, then `{` (a forged tag or none), with
// no brackets and no END. The walk over that one word must keep working however long the word is.

describe('the marker matcher and a header without brackets', () => {
  it.each([
    'ROSETTA-DATA abc {',
    'ROSETTADATA word {',
    'ROSETTADATA  word  {',
    'ROSETTADATA {',
    `ROSETTADATA ${'a'.repeat(200)} {`,
  ])('RF-145 P2-44 sees %s as a marker', (text) => {
    expect(holdsMarker(text)).toBe(true);
    expect(breakMarkers(text)).toContain('|');
  });

  it.each(['ROSETTADATA one two {', 'ROSETTADATA abc', `ROSETTADATA ${'a'.repeat(200)} two {`])(
    'RF-145 P2-44 does not see %s as a marker',
    (text) => {
      expect(holdsMarker(text)).toBe(false);
    },
  );
});
