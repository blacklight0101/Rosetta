import { describe, expect, it } from 'vitest';
import {
  countLines,
  estimateTokens,
} from '../../../../../src/infrastructure/scan/universal/file-facts.js';

describe('line count', () => {
  it.each([
    ['', 0],
    ['a', 1],
    ['a\n', 1],
    ['a\nb', 2],
    ['a\r\nb\r\n', 2],
    ['\n', 1],
    ['a\n\nb\n', 3],
  ])('RF-101 %j has %d lines', (text, lines) => {
    expect(countLines(text)).toBe(lines);
  });
});

describe('token estimate', () => {
  it.each([
    ['', 0],
    ['abcd', 1],
    ['abcde', 2],
    ['a'.repeat(400), 100],
  ])('RF-101 %j is about %d tokens', (text, tokens) => {
    expect(estimateTokens(text)).toBe(tokens);
  });
});
