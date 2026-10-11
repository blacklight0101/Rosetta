import { describe, expect, it } from 'vitest';
import type { CodeMap } from '../../../../../src/domain/code-map/code-map.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import {
  buildCodeMap,
  type BuildCodeMapInput,
} from '../../../../../src/infrastructure/scan/codemap/build-code-map.js';
import type { PackScan } from '../../../../../src/infrastructure/scan/packs/pack-scan.js';
import type {
  ScannedFile,
  SqlStatement,
} from '../../../../../src/infrastructure/scan/universal/scan-types.js';
import { fakeOpenAiKey } from '../../../../support/secret-fixture.js';

const source = { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' };

function file(path: string, extra: Partial<ScannedFile> = {}): ScannedFile {
  return {
    path,
    language: 'csharp',
    lines: 4,
    estimatedTokens: 12,
    sha256: 'b'.repeat(64),
    artefactKinds: [],
    ...extra,
  };
}

const noPacks: Pick<PackScan, 'fileLevels' | 'symbols' | 'links' | 'entities' | 'languagePacks'> = {
  fileLevels: [],
  symbols: [],
  links: [],
  entities: [],
  languagePacks: [],
};

function input(
  files: readonly ScannedFile[],
  rest: {
    sql?: readonly SqlStatement[];
    packs?: Partial<typeof noPacks>;
    budget?: number;
    areas?: BuildCodeMapInput['configuredAreas'];
  } = {},
): BuildCodeMapInput {
  return {
    source,
    scan: { files, sqlStatements: rest.sql ?? [] },
    packs: { ...noPacks, ...rest.packs },
    areaTokenBudget: rest.budget ?? 60_000,
    configuredAreas: rest.areas ?? [],
    masker: new SecretMasker(),
  };
}

function build(options: BuildCodeMapInput): CodeMap {
  const result = buildCodeMap(options);
  if (!result.ok) throw new Error(`build failed: ${result.error}`);
  return result.value;
}

describe('building the code map from the scans', () => {
  it('RF-105 lists every file with its map level, coarse where no pack mapped it', () => {
    const map = build(
      input([file('Web.config', { language: 'xml' }), file('a.cs')], {
        packs: { fileLevels: [{ path: 'a.cs', mapLevel: 'symbols' }] },
      }),
    );

    expect(map.files.map((f) => `${f.path}:${f.mapLevel}`)).toEqual([
      'Web.config:coarse',
      'a.cs:symbols',
    ]);
    expect(map.source).toEqual(source);
  });

  it('RF-100 leaves the hash out of a too-large file and keeps its skip reason', () => {
    const bare: ScannedFile = {
      path: 'huge.sql',
      language: 'sql',
      lines: 0,
      estimatedTokens: 0,
      artefactKinds: [],
      skipped: 'too-large',
    };
    const map = build(input([bare]));

    expect(map.files[0]).toEqual({
      path: 'huge.sql',
      language: 'sql',
      lines: 0,
      estimatedTokens: 0,
      artefactKinds: [],
      mapLevel: 'coarse',
      skipped: 'too-large',
    });
  });
});

describe('building the code map (links and areas)', () => {
  it('RF-111 writes the optional symbol of a link', () => {
    const map = build(
      input([file('Home.aspx'), file('Home.aspx.cs')], {
        packs: {
          links: [
            {
              from: 'Home.aspx',
              to: 'Home.aspx.cs',
              kind: 'code-behind',
              symbol: 'Demo.Home',
            },
          ],
        },
      }),
    );

    expect(map.links).toEqual([
      { from: 'Home.aspx', to: 'Home.aspx.cs', kind: 'code-behind', symbol: 'Demo.Home' },
    ]);
  });

  it('RF-104 groups linked files into one area and records the references origin', () => {
    const map = build(
      input([file('Pages/Home.aspx'), file('Code/Home.aspx.cs')], {
        packs: {
          links: [{ from: 'Pages/Home.aspx', to: 'Code/Home.aspx.cs', kind: 'code-behind' }],
        },
      }),
    );

    expect(map.areas.map((a) => `${a.name}:${a.origin}:${a.files.join('+')}`)).toEqual([
      'Pages:references:Code/Home.aspx.cs+Pages/Home.aspx',
    ]);
  });
});

describe('building the code map (configured areas)', () => {
  it('RF-104 configured areas take the files their include patterns match', () => {
    const map = build(
      input([file('Web/a.cs'), file('Web/b.cs'), file('Data/x.cs')], {
        areas: [{ name: 'Checkout', include: ['Web/a.cs', 'Data/**'] }],
      }),
    );

    expect(map.areas.map((a) => `${a.name}:${a.origin}:${a.files.join('+')}`)).toEqual([
      'Checkout:config:Data/x.cs+Web/a.cs',
      'Web:folder:Web/b.cs',
    ]);
  });

  it('RF-104 no area exceeds the token budget', () => {
    const files = ['a', 'b', 'c'].map((n) => file(`Big/${n}.cs`, { estimatedTokens: 40 }));
    const map = build(input(files, { budget: 100 }));

    expect(map.areas.map((a) => a.estimatedTokens)).toEqual([80, 40]);
  });
});

describe('building the code map (packs and masking)', () => {
  it('RF-110 records the packs that were used', () => {
    const map = build(
      input([file('a.cs')], { packs: { languagePacks: [{ name: 'csharp', version: '1.0.0' }] } }),
    );

    expect(map.languagePacks).toEqual([{ name: 'csharp', version: '1.0.0' }]);
  });

  it('RF-141 masks a secret inside an SQL literal before the code map holds it', () => {
    const statement: SqlStatement = {
      path: 'Repo.cs',
      line: 7,
      verb: 'INSERT',
      text: `INSERT INTO ApiKeys (Value) VALUES ('${fakeOpenAiKey}')`,
    };
    const map = build(input([file('Repo.cs')], { sql: [statement] }));

    expect(JSON.stringify(map)).not.toContain(fakeOpenAiKey);
    expect(map.sqlStatements[0]?.text).toBe(
      "INSERT INTO ApiKeys (Value) VALUES ('[MASKED:api-key]')",
    );
    expect(map.sqlStatements[0]).toMatchObject({ path: 'Repo.cs', line: 7, verb: 'INSERT' });
  });

  it('RF-141 masks a secret in a symbol, a link or an entity taken from the source text', () => {
    const map = build(
      input([file('a.cs'), file('b.cs')], {
        packs: {
          symbols: [
            {
              path: 'a.cs',
              kind: 'class',
              name: `K ${fakeOpenAiKey}`,
              startLine: 1,
              endLine: 2,
              container: `NS ${fakeOpenAiKey}`,
            },
          ],
          links: [{ from: 'a.cs', to: 'b.cs', kind: 'code-behind', symbol: fakeOpenAiKey }],
          entities: [{ name: 'E', path: 'a.cs', startLine: 1, source: `S ${fakeOpenAiKey}` }],
        },
      }),
    );

    expect(JSON.stringify(map)).not.toContain(fakeOpenAiKey);
  });
});

describe('building the code map (limits and order)', () => {
  it('RF-103 keeps a statement within 500 characters even when masking lengthens it', () => {
    const text = `SELECT '${fakeOpenAiKey}'${' x'.repeat(240)}`.slice(0, 500);
    const map = build(
      input([file('a.cs')], { sql: [{ path: 'a.cs', line: 1, verb: 'SELECT', text }] }),
    );

    expect(map.sqlStatements[0]?.text.length).toBeLessThanOrEqual(500);
  });

  it('RF-106 gives the same map for the same scans whatever the order they arrive in', () => {
    const files = [file('b/x.cs'), file('a/y.cs'), file('c.cs')];
    const forward = build(input(files));
    const backward = build(input([...files].reverse()));

    expect(backward).toEqual(forward);
  });

  it('RF-105 reports a problem instead of a map when the scans disagree with the rules', () => {
    const result = buildCodeMap(input([file('a.cs'), file('a.cs')]));

    expect(result).toEqual({ ok: false, error: 'duplicate-file' });
  });
});
