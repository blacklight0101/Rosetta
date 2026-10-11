import { describe, expect, it } from 'vitest';
import {
  cutLine,
  statementText,
  statementWindow,
} from '../../../../../src/infrastructure/scan/universal/sql-words.js';

describe('cutting a statement to its window', () => {
  it('RF-103 a statement that fits the window is kept whole, white space collapsed', () => {
    expect(statementText('SELECT  a,\n  b   FROM T')).toBe('SELECT a, b FROM T');
  });

  it('RF-141 a statement cut by the window ends at a whole word: the word the cut falls in is dropped', () => {
    const text = `SELECT ${'a'.repeat(statementWindow - 10)} tailword FROM T`;

    expect(statementText(text)).toBe(`SELECT ${'a'.repeat(statementWindow - 10)}`);
  });

  it('RF-141 a word that ends exactly at the window is kept', () => {
    const head = `SELECT ${'a'.repeat(statementWindow - 7)}`;

    expect(statementText(`${head} FROM T`)).toBe(head);
  });

  it('RF-141 a statement cut by the raw limit drops the word the raw cut falls in', () => {
    const text = `SELECT${' '.repeat(statementWindow * 2 - 12)}partial-word-here FROM T`;

    expect(statementText(text)).toBe('SELECT');
  });

  it('RF-141 a statement with no white space before the cut keeps no part of the cut word', () => {
    expect(statementText(`SELECT(${'x'.repeat(statementWindow * 3)}`)).toBe('');
  });
});

describe('cutting a long line', () => {
  it('RF-103 a line under the limit is unchanged', () => {
    expect(cutLine('SELECT a FROM T')).toBe('SELECT a FROM T');
  });

  it('RF-141 a line cut at 4000 characters drops the word the cut falls in', () => {
    const line = `${'b'.repeat(3990)} cut-in-the-middle of the word`;

    expect(cutLine(line)).toBe('b'.repeat(3990));
  });

  it('RF-141 a line cut where it has white space keeps the whole last word', () => {
    const line = `${'b'.repeat(4000)} next`;

    expect(cutLine(line)).toBe('b'.repeat(4000));
  });
});
