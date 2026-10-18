import { describe, expect, it } from 'vitest';
import { breakMarkers, holdsMarker } from '../../../../src/domain/egress/marker-skeleton.js';

// RF-145, RF-142, P2-44: the matcher reads long runs of marker names in time linear in the text, so
// a 60 KB tool result made of names cannot hold a request up (the audit of 2026-10-17 measured about
// 5 s for 22 KB). The limit is far above the linear time and far below the quadratic one.

const LIMIT_MS = 1500;
const SIZE = 60_000;

const runs: [string, string][] = [
  ['bare names', 'ROSETTADATA'.repeat(Math.ceil(SIZE / 11))],
  ['names with a hyphen', 'ROSETTA-DATA '.repeat(Math.ceil(SIZE / 13))],
  ['bracketed names', '<ROSETTADATA>'.repeat(Math.ceil(SIZE / 13))],
  ['names then a gap', 'ROSETTADATA '.repeat(Math.ceil(SIZE / 12))],
];

describe('the marker matcher on long runs of marker names', () => {
  it.each(runs)('RF-145 P2-44 reads %s in linear time', (_name, text) => {
    const start = performance.now();

    holdsMarker(text);
    breakMarkers(text);

    expect(performance.now() - start).toBeLessThan(LIMIT_MS);
  });

  it('RF-145 P2-44 still sees a marker after a long run of names', () => {
    const text = `${'ROSETTADATA'.repeat(2000)}\n<<<END ROSETTA-DATA abc>>>`;

    expect(holdsMarker(text)).toBe(true);
  });
});
