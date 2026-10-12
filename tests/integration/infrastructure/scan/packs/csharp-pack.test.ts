import { beforeAll, describe, expect, it } from 'vitest';
import type { PackAnalysis } from '../../../../../src/application/ports/language-pack.js';
import { CSharpPack } from '../../../../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { languagePackContract } from '../../../../contracts/language-pack.contract.js';

let pack: CSharpPack;

beforeAll(async () => {
  pack = await CSharpPack.create();
});

function analyse(text: string, path = 'A.cs'): PackAnalysis {
  return pack.analyse({ path, text });
}

const sample = `using System;
namespace Shop.Models
{
    public class Order
    {
        public int Id { get; set; }

        public decimal Total()
        {
            return 1;
        }
    }
}
`;

languagePackContract('CSharpPack', () => CSharpPack.create(), { path: 'Order.cs', text: sample });

describe('C# pack symbols', () => {
  it('RF-111 records classes, interfaces, methods and properties with their line ranges', () => {
    const { symbols } = analyse(sample);

    expect(symbols).toEqual([
      {
        path: 'A.cs',
        kind: 'class',
        name: 'Order',
        startLine: 4,
        endLine: 12,
        container: 'Shop.Models',
      },
      {
        path: 'A.cs',
        kind: 'property',
        name: 'Id',
        startLine: 6,
        endLine: 6,
        container: 'Shop.Models.Order',
      },
      {
        path: 'A.cs',
        kind: 'method',
        name: 'Total',
        startLine: 8,
        endLine: 11,
        container: 'Shop.Models.Order',
      },
    ]);
  });

  it('RF-111 records interfaces, structs, enums and records and qualifies nested types', () => {
    const { symbols } = analyse(
      'namespace N { interface IA { void M(); } struct S { } enum E { X, Y } record R(int A); class Outer { class Inner { void F() { } } } }',
    );

    expect(symbols.map((s) => `${s.kind}:${s.container ?? ''}.${s.name}`)).toEqual([
      'interface:N.IA',
      'method:N.IA.M',
      'struct:N.S',
      'enum:N.E',
      'class:N.R',
      'class:N.Outer',
      'class:N.Outer.Inner',
      'method:N.Outer.Inner.F',
    ]);
  });
});

describe('C# pack symbols (part 2)', () => {
  it('RF-111 handles file-scoped namespaces and declarations inside preprocessor blocks', () => {
    const { symbols } = analyse(
      'namespace A.B;\n#if DEBUG\npublic class C1 { }\n#else\npublic class C2 { }\n#endif\nclass C3 { }\n',
    );

    expect(symbols.map((s) => `${s.container ?? ''}.${s.name}@${String(s.startLine)}`)).toEqual([
      'A.B.C1@3',
      'A.B.C2@5',
      'A.B.C3@7',
    ]);
  });

  it('RF-111 does not record constructors, fields or local functions', () => {
    const { symbols } = analyse('class K { int field; K() { } void M() { void Local() { } } }');

    expect(symbols.map((s) => s.name)).toEqual(['K', 'M']);
  });
});

describe('C# pack entity sets', () => {
  const context = `using System.Data.Entity;
namespace Shop
{
    public class CatalogDBContext : DbContext
    {
        public DbSet<CatalogItem> CatalogItems { get; set; }
        public virtual System.Data.Entity.IDbSet<CatalogBrand> Brands { get; set; }
        public string LastQuery { get; set; }
    }

    public class Helper
    {
        public DbSet<NotAnEntity> Stray { get; set; }
    }
}
`;

  it('RF-111 records the entity sets of a DbContext as candidate entities', () => {
    const { entities } = analyse(context);

    expect(entities).toEqual([
      {
        name: 'CatalogItem',
        path: 'A.cs',
        startLine: 6,
        source: 'Shop.CatalogDBContext.CatalogItems',
      },
      { name: 'CatalogBrand', path: 'A.cs', startLine: 7, source: 'Shop.CatalogDBContext.Brands' },
    ]);
  });

  it('RF-111 recognises generic context bases and EF Core style expression-bodied sets', () => {
    const { entities } = analyse(
      'class Ctx : IdentityDbContext<User> { public DbSet<Order> Orders => Set<Order>(); }',
    );

    expect(entities.map((e) => e.name)).toEqual(['Order']);
  });

  it('RF-111 records no entity for a class that does not derive from a DbContext', () => {
    expect(analyse('class Plain : Base { public DbSet<X> Xs { get; set; } }').entities).toEqual([]);
  });
});

describe('C# pack WebForms links', () => {
  it('RF-111 links an .aspx page, a .master page and an .ascx control to their code-behind', () => {
    const page = pack.analyse({
      path: 'Admin/Edit.aspx',
      text: '<%@ Page CodeBehind="Edit.aspx.cs" Inherits="Shop.Admin.EditPage" %>\n',
    });
    const master = pack.analyse({
      path: 'Site.master',
      text: '<%@ Master CodeBehind="Site.master.cs" Inherits="Shop.SiteMaster" %>\n',
    });
    const control = pack.analyse({
      path: 'Controls/Banner.ascx',
      text: '<%@ Control CodeBehind="Banner.ascx.cs" Inherits="Shop.Banner" %>\n',
    });

    expect(page.references).toEqual([
      {
        from: 'Admin/Edit.aspx',
        to: 'Admin/Edit.aspx.cs',
        kind: 'code-behind',
        symbol: 'Shop.Admin.EditPage',
      },
    ]);
    expect(master.references[0]?.to).toBe('Site.master.cs');
    expect(control.references[0]?.to).toBe('Controls/Banner.ascx.cs');
    expect(page.symbols).toEqual([]);
  });
});

describe('C# pack on hostile input', () => {
  it.each([
    ['unbalanced braces', 'class Good { void M() { } }\nclass Broken { void (( {{ '],
    ['an opening brace only', 'class{{{'],
    ['an unterminated #if', '#if DEBUG\nclass A { }\n#else\nclass B {'],
  ])('RF-110 refuses a file with syntax errors (%s) with RST-1200', (_label, text) => {
    expect(() => analyse(text)).toThrow(expect.objectContaining({ code: 'RST-1200' }));
  });

  it('RNF-001 survives thousands of nested namespaces and braces without a stack overflow', () => {
    const depth = 5000;
    const text = `${'namespace N {'.repeat(depth)}class C { }${'}'.repeat(depth)}`;

    expect(() => analyse(text)).toThrow(expect.objectContaining({ code: 'RST-1200' }));
  });

  it('RNF-001 refuses text above the size cap with RST-1200', () => {
    const big = `class C { }\n${'// padding\n'.repeat(250_000)}`;

    expect(() => analyse(big)).toThrow(expect.objectContaining({ code: 'RST-1200' }));
  });

  it('RNF-001 refuses a file with more declarations than the cap with RST-1200', () => {
    const text = `class C {${' int P { get; }'.repeat(10_001)} }`;

    expect(() => analyse(text)).toThrow(expect.objectContaining({ code: 'RST-1200' }));
  });

  it('RNF-001 stops a parse that runs past its time budget with RST-1200', async () => {
    const slow = await CSharpPack.create({ parseBudgetMs: -1 });

    expect(() => slow.analyse({ path: 'A.cs', text: sample })).toThrow(
      expect.objectContaining({ code: 'RST-1200' }),
    );
  });

  it('RF-110 stops a parse when the scan-wide parse budget says to stop', () => {
    expect(() => pack.analyse({ path: 'A.cs', text: sample, shouldStop: () => true })).toThrow(
      expect.objectContaining({ code: 'RST-1200' }),
    );
  });

  it('RNF-001 reports no secret from a string literal in a symbol name', () => {
    const { symbols } = analyse(
      'class C { string Key = "' + ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join('') + '"; void M() { } }',
    );

    expect(JSON.stringify(symbols)).not.toContain('AKIA');
  });
});
