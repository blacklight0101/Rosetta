import { expect, it } from 'vitest';
import {
  cutLine,
  escapeInline,
  MAX_LINE,
  quoteText,
} from '../../../../../src/infrastructure/sources/workbook/workbook-text.js';

it('RF-152 quotes with JSON escaping so a pipe stays and a line break and a quote are escaped', () => {
  expect(quoteText('a | b', 100)).toBe('"a | b"');
  expect(quoteText('one\ntwo\r\nthree', 100)).toBe('"one\\ntwo\\r\\nthree"');
  expect(quoteText('say "hi"', 100)).toBe('"say \\"hi\\""');
});

it('RF-152 escapes every character a reader could split a line at', () => {
  for (const char of ['\u2028', '\u2029', '\u0085', '\u000b', '\u000c', '\u0000']) {
    const quoted = quoteText(`x${char}y`, 100);
    expect(quoted).not.toContain(char);
    expect(quoted.startsWith('"x\\')).toBe(true);
  }
});

it('RF-152 cuts a long text and says how many characters were left out', () => {
  const quoted = quoteText('a'.repeat(500), 100);
  expect(quoted.length).toBeLessThanOrEqual(100 + 40);
  expect(quoted.startsWith('"aaaa')).toBe(true);
  expect(quoted).toMatch(/\(\+400 characters\)"$/u);
});

it('RF-152 bounds the escaped length, not the raw length', () => {
  const quoted = quoteText('\n'.repeat(500), 100);
  expect(quoted.length).toBeLessThanOrEqual(100 + 40);
});

it('RF-152 does not split a surrogate pair when it cuts', () => {
  const quoted = quoteText('😀'.repeat(200), 51);
  expect(() => {
    JSON.parse(quoted);
  }).not.toThrow();
  expect(quoted).not.toMatch(/\\ud/iu);
});

it('RF-152 escapes a pipe when asked, for a table cell', () => {
  expect(quoteText('a|b', 100, { pipes: true })).toBe('"a\\u007cb"');
});

it('RF-152 leaves quotes and backslashes alone and escapes line breaks and control characters', () => {
  expect(escapeInline('IF(A1="x","a\\b")', 100)).toBe('IF(A1="x","a\\b")');
  expect(escapeInline('a\nB5 spoof', 100)).toBe('a\\nB5 spoof');
  expect(escapeInline('a\r\tb\u2028c', 100)).toBe('a\\r\\tb\\u2028c');
});

it('RF-152 cuts and counts what it left out', () => {
  const out = escapeInline('z'.repeat(300), 50);
  expect(out.startsWith('z'.repeat(50))).toBe(true);
  expect(out).toContain('(+250 characters)');
});

it('RF-146 leaves a line under the limit and cuts one over it', () => {
  expect(cutLine('short')).toBe('short');
  const cut = cutLine('x'.repeat(5000));
  expect(cut.length).toBeLessThanOrEqual(MAX_LINE);
  expect(MAX_LINE).toBeLessThan(2000);
  expect(cut.endsWith(' ...')).toBe(true);
});

it('RF-152 escapes a lone surrogate and the delete character', () => {
  expect(quoteText('a\ud800b', 100)).toBe('"a\\ud800b"');
  expect(quoteText('a\u007fb', 100)).toBe('"a\\u007fb"');
});

it('RF-146 does not cut a line between the halves of a surrogate pair', () => {
  const cut = cutLine(`${'x'.repeat(MAX_LINE - 5)}😀${'y'.repeat(50)}`);
  expect(cut).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/u);
  expect(cut.length).toBeLessThanOrEqual(MAX_LINE);
});
