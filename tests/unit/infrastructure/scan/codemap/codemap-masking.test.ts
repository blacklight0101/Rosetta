import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { createArea } from '../../../../../src/domain/code-map/area.js';
import { createCodeMap } from '../../../../../src/domain/code-map/code-map.js';
import type { OutputWriter } from '../../../../../src/application/ports/output-writer.js';
import { ok } from '../../../../../src/domain/errors/result.js';
import {
  SecretMasker,
  type TextMasker,
} from '../../../../../src/infrastructure/guards/secret-masker.js';
import { buildCodeMap } from '../../../../../src/infrastructure/scan/codemap/build-code-map.js';
import { writeScanOutputs } from '../../../../../src/infrastructure/scan/codemap/write-scan-outputs.js';
import type { PackScan } from '../../../../../src/infrastructure/scan/packs/pack-scan.js';
import { extractEmbeddedStatements } from '../../../../../src/infrastructure/scan/universal/sql-embedded.js';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';
import type {
  ScannedFile,
  SqlStatement,
} from '../../../../../src/infrastructure/scan/universal/scan-types.js';
import { entry } from '../../../../support/code-map-builders.js';
import { FailingMasker } from '../../../../support/failing-masker.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';

const source = { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' };
const noPacks: Pick<PackScan, 'fileLevels' | 'symbols' | 'links' | 'entities' | 'languagePacks'> = {
  fileLevels: [],
  symbols: [],
  links: [],
  entities: [],
  languagePacks: [],
};

// A FAKE connection string, built from pieces so no secret-like literal is in the repository.
const fakePassword = ['Pw', 'FAKE0'.repeat(3)].join('');
const connection = `${['postgres', '://adm:'].join('')}${fakePassword}@db.example/app`;

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

function buildWith(statements: readonly SqlStatement[], masker: TextMasker = new SecretMasker()) {
  return buildCodeMap({
    source,
    scan: { files: [file('db/a.sql'), file('src/A.cs')], sqlStatements: statements },
    packs: noPacks,
    areaTokenBudget: 60_000,
    configuredAreas: [],
    masker,
  });
}

function textOf(result: ReturnType<typeof buildWith>): string {
  if (!result.ok) throw new Error(result.error);
  return JSON.stringify(result.value);
}

describe('a secret that straddles the end of the 500 characters of a statement', () => {
  const pads = Array.from({ length: 121 }, (_, index) => 400 + index);

  it('RF-141 a connection string in a script statement is masked at every cut position', () => {
    for (const pad of pads) {
      const line = `SELECT ${'a'.repeat(pad)} FROM T WHERE u = '${connection}';`;
      const text = textOf(buildWith(extractScriptStatements('db/a.sql', [line])));

      expect(text, `pad ${String(pad)}`).not.toContain('Pw');
      expect(text, `pad ${String(pad)}`).not.toContain('FAKE0');
    }
  });

  it('RF-141 a connection string in an embedded statement is masked at every cut position', () => {
    for (const pad of pads) {
      const line = `var sql = "SELECT ${'a'.repeat(pad)} FROM T WHERE u = '${connection}'";`;
      const text = textOf(buildWith(extractEmbeddedStatements('src/A.cs', [line])));

      expect(text, `pad ${String(pad)}`).not.toContain('Pw');
      expect(text, `pad ${String(pad)}`).not.toContain('FAKE0');
    }
  });

  it('RF-103 the recorded text is still at most 500 characters', () => {
    const line = `SELECT ${'a'.repeat(480)} FROM T WHERE u = '${connection}';`;
    const result = buildWith(extractScriptStatements('db/a.sql', [line]));

    expect(result.ok && result.value.sqlStatements[0]?.text.length).toBeLessThanOrEqual(500);
  });

  it('RF-141 the 500-character cut falls between words, so it never splits a mask marker', () => {
    const halves = Array.from({ length: 30 }, (_, index) => 450 + index).filter((pad) => {
      const line = `SELECT ${'a'.repeat(pad)} FROM T WHERE u = '${connection}';`;
      const result = buildWith(extractScriptStatements('db/a.sql', [line]));
      const text = result.ok ? (result.value.sqlStatements[0]?.text ?? '') : '';
      return text.lastIndexOf('[') > text.lastIndexOf(']') || text.endsWith('adm:');
    });

    expect(halves).toEqual([]);
  });
});

// Three long FAKE keys that mask to short markers, then a FAKE connection string at `start`.
const longKeys = ['A', 'B', 'C'].map((tag) => ['sk', `${tag}${'Kx9'.repeat(150)}`].join('-'));
const longPassword = ['Pw', 'FAKE0'.repeat(8)].join('');
const longConnection = `${['postgres', '://adm:'].join('')}${longPassword}@db.example/app`;

/** A statement whose connection string starts at character `start` of the collapsed text. */
function shrinkingStatement(start: number): string {
  const head = `SELECT ${longKeys.join(' ')} `;
  return `${head}${'a'.repeat(start - head.length - 1)} ${longConnection} FROM T`;
}

/** Whether a text still holds any part of the FAKE password or keys of the probes. */
function leaks(text: string): boolean {
  return (
    text.includes('FAKE0') ||
    /adm:(?!\[MASKED:)/u.test(text) ||
    longKeys.some((key) => text.includes(key.slice(0, 24)))
  );
}

describe('a secret cut by the statement window after masking shortened the head', () => {
  const starts = Array.from({ length: 51 }, (_, index) => 1490 + index);

  it('RF-141 a connection string across character 1536 of a script statement is never written', () => {
    const leaked = starts.filter((start) => {
      const line = `${shrinkingStatement(start)};`;
      return leaks(textOf(buildWith(extractScriptStatements('db/a.sql', [line]))));
    });

    expect(leaked).toEqual([]);
  });

  it('RF-141 a connection string across character 1536 of an embedded statement is never written', () => {
    const leaked = starts.filter((start) => {
      const line = `var sql = "${shrinkingStatement(start)}";`;
      return leaks(textOf(buildWith(extractEmbeddedStatements('src/A.cs', [line]))));
    });

    expect(leaked).toEqual([]);
  });
});

describe('a secret cut by the 4000-character line limit', () => {
  const kept = Array.from({ length: longPassword.length + 2 }, (_, index) => index);
  const prefixLength = ['postgres', '://adm:'].join('').length;

  it('RF-141 a script line cut inside a connection string leaks no part of the password', () => {
    const leaked = kept.filter((keep) => {
      const line = `${' '.repeat(4000 - prefixLength - keep)}${longConnection}`;
      const statements = extractScriptStatements('db/a.sql', ['SELECT a FROM T WHERE u =', line]);
      return leaks(textOf(buildWith(statements)));
    });

    expect(leaked).toEqual([]);
  });

  it('RF-141 an embedded literal cut inside a connection string leaks no part of the password', () => {
    const leaked = kept.filter((keep) => {
      const head = `${'x'.repeat(1000)} = "SELECT a FROM T WHERE u = `;
      const spaces = ' '.repeat(4000 - head.length - prefixLength - keep);
      const lines = [`${head}${spaces}${longConnection}`, '";'];
      return leaks(textOf(buildWith(extractEmbeddedStatements('src/A.cs', lines))));
    });

    expect(leaked).toEqual([]);
  });
});
describe('masking of paths, area names and the subpath', () => {
  it('RF-141 two file paths that differ only by a secret stay two distinct masked paths', () => {
    const second = ['sk', 'proj', 'Other'.repeat(8)].join('-');
    const paths = [`cfg/${fakeOpenAiKey}.txt`, `cfg/${second}.txt`];
    const result = buildCodeMap({
      source,
      scan: { files: paths.map(file), sqlStatements: [] },
      packs: noPacks,
      areaTokenBudget: 60_000,
      configuredAreas: [],
      masker: new SecretMasker(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const masked = result.value.files.map((entry) => entry.path);
    expect(masked).toEqual(['cfg/[MASKED:api-key].txt~1', 'cfg/[MASKED:api-key].txt~2']);
    expect(result.value.areas.flatMap((area) => area.files)).toEqual(masked);
    expect(JSON.stringify(result.value)).not.toContain('Other');
  });

  it('RF-141 a secret in a file path, an area name or the subpath is masked in the code map', () => {
    const secretPath = `cfg/${fakeOpenAiKey}.txt`;
    const result = buildCodeMap({
      source: { ...source, subpath: `sub ${fakeOpenAiKey}` },
      scan: { files: [file(secretPath), file('src/A.cs')], sqlStatements: [] },
      packs: {
        ...noPacks,
        links: [{ from: secretPath, to: 'src/A.cs', kind: 'import' }],
      },
      areaTokenBudget: 60_000,
      configuredAreas: [{ name: `Team ${fakeOpenAiKey}`, include: ['src/'] }],
      masker: new SecretMasker(),
    });

    const text = textOf(result);
    expect(text).not.toContain(fakeOpenAiKey);
    expect(text).toContain('cfg/[MASKED:api-key].txt');
    expect(text).toContain('Team [MASKED:api-key]');
  });
});

describe('a masker that fails', () => {
  it('RF-141 buildCodeMap fails closed: it throws and returns no map', () => {
    const failing = new FailingMasker();
    const statement: SqlStatement = { path: 'db/a.sql', line: 1, verb: 'SELECT', text: 'SELECT 1' };

    expect(() => buildWith([statement], failing)).toThrow(RosettaError);
    expect(failing.calls).toBeGreaterThan(0);
  });

  it('RF-141 writeScanOutputs fails closed: it throws before writing any file', async () => {
    const written: string[] = [];
    const recording: OutputWriter = {
      writeText: (target) => {
        written.push(target.path);
        return Promise.resolve(ok(undefined));
      },
      appendLine: () => Promise.resolve(ok(undefined)),
      readText: () => Promise.resolve(ok('')),
    };
    const member = entry('a.cs');
    const area = createArea({ name: 'A', origin: 'folder', members: [member] }, 100);
    if (!area.ok) throw new Error(area.error);
    const map = createCodeMap({
      source,
      files: [member],
      areas: [area.value],
      symbols: [],
      links: [],
      sqlStatements: [],
      entities: [],
      languagePacks: [],
    });
    if (!map.ok) throw new Error(map.error);

    await expect(
      writeScanOutputs(
        recording,
        { userId: 'u', folder: 'runs/x' },
        { codeMap: map.value, durationMs: 1, masker: new FailingMasker() },
      ),
    ).rejects.toThrow(RosettaError);
    expect(written).toEqual([]);
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
        const statements = extractScriptStatements('db/a.sql', lines.split('\n'));
        const text = textOf(buildWith(statements));

        for (const part of body) expect(text).not.toContain(part.slice(0, 20));
      });
    }
  }
});

describe('comment lines inside a SQL statement', () => {
  it('RF-103 a comment ending in a semicolon does not close the statement', () => {
    const statements = extractScriptStatements('db/a.sql', [
      'SELECT a',
      '-- fetch rows;',
      'FROM t;',
    ]);

    expect(statements.map((s) => s.text)).toEqual(['SELECT a FROM t;']);
  });

  it('RF-103 a commented-out query adds nothing to the statement text', () => {
    const statements = extractScriptStatements('db/a.sql', [
      'SELECT a',
      '-- SELECT b FROM u',
      'FROM t;',
    ]);

    expect(statements.map((s) => s.text)).toEqual(['SELECT a FROM t;']);
  });
});
