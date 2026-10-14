import { describe, expect, it } from 'vitest';
import {
  cutLine,
  grepLimits,
  isPatternTooLong,
} from '../../../../src/infrastructure/files/grep-limits.js';

describe('grep limits', () => {
  it('RF-146 the limits are a 200-character pattern, a 2,000-character line, a 2 s timeout, 1000 matches and 32 MiB read', () => {
    expect(grepLimits).toEqual({
      maxPatternLength: 200,
      maxLineLength: 2000,
      timeoutMs: 2000,
      maxMatches: 1000,
      maxTotalBytes: 32 * 1024 * 1024,
    });
  });

  it('RF-146 a pattern of 200 characters is allowed and one of 201 is refused', () => {
    expect(isPatternTooLong('a'.repeat(200))).toBe(false);
    expect(isPatternTooLong('a'.repeat(201))).toBe(true);
  });

  it('RF-146 a line of 2,000 characters is kept whole', () => {
    const line = 'x'.repeat(2000);

    expect(cutLine(line)).toEqual({ text: line, cut: false });
  });

  it('RF-146 a longer line is cut to its first 2,000 characters', () => {
    const line = `${'x'.repeat(2000)}tail`;

    expect(cutLine(line)).toEqual({ text: 'x'.repeat(2000), cut: true });
  });
});
