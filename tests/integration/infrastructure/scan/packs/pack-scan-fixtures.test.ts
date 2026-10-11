import { beforeAll, describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { CSharpPack } from '../../../../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../../../../src/infrastructure/scan/packs/pack-registry.js';
import {
  analyseWithPacks,
  type PackScan,
} from '../../../../../src/infrastructure/scan/packs/pack-scan.js';
import { composeLanguagePacks } from '../../../../../src/presentation/composition-root.js';
import { FixedClock } from '../../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../../support/memory-logger.js';
import { TestLanguagePack } from '../../../../support/test-language-pack.js';
import { fixtureRoot, scanTree, type FixtureRepository } from '../../../../support/scan-harness.js';

const maxFileBytes = 1_000_000;

function newLogger(): MemoryLogger {
  return new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
}

async function analyseFixture(
  name: FixtureRepository,
  registry: LanguagePackRegistry,
  logger = newLogger(),
): Promise<PackScan> {
  const { scan, reader } = await scanTree(fixtureRoot(name));
  return analyseWithPacks({ files: scan.files, reader, registry, logger, maxFileBytes });
}

let csharp: CSharpPack;

beforeAll(async () => {
  csharp = await CSharpPack.create();
});

describe('C# pack on the WebForms fixtures', () => {
  it('RF-111 records the symbols of the C# files and marks them symbols, the rest coarse', async () => {
    const result = await analyseFixture('webforms-csharp', new LanguagePackRegistry([csharp]));

    const levels = Object.fromEntries(result.fileLevels.map((l) => [l.path, l.mapLevel]));
    expect(levels['Default.aspx.cs']).toBe('symbols');
    expect(levels['Services/CatalogService.cs']).toBe('symbols');
    expect(levels['Default.aspx']).toBe('symbols');
    expect(levels['Web.config']).toBe('coarse');
    expect(levels['Database/schema.sql']).toBe('coarse');
    const service = result.symbols.filter((s) => s.path === 'Services/CatalogService.cs');
    expect(
      service.map((s) => `${s.kind}:${s.name}:${String(s.startLine)}-${String(s.endLine)}`),
    ).toEqual(['class:CatalogService:5-17', 'method:List:10-16']);
    expect(result.languagePacks).toEqual([{ name: 'csharp', version: csharp.version }]);
  });

  it('RF-111 links each page to its code-behind class and drops a link to a missing file', async () => {
    const logger = newLogger();
    const result = await analyseFixture('webforms-ef', new LanguagePackRegistry([csharp]), logger);

    expect(result.links).toEqual([
      {
        from: 'Admin/Edit.aspx',
        to: 'Admin/Edit.aspx.cs',
        kind: 'code-behind',
        symbol: 'ShopWeb.Admin.EditPage',
      },
      {
        from: 'Controls/Banner.ascx',
        to: 'Controls/Banner.ascx.cs',
        kind: 'code-behind',
        symbol: 'ShopWeb.Controls.Banner',
      },
      {
        from: 'Site.master',
        to: 'Site.master.cs',
        kind: 'code-behind',
        symbol: 'ShopWeb.SiteMaster',
      },
    ]);
    const dropped = logger.entries.filter((e) => e.message.includes('outside the scan'));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.data).toMatchObject({ dropped: 1 });
    const edit = result.symbols.find((s) => s.name === 'EditPage');
    expect(edit).toMatchObject({ path: 'Admin/Edit.aspx.cs', container: 'ShopWeb.Admin' });
  });

  it('RF-111 records the entity sets of the DbContext as candidate entities', async () => {
    const result = await analyseFixture('webforms-ef', new LanguagePackRegistry([csharp]));

    expect(result.entities).toEqual([
      {
        name: 'CatalogItem',
        path: 'Models/CatalogDBContext.cs',
        startLine: 11,
        source: 'ShopWeb.Models.CatalogDBContext.CatalogItems',
      },
      {
        name: 'CatalogBrand',
        path: 'Models/CatalogDBContext.cs',
        startLine: 13,
        source: 'ShopWeb.Models.CatalogDBContext.CatalogBrands',
      },
    ]);
  });

  it('RF-106 gives the same result when the analysis runs twice', async () => {
    const registry = new LanguagePackRegistry([csharp]);

    const first = await analyseFixture('webforms-ef', registry);
    const second = await analyseFixture('webforms-ef', registry);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('a failing pack on a real snapshot', () => {
  it('RF-110 keeps the file coarse, warns and still maps every other file', async () => {
    const failing = new TestLanguagePack({
      name: 'flaky',
      extensions: ['.cs'],
      failOn: (path) => path === 'Default.aspx.cs',
    });
    const logger = newLogger();

    const result = await analyseFixture(
      'webforms-csharp',
      new LanguagePackRegistry([failing]),
      logger,
    );

    const levels = Object.fromEntries(result.fileLevels.map((l) => [l.path, l.mapLevel]));
    expect(levels['Default.aspx.cs']).toBe('coarse');
    expect(levels['Global.asax.cs']).toBe('symbols');
    expect(levels['Services/CatalogService.cs']).toBe('symbols');
    expect(result.warnings).toEqual([{ path: 'Default.aspx.cs', pack: 'flaky', code: 'RST-1200' }]);
    expect(logger.entries.filter((e) => e.level === 'warn')).toHaveLength(1);
  });

  it('RF-112 maps a language with no pack as coarse and the scan completes', async () => {
    const result = await analyseFixture('cobol-ledger', new LanguagePackRegistry([csharp]));

    expect(result.fileLevels.every((l) => l.mapLevel === 'coarse')).toBe(true);
    expect(result.symbols).toEqual([]);
    expect(result.languagePacks).toEqual([]);
  });
});

describe('the composition root', () => {
  it('RF-110 registers the C# pack for .cs, .aspx, .ascx and .master', async () => {
    const registry = await composeLanguagePacks();

    for (const path of ['a.cs', 'Page.aspx', 'Control.ascx', 'Site.master']) {
      expect(registry.packFor(path)?.name).toBe('csharp');
    }
    expect(registry.packFor('main.php')).toBeUndefined();
  });
});
