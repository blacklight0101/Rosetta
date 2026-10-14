import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';

// FAKE key bodies and a FAKE key line, built from pieces so no secret-like literal is in the repository (RNF-003).
const begin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const end = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const body = ['Qp4Rt8', 'Vn2Ky6'].map((part) => part.repeat(11));
const shortLine = 'Zx9Cv8Bn7Mq6';

/** Key text that must never reach a statement: the first 20 characters of each body line and the short line. */
const tokens = [...body.map((part) => part.slice(0, 20)), shortLine];

describe('overlapping key markers in a script', () => {
  it('RNF-003 a key line between a stray marker and a second marker leaks no key text (SELECT)', () => {
    const lines = [
      begin,
      body[0] ?? '',
      'SELECT a FROM t',
      shortLine,
      begin,
      body[1] ?? '',
      'SELECT b FROM t',
      end,
      'SELECT c FROM t;',
    ];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
    const text = JSON.stringify(found);

    for (const token of tokens) expect(text).not.toContain(token);
    expect(found.at(-1)).toMatchObject({ line: 9, text: 'SELECT c FROM t;' });
  });

  it('RNF-003 a key line between a stray marker and a second marker leaks no key text (INSERT)', () => {
    const lines = [
      begin,
      body[0] ?? '',
      'INSERT INTO q VALUES (1)',
      shortLine,
      begin,
      body[1] ?? '',
      end,
    ];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
    const text = JSON.stringify(found);

    for (const token of tokens) expect(text).not.toContain(token);
  });
});

describe('two stray markers in a row', () => {
  it('RF-104 keep both statements after them and write no key text', () => {
    const lines = [
      begin,
      begin,
      shortLine,
      'INSERT INTO b VALUES (2);',
      'INSERT INTO c VALUES (3);',
    ];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());

    expect(found.map((s) => [s.line, s.text])).toEqual([
      [4, 'INSERT INTO b VALUES (2);'],
      [5, 'INSERT INTO c VALUES (3);'],
    ]);
    for (const token of tokens) expect(JSON.stringify(found)).not.toContain(token);
  });
});

describe('a stray marker after an open span', () => {
  it('RF-104 starts a span of its own: the statement before it keeps its text', () => {
    const lines = [
      begin,
      'INSERT INTO q VALUES (1)',
      begin,
      shortLine,
      body[0] ?? '',
      begin,
      body[1] ?? '',
      end,
    ];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());

    expect(found.map((s) => s.line)).toEqual([2]);
    const text = found[0]?.text ?? '';
    expect(text.startsWith('INSERT INTO q VALUES (1)')).toBe(true);
    // Each key line of the span (the second marker, the short line and the first body line) is its own marker.
    expect(text.match(/\[MASKED:private-key\]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
