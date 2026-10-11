# Scan fixture repositories

Small synthetic repositories for the universal scan tests (P1-19: RF-100..RF-103, RF-124). They are read in place,
never changed by a test; a test that needs extra files (`bin/`, binaries, huge files) copies a fixture to a
temporary folder first.

| Folder | Stack | Proves |
|---|---|---|
| `webforms-csharp/` | C# WebForms with a code-behind, a controller, SQL in strings and SQL scripts | RF-100 walk, RF-101 languages, RF-102 pages, configuration, manifests, RF-103 embedded SQL |
| `php-shop/` | PHP with a front controller, an `.ini` file, `composer.json` and a SQL script | RF-102 and RF-103 in a second stack |
| `cobol-ledger/` | COBOL and JCL, a language with no language pack | RF-102: unfamiliar files are still listed, language `cobol` or `unknown` |

## Sources and licences (RNF-009)

Every file here was written for this repository by the Rosetta contributors and is covered by the repository's MIT
licence. The `webforms-csharp` sample imitates the shape of the demo application
[dotnet-architecture/eShopModernizing](https://github.com/dotnet-architecture/eShopModernizing) (MIT licence,
Copyright (c) .NET Foundation and Contributors): a catalog page with a code-behind class, a `Web.config` and a
`packages.config`. **No text is copied from it**; the names `Catalog`, `Default.aspx` and `Details.aspx` follow its
vocabulary only. If a real excerpt is added later, it must carry its source path, commit and this licence notice in
this table.

Nothing here comes from the owner's employer (DEC-03).
