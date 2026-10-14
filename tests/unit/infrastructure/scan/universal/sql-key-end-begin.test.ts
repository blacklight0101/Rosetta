import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';

// FAKE key markers and key text, built from pieces so no secret-like literal is in the repository.
const begin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const end = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const endBegin = `${end} ${begin}`;
const firstBody = ['Qp4Rt8Vn2Ky6', 'Wz9Xc3Df5Gh7Jm1'].join('');
const secondBody = ['Lb6Nv0Sa2Ed4', 'Fg'].join('');

function statementText(lines: readonly string[]): string {
  return extractScriptStatements('db/a.sql', lines, new SecretMasker())
    .map((statement) => statement.text)
    .join('\n');
}

describe('a line that holds the END and the BEGIN of a key', () => {
  it.each([
    ['alone', [endBegin, firstBody, 'SELECT a FROM t', secondBody]],
    ['after a key that is still open', [begin, firstBody, endBegin, 'SELECT a FROM t', secondBody]],
    ['after a statement', ['DELETE FROM t;', endBegin, firstBody, 'SELECT a FROM t', secondBody]],
    ['before a later END', [endBegin, firstBody, 'SELECT a FROM t', secondBody, end]],
  ])('RNF-003 keeps key text out of the statements: %s', (_name, lines) => {
    const text = statementText(lines);

    expect(text).not.toContain(firstBody);
    expect(text).not.toContain(secondBody);
  });

  it('RNF-003 keeps a statement that follows the line', () => {
    const text = statementText([endBegin, firstBody, 'SELECT a FROM t', secondBody]);

    expect(text).toContain('SELECT a FROM t');
  });
});
