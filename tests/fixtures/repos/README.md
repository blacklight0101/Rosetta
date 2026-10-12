# Scan fixture repositories

Small synthetic repositories for the scan and agent tests (P1-19: RF-100..RF-103, RF-124; P1-21: RF-110, RF-111; P1-20: RF-104..RF-106, RF-112). They are read in place,
never changed by a test; a test that needs extra files (`bin/`, binaries, huge files) copies a fixture to a
temporary folder first.

| Folder | Stack | Proves |
|---|---|---|
| `webforms-csharp/` | C# WebForms with a code-behind, a controller, SQL in strings and SQL scripts | RF-100 walk, RF-101 languages, RF-102 pages, configuration, manifests, RF-103 embedded SQL |
| `webforms-ef/` | C# WebForms with an Entity Framework `DbContext`, a master page, a user control and pages with and without a code-behind | RF-111 symbols, code-behind links and candidate entities (P1-21) |
| `php-shop/` | PHP with a front controller, an `.ini` file, `composer.json` and a SQL script | RF-102 and RF-103 in a second stack |
| `cobol-ledger/` | COBOL and JCL, a language with no language pack | RF-102: unfamiliar files are still listed, language `cobol` or `unknown` |
| `injection/` | C# with comments and a README that give orders to AI agents, a marker look-alike and a request to read `../../.env` | RF-145: planted instructions stay data; the refused read is logged (P1-31) |

## Sources and licences (RNF-009)

Every file here was written for this repository by the Rosetta contributors and is covered by the repository's MIT
licence. The `webforms-csharp` sample imitates the shape of the demo application
[dotnet-architecture/eShopModernizing](https://github.com/dotnet-architecture/eShopModernizing) (MIT licence,
Copyright (c) .NET Foundation and Contributors): a catalog page with a code-behind class, a `Web.config`, a
`packages.config`, and (in `webforms-ef/`) a `CatalogDBContext` with `DbSet` properties, a master page and a user control. **No text is copied from it**; the names `Catalog`, `Default.aspx` and `Details.aspx` follow its
vocabulary only. If a real excerpt is added later, it must carry its source path, commit and this licence notice in
this table.

Nothing here comes from the owner's employer (DEC-03).
