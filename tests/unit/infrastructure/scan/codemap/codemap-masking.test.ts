import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { createArea } from '../../../../../src/domain/code-map/area.js';
import { createCodeMap } from '../../../../../src/domain/code-map/code-map.js';
import type { OutputWriter } from '../../../../../src/application/ports/output-writer.js';
import { ok } from '../../../../../src/domain/errors/result.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
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

function buildWith(statements: readonly SqlStatement[], masker = new SecretMasker()) {
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
});

describe('masking of paths, area names and the subpath', () => {
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
