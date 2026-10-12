import { describe, expect, it } from 'vitest';
import {
  createCitation,
  formatCitation,
  parseCitation,
} from '../../../../src/domain/cards/citation.js';

describe('citation', () => {
  it('RF-202 accepts path:startLine-endLine and formats it back', () => {
    const parsed = parseCitation('src/Orders/Checkout.cs:10-24');

    expect(parsed).toEqual({
      ok: true,
      value: { path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 },
    });
    expect(parsed.ok && formatCitation(parsed.value)).toBe('src/Orders/Checkout.cs:10-24');
  });

  it('RF-202 splits at the last colon so a path may hold a colon', () => {
    expect(parseCitation('a:b/c.txt:3-3')).toEqual({
      ok: true,
      value: { path: 'a:b/c.txt', startLine: 3, endLine: 3 },
    });
  });

  it.each([
    ['no lines', 'src/a.cs'],
    ['a single number', 'src/a.cs:5'],
    ['text lines', 'src/a.cs:x-y'],
    ['an empty path', ':1-2'],
  ])('RF-202 refuses %s', (_name, text) => {
    expect(parseCitation(text)).toEqual({ ok: false, error: 'invalid-format' });
  });

  it.each([
    ['start below 1', 'src/a.cs', 0, 3, 'invalid-lines'],
    ['end before start', 'src/a.cs', 5, 4, 'invalid-lines'],
    ['a fractional line', 'src/a.cs', 1.5, 4, 'invalid-lines'],
    ['an absolute path', '/etc/passwd', 1, 2, 'invalid-path'],
    ['a path that climbs up', 'src/../x.cs', 1, 2, 'invalid-path'],
    ['a backslash path', 'src\\a.cs', 1, 2, 'invalid-path'],
  ] as const)('RF-202 refuses %s', (_name, path, startLine, endLine, problem) => {
    expect(createCitation(path, startLine, endLine)).toEqual({ ok: false, error: problem });
  });
});
