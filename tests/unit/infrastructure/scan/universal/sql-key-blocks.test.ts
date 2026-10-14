import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';

// FAKE key body, built from pieces so no secret-like literal is in the repository (RNF-003).
const begin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const end = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const body = ['Qp4Rt8', 'Vn2Ky6', 'Hj5Wd3'].map((part) => part.repeat(11));

/** Key text that must never reach a statement: the first 20 characters of each body line and each word of the tail. */
function keyTokens(tail: readonly string[]): string[] {
  const words = tail.flatMap((line) => line.split(/[^A-Za-z0-9]+/u));
  return [...body.map((part) => part.slice(0, 20)), ...words.filter((word) => word.length >= 6)];
}

// A complete key block with a line that looks like a SQL statement inside it, then short,
// hyphenated or spaced key lines. Each tail is a key body after that line.
const shortTail = ['Zx9Cv8Bn7Mq6', 'Wr5Et4Yu3Io2'];
const tails: readonly (readonly [string, readonly string[]])[] = [
  ['short key lines', shortTail],
  ['a hyphenated base64url line', ['Zx9Cv8Bn7Mq6-Wr5Et4Yu3Io2_Pa1']],
  ['a line with spaces', ['Zx9Cv8 Bn7Mq6 Wr5Et4']],
];

describe('a complete key block with a statement-looking line inside', () => {
  for (const [name, tail] of tails) {
    it(`RNF-003 no key text reaches the statements (${name})`, () => {
      const lines = [begin, body[0] ?? '', 'SELECT a FROM t', ...tail, end, "');"];
      const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
      const text = JSON.stringify(found);

      for (const token of keyTokens(tail)) expect(text).not.toContain(token);
    });
  }

  it('RNF-003 the same block after a stray marker leaks no key text either', () => {
    const lines = [
      `-- ${begin}`,
      'INSERT INTO Item (Id) VALUES (1);',
      begin,
      body[0] ?? '',
      'SELECT a FROM t',
      ...shortTail,
      end,
    ];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
    const text = JSON.stringify(found);

    for (const token of keyTokens(shortTail)) expect(text).not.toContain(token);
    expect(found[0]?.text).toBe('INSERT INTO Item (Id) VALUES (1);');
  });

  it('RNF-003 a stray marker directly before a complete block leaks no key text', () => {
    const lines = [`-- ${begin}`, begin, body[0] ?? '', 'SELECT a FROM t', ...shortTail, end];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
    const text = JSON.stringify(found);

    for (const token of keyTokens(shortTail)) expect(text).not.toContain(token);
  });
});
