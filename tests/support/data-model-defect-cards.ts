import { readFile } from 'node:fs/promises';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import type { Card } from '../../src/domain/cards/card.js';
import { card } from './data-model-sqlserver-orders.js';
import { base, claim, judgedCard } from './plan-cards.js';

// P7-13, EV-31, EV-40, EV-74, EV-75: the entity cards behind the data-model defects of the
// evaluation of 2026-10-29, written for this repository in new words (a stock workbook, a catalog
// service and an invoice workbook; the same shapes, no text of the evaluated projects), and the
// planner answers of the failing kind in tests/fixtures/planner/. Nothing here is a real application.

/** Asset Manager, Haiku shape: ENT-003 holds movement types and BR-007 lists them (EV-75). */
export function stockCards(): SourceCard[] {
  return [
    card('ENT-002', 'ENT', 'Inventory sheet', [
      'One row per product with the closing stock and the store location.',
      'Store location is STORE ROOM 2 or STORE ROOM 3.',
    ]),
    card('ENT-003', 'ENT', 'Stock In-Out sheet', [
      'The update form writes the product name to A, IN or OUT to B and the quantity to D.',
      'The header row holds Product Name, In/Out, Date and Qty.',
    ]),
    card('BR-007', 'BR', 'Movement type list', [
      'Column B of Stock In-Out accepts only IN, OUT or Opening Stock from a list.',
    ]),
  ];
}

/** Asset Manager, Ollama shape: a sheet whose claims describe work, not fields. */
export function productSheetCards(): SourceCard[] {
  return [
    card('ENT-001', 'ENT', 'Product Master sheet', [
      'Column A holds the product id.',
      'Columns B to F are the metrics used to derive the product status.',
      'Range D:N contains data referenced for valuation lookups.',
    ]),
  ];
}

/** eShop: three lookup and product entities, a service entity and four cards that store nothing. */
export function catalogCards(): SourceCard[] {
  return [
    card('ENT-001', 'ENT', 'CatalogBrand table and entity', [
      'A lookup table of brands with an int identity key and a required brand name.',
    ]),
    card('ENT-002', 'ENT', 'CatalogType table and entity', [
      'A lookup table of product types with an int identity key and a required type name.',
    ]),
    card('ENT-003', 'ENT', 'Catalog table and CatalogItem entity (products)', [
      'The product table: a key, a name, an optional description, a price and the brand and type keys.',
    ]),
    card('ENT-004', 'ENT', 'Catalog item, catalog type and catalog brand', [
      'The service reads and writes catalog items and reads catalog types and brands.',
    ]),
    card('ENT-005', 'ENT', 'SqlDataDeploymentConfiguration', [
      'Holds the connection string that the deployment script uses.',
    ]),
    card('ENT-006', 'ENT', 'CatalogDBContext registration', [
      'The container registers the database context with a per-request lifetime.',
    ]),
    card('ENT-007', 'ENT', 'ApplicationConfigurationParameters', [
      'The class holds the settings read from the configuration file, such as use mock.',
    ]),
    card('ENT-008', 'ENT', 'PaginatedItemsViewModel', [
      'The view model holds the page size and the items shown on one page.',
    ]),
  ];
}

/** Invoice: one table and two cards that describe the workbook, not its data. */
export function invoiceCards(): SourceCard[] {
  return [
    card('ENT-001', 'ENT', 'Invoice Table Structure', [
      'The Invoice table has an invoice number, a net amount and a status.',
    ]),
    card('ENT-002', 'ENT', 'VBA Glossary Table', [
      'The glossary documents the controls and procedures of the workbook.',
    ]),
    card('ENT-003', 'ENT', 'Invoice Generator workbook file', [
      'The workbook file has four sheets and a macro module.',
    ]),
  ];
}

/** The text of a recorded planner answer of the failing kind. */
export function answerText(name: string): Promise<string> {
  return readFile(new URL(`../fixtures/planner/${name}.json`, import.meta.url), 'utf8');
}

/** The same cards as the cards of an understand run, every claim Supported, for a plan run. */
export function runCards(cards: readonly SourceCard[]): Card[] {
  return cards.map((each) =>
    judgedCard(
      {
        ...base(each.id, each.type, each.title),
        claims: each.claims.map((one) => claim(one.text, 'src/Stock/Sheet.cs')),
      },
      each.claims.map(() => 'Supported' as const),
    ),
  );
}

/** P7-32: three per-site sheets of the same columns and a tag list with other columns. */
export function siteSheetCards(): SourceCard[] {
  const columns = 'Columns ap id, label, model and install date, one row per access point.';
  return [
    card('ENT-001', 'ENT', 'Access point site A sheet', [columns]),
    card('ENT-002', 'ENT', 'Access point site B sheet', [columns]),
    card('ENT-003', 'ENT', 'Access point site C sheet', [columns]),
    card('ENT-004', 'ENT', 'Tag list sheet', ['Columns tag id and colour, one row per tag.']),
  ];
}
