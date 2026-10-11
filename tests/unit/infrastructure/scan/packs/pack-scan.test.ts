import { describe, expect, it } from 'vitest';
import type { LanguagePack } from '../../../../../src/application/ports/language-pack.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { LanguagePackRegistry } from '../../../../../src/infrastructure/scan/packs/pack-registry.js';
import { analyseWithPacks } from '../../../../../src/infrastructure/scan/packs/pack-scan.js';
import type { ScannedFile } from '../../../../../src/infrastructure/scan/universal/scan-types.js';
import { bytesReader } from '../../../../support/bytes-reader.js';
import { FixedClock } from '../../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../../support/memory-logger.js';
import { TestLanguagePack } from '../../../../support/test-language-pack.js';

function file(path: string, extra: Partial<ScannedFile> = {}): ScannedFile {
  return { path, language: 'x', lines: 3, estimatedTokens: 3, artefactKinds: [], ...extra };
}

function setup(
  files: Readonly<Record<string, string>>,
  packs: readonly LanguagePack[],
  scanned: readonly ScannedFile[] = Object.keys(files)
    .sort()
    .map((path) => file(path)),
) {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  const run = () =>
    analyseWithPacks({
      files: scanned,
      reader: bytesReader(files),
      registry: new LanguagePackRegistry(packs),
      logger,
      maxFileBytes: 1000,
    });
  return { run, logger };
}

describe('analysis with language packs', () => {
  it('RF-110 adds symbols, references and routes for the files of a pack and marks them symbols', async () => {
    const { run } = setup(
      {
        'a.tst': 'type Order\nfn total\nuses b.tst\nroute GET /orders\nentity Order\n',
        'b.tst': 'type Line\n',
      },
      [new TestLanguagePack()],
    );

    const result = await run();

    expect(result.symbols).toEqual([
      { path: 'a.tst', kind: 'class', name: 'Order', startLine: 1, endLine: 1 },
      { path: 'a.tst', kind: 'function', name: 'total', startLine: 2, endLine: 2 },
      { path: 'b.tst', kind: 'class', name: 'Line', startLine: 1, endLine: 1 },
    ]);
    expect(result.links).toEqual([{ from: 'a.tst', to: 'b.tst', kind: 'import' }]);
    expect(result.routes).toEqual([
      { path: 'a.tst', startLine: 4, method: 'GET', template: '/orders' },
    ]);
    expect(result.entities).toEqual([
      { name: 'Order', path: 'a.tst', startLine: 5, source: 'test' },
    ]);
    expect(result.fileLevels).toEqual([
      { path: 'a.tst', mapLevel: 'symbols' },
      { path: 'b.tst', mapLevel: 'symbols' },
    ]);
    expect(result.languagePacks).toEqual([{ name: 'test', version: '1.0.0' }]);
  });

  it('RF-112 keeps files without a pack coarse and records no pack as used', async () => {
    const { run } = setup({ 'ledger.cbl': 'MOVE A TO B.\n' }, [new TestLanguagePack()]);

    const result = await run();

    expect(result.fileLevels).toEqual([{ path: 'ledger.cbl', mapLevel: 'coarse' }]);
    expect(result.symbols).toEqual([]);
    expect(result.languagePacks).toEqual([]);
  });
});

describe('analysis with language packs (failures)', () => {
  it('RF-110 falls back to coarse with a warning when a pack fails on one file and goes on', async () => {
    const { run, logger } = setup({ 'bad.tst': 'type Bad\n', 'good.tst': 'type Good\n' }, [
      new TestLanguagePack({ failOn: (path) => path === 'bad.tst' }),
    ]);

    const result = await run();

    expect(result.fileLevels).toEqual([
      { path: 'bad.tst', mapLevel: 'coarse' },
      { path: 'good.tst', mapLevel: 'symbols' },
    ]);
    expect(result.symbols.map((symbol) => symbol.name)).toEqual(['Good']);
    expect(result.warnings).toEqual([{ path: 'bad.tst', pack: 'test', code: 'RST-1200' }]);
    const warnings = logger.entries.filter((entry) => entry.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ logger: 'scan', code: 'RST-1200' });
    expect(warnings[0]?.data).toMatchObject({ path: 'bad.tst', pack: 'test' });
  });
});

describe('analysis with language packs (privacy and skipped files)', () => {
  it('RF-141 never copies the text of a pack failure or of the file into the log', async () => {
    const secret = ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join('');
    const { run, logger } = setup({ 'bad.tst': `boom ${secret}\n` }, [new TestLanguagePack()]);

    const result = await run();

    expect(result.warnings).toHaveLength(1);
    expect(logger.text()).not.toContain(secret);
    expect(logger.text()).not.toContain('boom');
  });

  it('RF-110 keeps skipped and unreadable files coarse without calling the pack', async () => {
    const { run } = setup(
      { 'big.tst': 'type Big\n' },
      [new TestLanguagePack()],
      [
        file('big.tst', { skipped: 'too-large' }),
        file('gone.tst'),
        file('bin.tst', { skipped: 'binary' }),
      ],
    );

    const result = await run();

    expect(result.fileLevels).toEqual([
      { path: 'big.tst', mapLevel: 'coarse' },
      { path: 'bin.tst', mapLevel: 'coarse' },
      { path: 'gone.tst', mapLevel: 'coarse' },
    ]);
    expect(result.symbols).toEqual([]);
  });
});

describe('analysis with language packs (ordering and links)', () => {
  it('RF-106 sorts symbols by path and line whatever order the files arrive in', async () => {
    const { run } = setup(
      { 'z.tst': 'type Z\nfn z2\n', 'a.tst': 'fn a1\ntype A\n' },
      [new TestLanguagePack()],
      [file('z.tst'), file('a.tst')],
    );

    const result = await run();

    expect(result.symbols.map((symbol) => `${symbol.path}:${String(symbol.startLine)}`)).toEqual([
      'a.tst:1',
      'a.tst:2',
      'z.tst:1',
      'z.tst:2',
    ]);
    expect(result.fileLevels.map((level) => level.path)).toEqual(['a.tst', 'z.tst']);
  });

  it('RF-110 resolves a link to a scanned file ignoring case and drops one that points nowhere', async () => {
    const { run, logger } = setup({ 'a.tst': 'uses B.TST\nuses nowhere.tst\n', 'b.tst': '\n' }, [
      new TestLanguagePack(),
    ]);

    const result = await run();

    expect(result.links).toEqual([{ from: 'a.tst', to: 'b.tst', kind: 'import' }]);
    const dropped = logger.entries.filter((entry) => entry.message.includes('outside the scan'));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.data).toMatchObject({ dropped: 1 });
  });
});
