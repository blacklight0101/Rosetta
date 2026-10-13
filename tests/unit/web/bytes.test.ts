import { describe, expect, it } from 'vitest';
import { bytesText } from '../../../web/src/lib/bytes.js';

// RF-1012: the space a deletion frees, written as the History artboard writes it (decimal units, one
// decimal from a kilobyte up).

describe('bytesText', () => {
  it.each([
    [0, '0 B'],
    [5, '5 B'],
    [999, '999 B'],
    [1000, '1.0 kB'],
    [2048, '2.0 kB'],
    [3_200_000, '3.2 MB'],
    [18_400_000, '18.4 MB'],
    [2_500_000_000, '2.5 GB'],
  ])('RF-1012 writes %i bytes as %s', (bytes, text) => {
    expect(bytesText(bytes)).toBe(text);
  });
});
