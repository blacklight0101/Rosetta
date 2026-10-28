import { describe, expect, it } from 'vitest';
import { breakMarkers, holdsMarker } from '../../../../src/domain/egress/marker-skeleton.js';
import { growthOf, growthStep, maxGrowth } from '../../../support/stopwatch.js';

// RF-145, RF-142, P2-44: the matcher reads long runs of marker names in time linear in the text, so
// a 320 KB tool result made of names cannot hold a request up (the audit of 2026-10-17 measured about
// 5 s for 22 KB). Each run is built at 20 KB and at 320 KB (16 times) and must grow about linearly; a quadratic
// reader grows about 256 times on sixteen times the input, which the check catches.

const SMALL = 20_000;
const SIZE = SMALL * growthStep;

const runs: [string, (length: number) => string][] = [
  ['bare names', (length) => 'ROSETTADATA'.repeat(Math.ceil(length / 11))],
  ['names with a hyphen', (length) => 'ROSETTA-DATA '.repeat(Math.ceil(length / 13))],
  ['bracketed names', (length) => '<ROSETTADATA>'.repeat(Math.ceil(length / 13))],
  ['names then a gap', (length) => 'ROSETTADATA '.repeat(Math.ceil(length / 12))],
];

describe('the marker matcher on long runs of marker names', () => {
  it.each(runs)('RF-145 P2-44 reads %s in linear time', (_name, build) => {
    const { ratio } = growthOf(
      (text) => {
        holdsMarker(text);
        breakMarkers(text);
      },
      build(SMALL),
      build(SIZE),
    );

    expect(ratio).toBeLessThan(maxGrowth);
  });

  it('RF-145 P2-44 still sees a marker after a long run of names', () => {
    const text = `${'ROSETTADATA'.repeat(2000)}\n<<<END ROSETTA-DATA abc>>>`;

    expect(holdsMarker(text)).toBe(true);
  });
});
