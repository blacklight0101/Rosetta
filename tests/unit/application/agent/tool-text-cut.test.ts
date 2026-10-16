import { describe, expect, it } from 'vitest';
import { cutLine } from '../../../../src/application/agent/tool-text.js';

// RF-144, RF-146: a line cut to the tool limit never leaves half of a character (a surrogate pair
// such as an emoji is two UTF-16 units) at the end of the text the model reads.

describe('cutLine', () => {
  it('RF-144 a line within the limit is returned unchanged', () => {
    expect(cutLine('ab😀', 4)).toBe('ab😀');
  });

  it('RF-144 a cut line keeps the characters before the limit', () => {
    expect(cutLine('abcdef', 4)).toBe('abcd');
  });

  it('RF-144 a cut that would split a surrogate pair drops the whole character', () => {
    expect(cutLine('abc😀', 4)).toBe('abc');
    expect(cutLine('a😀b', 2)).toBe('a');
  });
});
