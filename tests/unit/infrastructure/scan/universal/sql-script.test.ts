import { describe, expect, it } from 'vitest';
import {
  SecretMasker,
  type MaskResult,
  type TextMasker,
} from '../../../../../src/infrastructure/guards/secret-masker.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';

class CountingMasker implements TextMasker {
  calls = 0;
  readonly #inner = new SecretMasker();

  mask(text: string): MaskResult {
    this.calls += 1;
    return this.#inner.mask(text);
  }
}

const masker = new SecretMasker();

function scriptOf(text: string) {
  return extractScriptStatements('db/script.sql', text.split('\n'), masker);
}

describe('SQL statements in a script', () => {
  it('RF-103 records each statement with its first line and verb', () => {
    const statements = scriptOf(
      [
        'INSERT INTO Item (Id, Name) VALUES (1, 1);',
        'INSERT INTO Item (Id, Name)',
        "VALUES (2, 'Cap');",
        '',
        'DELETE FROM Item WHERE Id = 99;',
      ].join('\n'),
    );

    expect(statements).toEqual([
      {
        path: 'db/script.sql',
        line: 1,
        verb: 'INSERT',
        text: 'INSERT INTO Item (Id, Name) VALUES (1, 1);',
      },
      {
        path: 'db/script.sql',
        line: 2,
        verb: 'INSERT',
        text: "INSERT INTO Item (Id, Name) VALUES (2, 'Cap');",
      },
      {
        path: 'db/script.sql',
        line: 5,
        verb: 'DELETE',
        text: 'DELETE FROM Item WHERE Id = 99;',
      },
    ]);
  });

  it('RF-103 a GO line ends a statement that has no semicolon', () => {
    const statements = scriptOf(
      ['CREATE TABLE T (Id INT)', 'GO', 'SELECT Id FROM T', 'GO'].join('\n'),
    );

    expect(statements.map((s) => [s.line, s.verb, s.text])).toEqual([
      [1, 'CREATE', 'CREATE TABLE T (Id INT)'],
      [3, 'SELECT', 'SELECT Id FROM T'],
    ]);
  });
});

describe('SQL statements in a script (continued)', () => {
  it('RF-103 a SELECT under an unfinished CREATE or INSERT belongs to it', () => {
    const statements = scriptOf(
      ['CREATE VIEW V AS', 'SELECT Id FROM T;', 'INSERT INTO U (Id)', 'SELECT Id FROM T;'].join(
        '\n',
      ),
    );

    expect(statements.map((s) => [s.line, s.verb])).toEqual([
      [1, 'CREATE'],
      [3, 'INSERT'],
    ]);
    expect(statements[0]?.text).toBe('CREATE VIEW V AS SELECT Id FROM T;');
  });

  it('RF-103 comments are skipped and the verb is found in any letter case', () => {
    const statements = scriptOf(
      ['-- SELECT nothing FROM here', '/* UPDATE x SET y = 1 */', 'update T set A = 1;'].join('\n'),
    );

    expect(statements.map((s) => [s.line, s.verb, s.text])).toEqual([
      [3, 'UPDATE', 'update T set A = 1;'],
    ]);
  });
});

describe('SQL statements in a script (part 2)', () => {
  it('RF-103 EXECUTE is recorded as EXEC', () => {
    const statements = scriptOf('EXECUTE dbo.Refresh @Id = 1;\nexec sp_who;');

    expect(statements.map((s) => s.verb)).toEqual(['EXEC', 'EXEC']);
  });

  it('RF-103 the last statement is recorded even without a terminator', () => {
    expect(scriptOf('SELECT 1 FROM T')).toHaveLength(1);
  });

  it('RF-103 the statement text is kept to a window of 1536 characters, wider than the 500 of the code map, so it can be masked first', () => {
    const [statement] = scriptOf(`SELECT ${'a, '.repeat(800)}b FROM T;`);

    expect(statement?.text).toHaveLength(1536);
  });

  it('RF-103 a script with no statement gives an empty list', () => {
    expect(scriptOf('-- only a comment\n\n')).toEqual([]);
  });
});

describe('SQL statements in a script (part 3)', () => {
  it('RF-103 at most 1000 statements are kept per file', () => {
    const many = Array.from(
      { length: 1200 },
      (_, index) => `DELETE FROM T WHERE Id = ${String(index)};`,
    );

    expect(scriptOf(many.join('\n'))).toHaveLength(1000);
  });

  it('RF-103 a very long line is cut, not scanned whole', () => {
    const [statement] = scriptOf(`SELECT ${'x'.repeat(2_000_000)} FROM T;`);

    expect(statement?.text.length).toBeLessThanOrEqual(1536);
  });
});

describe('a private key inside a SQL statement whose marker lines look like comments', () => {
  const body = ['Zq7Fk2', 'Lm9Xw4'].map((part) => part.repeat(10));
  const begin = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
  const end = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');
  const forms: readonly (readonly [string, string, string])[] = [
    ['dash comment', begin, end],
    ['block comment', `/* ${begin}`, `${end} */`],
  ];

  for (const [name, first, last] of forms) {
    for (const eol of ['\n', '\r\n']) {
      it(`RF-141 no key body line reaches the code map (${name}, ${JSON.stringify(eol)})`, () => {
        const lines = [
          "INSERT INTO Keys (Name, Pem) VALUES ('svc',",
          first,
          ...body,
          last,
          ');',
        ].join(eol);
        const statements = extractScriptStatements('db/a.sql', lines.split('\n'), masker);
        const text = JSON.stringify(statements);

        for (const part of body) expect(text).not.toContain(part.slice(0, 20));
      });
    }
  }
});

describe('comment lines inside a SQL statement', () => {
  it('RF-103 a comment ending in a semicolon does not close the statement', () => {
    const statements = extractScriptStatements(
      'db/a.sql',
      ['SELECT a', '-- fetch rows;', 'FROM t;'],
      masker,
    );

    expect(statements.map((s) => s.text)).toEqual(['SELECT a FROM t;']);
  });

  it('RF-103 a commented-out query adds nothing to the statement text', () => {
    const statements = extractScriptStatements(
      'db/a.sql',
      ['SELECT a', '-- SELECT b FROM u', 'FROM t;'],
      masker,
    );

    expect(statements.map((s) => s.text)).toEqual(['SELECT a FROM t;']);
  });
});

const begin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const body = ['Qp4Rt8', 'Vn2Ky6', 'Hj5Wd3'].map((part) => part.repeat(11));
const statements = [
  'INSERT INTO Item (Id) VALUES (1);',
  'UPDATE Item SET Id = 2 WHERE Id = 1;',
  'DELETE FROM Item WHERE Id = 2;',
];

describe('an unterminated private key marker in a SQL script', () => {
  it('RF-104 a comment that only mentions the marker keeps the three statements after it', () => {
    const lines = [`-- the service key file starts with ${begin}`, ...statements];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());

    expect(found.map((s) => [s.line, s.text])).toEqual([
      [2, statements[0]],
      [3, statements[1]],
      [4, statements[2]],
    ]);
  });

  it('RNF-003 a key body under the marker stays masked and the statements after it are kept', () => {
    const lines = [`-- ${begin}`, ...body.map((line) => `-- ${line}`), ...statements];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
    const text = JSON.stringify(found);

    for (const part of body) expect(text).not.toContain(part.slice(0, 20));
    expect(found.map((s) => s.line)).toEqual([5, 6, 7]);
  });

  it('RNF-003 header lines of an encrypted key do not end the masked span early', () => {
    const lines = [
      "INSERT INTO Keys (Pem) VALUES ('",
      begin,
      'Proc-Type: 4,ENCRYPTED',
      'DEK-Info: AES-128-CBC,0011',
      ...body,
      "');",
      ...statements,
    ];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
    const text = JSON.stringify(found);

    for (const part of body) expect(text).not.toContain(part.slice(0, 20));
    expect(found.slice(-3).map((s) => s.text)).toEqual(statements);
  });
});

describe('an unterminated private key marker, verb word in the key body', () => {
  it('RNF-003 a key body line that is only a SQL verb word does not end the masked span', () => {
    const lines = [
      "INSERT INTO Keys (Pem) VALUES ('",
      begin,
      ...body.slice(0, 1),
      'Select',
      ...body.slice(1),
      "');",
      ...statements,
    ];
    const found = extractScriptStatements('db/a.sql', lines, new SecretMasker());
    const text = JSON.stringify(found);

    for (const part of body) expect(text).not.toContain(part.slice(0, 20));
    expect(found.slice(-3).map((s) => s.text)).toEqual(statements);
  });
});

describe('the masker of a SQL script', () => {
  it('RNF-003 the injected masker masks the script', () => {
    const masker = new CountingMasker();

    extractScriptStatements('db/a.sql', ['SELECT a FROM t;'], masker);

    expect(masker.calls).toBeGreaterThan(0);
  });
});
