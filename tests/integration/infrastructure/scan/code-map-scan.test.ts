import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OutputWriter } from '../../../../src/application/ports/output-writer.js';
import { err, ok } from '../../../../src/domain/errors/result.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeScanOutputs } from '../../../../src/infrastructure/scan/codemap/write-scan-outputs.js';
import { parseCodeMap } from '../../../../src/infrastructure/scan/codemap/codemap-json.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { scanToOutputs } from '../../../support/code-map-harness.js';
import { fixtureRoot } from '../../../support/scan-harness.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { hashTree, writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

const temp = useTempRoot('rosetta-codemap-');

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const dataDir = (): string => join(temp.path, 'data');

describe('scan to code map and summary on the fixture repositories', () => {
  it('RF-106 scanning the same repository twice gives byte-identical codemap.json files', async () => {
    const first = await scanToOutputs(fixtureRoot('webforms-ef'), {
      runFolder: 'runs/one',
      dataDir: dataDir(),
    });
    const second = await scanToOutputs(fixtureRoot('webforms-ef'), {
      runFolder: 'runs/two',
      dataDir: dataDir(),
    });

    const bytesOne = await readFile(first.codeMapPath);
    const bytesTwo = await readFile(second.codeMapPath);
    expect(bytesTwo.equals(bytesOne)).toBe(true);
    expect(second.codeMapHash).toBe(first.codeMapHash);
  });

  it('RF-106 the hash returned for the manifest is the SHA-256 of the written file', async () => {
    const run = await scanToOutputs(fixtureRoot('webforms-csharp'), {
      runFolder: 'runs/hash',
      dataDir: dataDir(),
    });

    const expected = createHash('sha256')
      .update(await readFile(run.codeMapPath))
      .digest('hex');
    expect(run.codeMapHash).toBe(expected);
  });
});

describe('scan to code map (contents)', () => {
  it('RF-105 codemap.json validates against its schema and holds symbols, links and SQL', async () => {
    const run = await scanToOutputs(fixtureRoot('webforms-ef'), {
      runFolder: 'runs/schema',
      dataDir: dataDir(),
    });

    const parsed = parseCodeMap(await readFile(run.codeMapPath, 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.symbols.length).toBeGreaterThan(0);
    expect(parsed.value.links.map((link) => link.symbol)).toContain('ShopWeb.Admin.EditPage');
    expect(parsed.value.entities.length).toBeGreaterThan(0);
    expect(parsed.value.languagePacks.map((pack) => pack.name)).toEqual(['csharp']);
  });

  it('RF-105 scan-summary.md lists languages, artefact counts and areas with their map level', async () => {
    const run = await scanToOutputs(fixtureRoot('webforms-csharp'), {
      runFolder: 'runs/summary',
      dataDir: dataDir(),
    });

    const summary = await readFile(run.summaryPath, 'utf8');
    expect(summary).toContain('## Languages');
    expect(summary).toContain('| csharp |');
    expect(summary).toContain('## Artefacts');
    expect(summary).toContain('| page |');
    expect(summary).toContain('## Areas');
    expect(summary).toMatch(/\| Services \| \d+ \| \d+ \| symbols \| folder \|/);
    expect(summary).toContain('- Scan duration: ');
  });
});

describe('scan to code map (no language pack)', () => {
  it('RF-112 a repository in a language with no pack gets a valid code map, every area coarse', async () => {
    const run = await scanToOutputs(fixtureRoot('cobol-ledger'), {
      runFolder: 'runs/cobol',
      dataDir: dataDir(),
      withCSharpPack: false,
    });

    const parsed = parseCodeMap(await readFile(run.codeMapPath, 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.files.length).toBeGreaterThan(0);
    expect(parsed.value.files.every((file) => file.mapLevel === 'coarse')).toBe(true);
    expect(parsed.value.areas.every((area) => area.mapLevel === 'coarse')).toBe(true);
    expect(parsed.value.symbols).toEqual([]);
    const summary = await readFile(run.summaryPath, 'utf8');
    expect(summary).toMatch(/\| coarse \| folder \|/);
    expect(summary).not.toContain('| symbols |');
  });
});

describe('scan to code map (areas)', () => {
  it('RF-104 an area configured in the settings replaces the folder grouping for its files', async () => {
    const run = await scanToOutputs(fixtureRoot('webforms-csharp'), {
      runFolder: 'runs/config',
      dataDir: dataDir(),
      configuredAreas: [{ name: 'Data access', include: ['Database/', 'Services/'] }],
    });

    const area = run.codeMap.areas.find((a) => a.name === 'Data access');
    expect(area?.origin).toBe('config');
    expect(area?.files).toEqual([
      'Database/schema.sql',
      'Database/seed.sql',
      'Services/CatalogService.cs',
    ]);
    expect(
      run.codeMap.areas.filter((a) => a.files.some((f) => f.startsWith('Services/'))),
    ).toHaveLength(1);
  });

  it('RF-104 an oversized folder is split so that no area passes the token budget', async () => {
    const run = await scanToOutputs(fixtureRoot('webforms-csharp'), {
      runFolder: 'runs/budget',
      dataDir: dataDir(),
      areaTokenBudget: 150,
    });

    expect(run.codeMap.areas.length).toBeGreaterThan(3);
    for (const area of run.codeMap.areas) {
      expect(area.estimatedTokens <= 150 || area.files.length === 1).toBe(true);
    }
  });
});

describe('scan to code map (safety and speed)', () => {
  it('RF-005 the analysed repository is not changed by the scan', async () => {
    const root = fixtureRoot('webforms-csharp');
    const before = await hashTree(root);
    await scanToOutputs(root, { runFolder: 'runs/ro', dataDir: dataDir() });

    expect(await hashTree(root)).toBe(before);
  });

  it('RNF-007 a scan of the demo-size fixture, code map and summary included, takes under 10 seconds', async () => {
    const run = await scanToOutputs(fixtureRoot('webforms-csharp'), {
      runFolder: 'runs/time',
      dataDir: dataDir(),
    });

    expect(run.durationMs).toBeLessThan(10_000);
  });
});

describe('secrets inside the repository text', () => {
  it('RF-141 a fake secret inside an SQL literal never reaches codemap.json or scan-summary.md', async () => {
    const repo = join(temp.path, 'repo');
    await writeTree(repo, {
      'Data/Keys.cs': [
        'public class Keys {',
        '  void Seed() {',
        `    var sql = "INSERT INTO ApiKeys (Value) VALUES ('${fakeOpenAiKey}')";`,
        '  }',
        '}',
        '',
      ].join('\n'),
    });
    const run = await scanToOutputs(repo, { runFolder: 'runs/secret', dataDir: dataDir() });

    const codeMapText = await readFile(run.codeMapPath, 'utf8');
    const summaryText = await readFile(run.summaryPath, 'utf8');
    expect(codeMapText).not.toContain(fakeOpenAiKey);
    expect(summaryText).not.toContain(fakeOpenAiKey);
    expect(codeMapText).toContain('[MASKED:api-key]');
    expect(run.codeMap.sqlStatements).toHaveLength(1);
    expect(run.codeMap.sqlStatements[0]).toMatchObject({ path: 'Data/Keys.cs', line: 3 });
  });
});

// Three long FAKE keys that mask to short markers, then a FAKE connection string at `start`.
const longKeys = ['A', 'B', 'C'].map((tag) => ['sk', `${tag}${'Kx9'.repeat(150)}`].join('-'));
const longPassword = ['Pw', 'FAKE0'.repeat(8)].join('');
const longConnection = `${['postgres', '://adm:'].join('')}${longPassword}@db.example/app`;

function shrinkingStatement(start: number): string {
  const head = `SELECT ${longKeys.join(' ')} `;
  return `${head}${'a'.repeat(start - head.length - 1)} ${longConnection} FROM T`;
}

describe('secrets cut by the statement window', () => {
  it('RF-141 a connection string across character 1536 never reaches codemap.json, from .sql files or embedded SQL', async () => {
    const starts = Array.from({ length: 51 }, (_, index) => 1490 + index);
    const repo = join(temp.path, 'window-repo');
    const tree: Record<string, string> = {
      'src/Queries.cs': [
        'public class Queries {',
        ...starts.map((start) => `  string Q${String(start)} = "${shrinkingStatement(start)}";`),
        '}',
        '',
      ].join('\n'),
    };
    for (const start of starts)
      tree[`db/q${String(start)}.sql`] = `${shrinkingStatement(start)};\n`;
    await writeTree(repo, tree);

    const run = await scanToOutputs(repo, { runFolder: 'runs/window', dataDir: dataDir() });

    const codeMapText = await readFile(run.codeMapPath, 'utf8');
    const summaryText = await readFile(run.summaryPath, 'utf8');
    expect(run.codeMap.sqlStatements).toHaveLength(starts.length * 2);
    for (const text of [codeMapText, summaryText]) {
      expect(text).not.toContain('FAKE0');
      expect(text).not.toMatch(/adm:(?!\[MASKED:)/u);
      expect(text).not.toContain('Kx9Kx9');
    }
  });
});

describe('writing the scan outputs', () => {
  it('RF-005 a refused write is returned as a refusal and no output file is made', async () => {
    const run = await scanToOutputs(fixtureRoot('php-shop'), {
      runFolder: 'runs/ok',
      dataDir: dataDir(),
      withCSharpPack: false,
    });
    const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
    const writer = new NodeOutputWriter({ dataDir: dataDir(), logger });

    const written = await writeScanOutputs(
      writer,
      { userId: 'not-a-user-id', folder: 'runs/bad' },
      { codeMap: run.codeMap, durationMs: 1, masker: new SecretMasker() },
    );

    expect(written.ok).toBe(false);
    expect(await pathExists(join(dataDir(), 'users', 'not-a-user-id'))).toBe(false);
  });

  it('RF-005 a refusal to write the summary after the code map is returned too', async () => {
    const run = await scanToOutputs(fixtureRoot('php-shop'), {
      runFolder: 'runs/ok2',
      dataDir: dataDir(),
      withCSharpPack: false,
    });
    const refuseSummary: OutputWriter = {
      writeText: (file) =>
        Promise.resolve(
          file.path.endsWith('.md')
            ? err({ code: 'RST-1109', reason: 'outside-workspace', message: 'refused' })
            : ok(undefined),
        ),
      appendLine: () => Promise.resolve(ok(undefined)),
      readText: () => Promise.resolve(ok('')),
    };

    const written = await writeScanOutputs(
      refuseSummary,
      { userId: 'u', folder: 'runs/x' },
      { codeMap: run.codeMap, durationMs: 1, masker: new SecretMasker() },
    );

    expect(written.ok).toBe(false);
  });
});
