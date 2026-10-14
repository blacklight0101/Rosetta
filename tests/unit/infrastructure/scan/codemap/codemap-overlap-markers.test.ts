import { describe, expect, it } from 'vitest';
import { buildCodeMap } from '../../../../../src/infrastructure/scan/codemap/build-code-map.js';
import type { PackScan } from '../../../../../src/infrastructure/scan/packs/pack-scan.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';
import type { ScannedFile } from '../../../../../src/infrastructure/scan/universal/scan-types.js';

// FAKE key bodies and a FAKE key line, built from pieces so no secret-like literal is in the repository (RNF-003).
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
const body = ['Qp4Rt8', 'Vn2Ky6'].map((part) => part.repeat(11));
const shortLine = 'Zx9Cv8Bn7Mq6';
const tokens = [...body.map((part) => part.slice(0, 20)), shortLine];

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

describe('overlapping key markers, through the code map', () => {
  it('RNF-003 a key line between a stray marker and a second marker writes no key text (SELECT)', () => {
    const text = codeMapJson([
      begin,
      body[0] ?? '',
      'SELECT a FROM t',
      shortLine,
      begin,
      body[1] ?? '',
      'SELECT b FROM t',
      end,
      'SELECT c FROM t;',
    ]);

    for (const token of tokens) expect(text).not.toContain(token);
    expect(text).toContain('SELECT c FROM t;');
  });

  it('RNF-003 a key line between a stray marker and a second marker writes no key text (INSERT)', () => {
    const text = codeMapJson([
      begin,
      body[0] ?? '',
      'INSERT INTO q VALUES (1)',
      shortLine,
      begin,
      body[1] ?? '',
      end,
    ]);

    for (const token of tokens) expect(text).not.toContain(token);
  });
});
