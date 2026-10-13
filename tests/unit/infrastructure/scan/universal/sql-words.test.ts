import { describe, expect, it } from 'vitest';
import {
  cutAtWord,
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

describe('cutting inside an XML password element', () => {
  // FAKE SECRETS ONLY (RNF-003): plain words, built from pieces.
  const value = ['first', 'FAKE0FAKE0', 'third'].join(' ');
  const opening = ['<pass', 'word>'].join('');
  const closing = `</${opening.slice(1)}`;

  it('RF-141 a cut between the opening tag and its end tag drops the open element with its value', () => {
    const text = `<db>${opening}${value}${closing} <other/>`;
    const cut = text.indexOf('FAKE0') + 2;

    expect(cutAtWord(text, cut)).toBe('<db>');
  });

  it('RF-141 a cut on a later line leaves the lines before it alone', () => {
    const text = `a\n<db>${opening}${value}${closing}`;

    expect(cutAtWord(text, text.indexOf('FAKE0') + 2)).toBe('a\n<db>');
  });

  it('RF-141 an element whose end tag is in the kept text stays for the masker', () => {
    const element = `${opening}${value}${closing}`;

    expect(cutAtWord(`<db>${element} tail of the text`, element.length + 8)).toBe(`<db>${element}`);
  });

  it('RF-141 a placeholder tag in prose is kept', () => {
    const text = `set ${opening} to a strong value`;

    expect(cutAtWord(text, text.length - 3)).toBe(`set ${opening} to a strong`);
  });
});
