import { describe, expect, it } from 'vitest';
import type { ScannedFile } from '../../../../src/infrastructure/scan/universal/scan-types.js';
import { scanTree, fixtureRoot } from '../../../support/scan-harness.js';

function entry(files: readonly ScannedFile[], path: string): ScannedFile | undefined {
  return files.find((file) => file.path === path);
}

describe('universal scan of the C# WebForms fixture', () => {
  it('RF-100 lists every file, sorted by path, with forward slashes', async () => {
    const { scan } = await scanTree(fixtureRoot('webforms-csharp'));

    expect(scan.files.map((file) => file.path)).toEqual([
      'Catalog/Details.aspx',
      'Catalog/Details.aspx.cs',
      'Controllers/CatalogController.cs',
      'Database/schema.sql',
      'Database/seed.sql',
      'Default.aspx',
      'Default.aspx.cs',
      'Global.asax',
      'Global.asax.cs',
      'Services/CatalogService.cs',
      'ShopWeb.csproj',
      'Web.config',
      'packages.config',
    ]);
  });

  it('RF-101 records language, lines, estimated tokens and a content hash', async () => {
    const { scan } = await scanTree(fixtureRoot('webforms-csharp'));

    const { sha256, ...facts } = entry(scan.files, 'Default.aspx.cs') ?? { path: 'missing' };

    expect(sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(facts).toEqual({
      path: 'Default.aspx.cs',
      language: 'csharp',
      lines: 14,
      estimatedTokens: 79,
      artefactKinds: [],
    });
    expect(entry(scan.files, 'Default.aspx')?.language).toBe('aspnet');
    expect(entry(scan.files, 'Database/schema.sql')?.language).toBe('sql');
  });
});

describe('universal scan of the C# WebForms fixture (continued)', () => {
  it('RF-102 tags pages, controllers, entry points, configuration, scripts and manifests', async () => {
    const { scan } = await scanTree(fixtureRoot('webforms-csharp'));
    const kinds = Object.fromEntries(scan.files.map((file) => [file.path, file.artefactKinds]));

    expect(kinds).toEqual({
      'Catalog/Details.aspx': ['page'],
      'Catalog/Details.aspx.cs': [],
      'Controllers/CatalogController.cs': ['controller'],
      'Database/schema.sql': ['database-script'],
      'Database/seed.sql': ['database-script'],
      'Default.aspx': ['page'],
      'Default.aspx.cs': [],
      'Global.asax': ['entry-point'],
      'Global.asax.cs': ['entry-point'],
      'Services/CatalogService.cs': [],
      'ShopWeb.csproj': ['manifest'],
      'Web.config': ['configuration'],
      'packages.config': ['manifest'],
    });
  });
});

describe('universal scan of the C# WebForms fixture (part 2)', () => {
  it('RF-103 records SQL from scripts and string literals with path and line', async () => {
    const { scan } = await scanTree(fixtureRoot('webforms-csharp'));

    expect(scan.sqlStatements.map((s) => `${s.path}:${String(s.line)} ${s.verb}`)).toEqual([
      'Database/schema.sql:2 CREATE',
      'Database/schema.sql:8 CREATE',
      'Database/seed.sql:1 INSERT',
      'Database/seed.sql:2 INSERT',
      'Database/seed.sql:5 DELETE',
      'Services/CatalogService.cs:7 SELECT',
      'Services/CatalogService.cs:12 UPDATE',
      'Services/CatalogService.cs:13 INSERT',
    ]);
    expect(scan.sqlStatements.at(-1)?.text).toBe(
      'INSERT INTO AuditLog (Message, At) VALUES (@message, GETDATE())',
    );
  });

  it('RF-103 an ordinary sentence in a string literal is not recorded as SQL', async () => {
    const { scan } = await scanTree(fixtureRoot('webforms-csharp'));

    expect(scan.sqlStatements.some((s) => s.text.startsWith('Select an item'))).toBe(false);
  });
});

describe('universal scan of the C# WebForms fixture (part 3)', () => {
  it('RF-124 with a subpath only its files are listed, with paths from the repository root', async () => {
    const { scan } = await scanTree(fixtureRoot('webforms-csharp'), { subpath: 'Catalog' });

    expect(scan.files.map((file) => file.path)).toEqual([
      'Catalog/Details.aspx',
      'Catalog/Details.aspx.cs',
    ]);
    expect(scan.sqlStatements).toEqual([]);
  });

  it('RF-106 two scans of the same snapshot give the same result', async () => {
    const first = await scanTree(fixtureRoot('webforms-csharp'));
    const second = await scanTree(fixtureRoot('webforms-csharp'));

    expect(second.scan).toEqual(first.scan);
  });
});

describe('universal scan of the PHP fixture', () => {
  it('RF-102 tags the PHP stack by the same rules', async () => {
    const { scan } = await scanTree(fixtureRoot('php-shop'));
    const kinds = Object.fromEntries(scan.files.map((file) => [file.path, file.artefactKinds]));

    expect(kinds).toEqual({
      'composer.json': ['manifest'],
      'config.ini': ['configuration'],
      'index.php': ['entry-point', 'page'],
      'sql/create.sql': ['database-script'],
      'src/OrderController.php': ['controller', 'page'],
      'src/helpers.php': ['page'],
    });
    expect(entry(scan.files, 'index.php')?.language).toBe('php');
  });

  it('RF-103 records the SQL in PHP strings and in the script', async () => {
    const { scan } = await scanTree(fixtureRoot('php-shop'));

    expect(scan.sqlStatements.map((s) => `${s.path}:${String(s.line)} ${s.verb}`)).toEqual([
      'sql/create.sql:1 CREATE',
      'sql/create.sql:2 EXEC',
      'src/OrderController.php:6 SELECT',
      'src/OrderController.php:7 DELETE',
    ]);
  });
});

describe('universal scan of a stack with no language pack', () => {
  it('RF-102 files with no known kind are still listed, with their language or unknown', async () => {
    const { scan } = await scanTree(fixtureRoot('cobol-ledger'));

    expect(scan.files.map((file) => [file.path, file.language, file.artefactKinds])).toEqual([
      ['ACCOUNT.cpy', 'cobol', []],
      ['LEDGER.cbl', 'cobol', []],
      ['RUN.jcl', 'unknown', []],
      ['notes.xyz', 'unknown', []],
    ]);
    expect(scan.files.every((file) => file.lines > 0 && file.estimatedTokens > 0)).toBe(true);
    expect(scan.sqlStatements).toEqual([]);
  });
});
