import { describe, expect, it } from 'vitest';
import type { ScannedFile } from '../../../../../src/infrastructure/scan/universal/scan-types.js';
import { buildCodeMap } from '../../../../../src/infrastructure/scan/codemap/build-code-map.js';
import type { PackScan } from '../../../../../src/infrastructure/scan/packs/pack-scan.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';

// FAKE key body, built from pieces so no secret-like literal is in the repository (RNF-003).
const source = { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' };
const noPacks: Pick<PackScan, 'fileLevels' | 'symbols' | 'links' | 'entities' | 'languagePacks'> = {
  fileLevels: [],
  symbols: [],
  links: [],
  entities: [],
  languagePacks: [],
};
const begin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const end = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const body = ['Qp4Rt8', 'Vn2Ky6', 'Hj5Wd3'].map((part) => part.repeat(11));

function file(path: string): ScannedFile {
  return {
    path,
    language: 'x',
    lines: 1,
    estimatedTokens: 3,
    artefactKinds: [],
    sha256: 'b'.repeat(64),
  };
}

/** The code map JSON of one script, scanned and then built as the scan builds it. */
function codeMapJson(lines: readonly string[]): string {
  const statements = extractScriptStatements('db/a.sql', lines, new SecretMasker());
  const result = buildCodeMap({
    source,
    scan: { files: [file('db/a.sql')], sqlStatements: statements },
    packs: noPacks,
    areaTokenBudget: 60_000,
    configuredAreas: [],
    masker: new SecretMasker(),
  });
  if (!result.ok) throw new Error(result.error);
  return JSON.stringify(result.value);
}

// Key text that must never reach the code map: body lines and the words of the adversarial tails.
const cases: readonly (readonly [string, readonly string[]])[] = [
  ['short key lines', ['Zx9Cv8Bn7Mq6', 'Wr5Et4Yu3Io2']],
  ['a hyphenated base64url line', ['Zx9Cv8Bn7Mq6-Wr5Et4Yu3Io2_Pa1']],
  ['a line with spaces', ['Zx9Cv8 Bn7Mq6 Wr5Et4']],
];

describe('adversarial key blocks in a script, through the code map', () => {
  for (const [name, tail] of cases) {
    it(`RNF-003 a complete key block with a SQL-looking line inside writes no key text (${name})`, () => {
      const lines = [begin, body[0] ?? '', 'SELECT a FROM t', ...tail, end, "');"];
      const text = codeMapJson(lines);
      const words = tail.flatMap((line) => line.split(/[^A-Za-z0-9]+/u));

      for (const part of body) expect(text).not.toContain(part.slice(0, 20));
      for (const word of words.filter((item) => item.length >= 6)) {
        expect(text).not.toContain(word);
      }
    });
  }

  it('RF-104 a stray marker before such a block keeps the statements between them and writes no key text', () => {
    const tail = ['Zx9Cv8Bn7Mq6', 'Wr5Et4Yu3Io2'];
    const lines = [
      `-- ${begin}`,
      'INSERT INTO Item (Id) VALUES (1);',
      begin,
      body[0] ?? '',
      'SELECT a FROM t',
      ...tail,
      end,
    ];
    const text = codeMapJson(lines);

    expect(text).toContain('INSERT INTO Item (Id) VALUES (1);');
    for (const word of tail) expect(text).not.toContain(word);
  });
});
