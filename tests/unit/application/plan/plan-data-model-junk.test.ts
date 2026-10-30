import { describe, expect, it } from 'vitest';
import { planDataModel } from '../../../../src/application/plan/plan-data-model.js';
import { briefOf, card } from '../../../support/data-model-sqlserver-orders.js';
import {
  answerText,
  catalogCards,
  invoiceCards,
} from '../../../support/data-model-defect-cards.js';
import { scriptedPlanner } from '../../../support/batched-model-planner.js';

// P7-13, RF-603, RF-623, EV-31, EV-40: the eShop and Invoice answers of the evaluation of
// 2026-10-29 planned through planDataModel: one table for a table and its plural twin, none for a
// card that stores nothing, and a line in the Data model checks for each.

async function planned(name: string, cards: ReturnType<typeof catalogCards>) {
  const answer = await answerText(name);
  const { call, requests } = scriptedPlanner({ maxEntities: 20, answer });
  const result = await planDataModel(call, { cards, brief: briefOf('SQL Server') });
  return { ...result, requests };
}

const namesOf = (result: Awaited<ReturnType<typeof planned>>) =>
  result.assembly.model.tables.map((each) => each.name);

describe('planDataModel: the eShop answer', () => {
  it('RF-603 has one table for catalog_brand and catalog_brands, with both sources', async () => {
    const result = await planned('data-model-eshop-duplicates', catalogCards());

    expect(namesOf(result)).toEqual(['catalog_brand', 'catalog_type', 'catalog_item']);
    const brand = result.assembly.model.tables[0];
    expect(brand?.sources).toEqual(['ENT-001', 'ENT-004']);
  });

  it('RF-603 points the foreign key of the item at the table kept', async () => {
    const result = await planned('data-model-eshop-duplicates', catalogCards());

    const item = result.assembly.model.tables.find((each) => each.name === 'catalog_item');
    expect(item?.foreignKeys.map((key) => key.references)).toEqual(['catalog_brand']);
  });
});

describe('planDataModel: the eShop answer, cards that store nothing', () => {
  it('RF-623 has no table for configuration, registration, parameters or a view model', async () => {
    const result = await planned('data-model-eshop-duplicates', catalogCards());

    expect(namesOf(result).join(' ')).not.toMatch(/configuration|registration|viewmodel/u);
  });

  it('RF-623 does not send the cards that store nothing to the planner', async () => {
    const result = await planned('data-model-eshop-duplicates', catalogCards());

    const sent = result.requests
      .map((each) => each.messages.map((m) => m.content).join(''))
      .join('');
    expect(sent).toContain('ENT-004');
    for (const id of ['ENT-005', 'ENT-006', 'ENT-007', 'ENT-008']) expect(sent).not.toContain(id);
  });

  it('RF-623 lists each skipped card and each merge as a check', async () => {
    const result = await planned('data-model-eshop-duplicates', catalogCards());

    const checks = result.problems.filter((each) => each.kind === 'check');
    expect(checks.filter((each) => each.field === 'entity card').map((each) => each.item)).toEqual([
      ...['ENT-005', 'ENT-006', 'ENT-007', 'ENT-008'],
    ]);
    const merge = checks.find((each) => each.item === 'catalog_brand');
    expect(merge?.reason).toContain('catalog_brands');
    expect(result.flagged).toBe(result.problems.filter((each) => each.kind === 'check').length);
  });

  it('RF-623 lists a legacy claim of a skipped card as neither mapped nor dropped', async () => {
    const result = await planned('data-model-eshop-duplicates', catalogCards());

    const dropped = result.assembly.model.dropped.map((each) => each.cardId);
    expect(
      dropped.filter((id) => ['ENT-005', 'ENT-006', 'ENT-007', 'ENT-008'].includes(id)),
    ).toEqual([]);
  });
});

describe('planDataModel: the Invoice answer', () => {
  it('RF-623 has no table for the workbook file or its glossary', async () => {
    const result = await planned('data-model-invoice-junk', invoiceCards());

    expect(namesOf(result)).toEqual(['invoice']);
  });

  it('RF-623 lists text on SQL Server as a deprecated type of a column the model keeps', async () => {
    const result = await planned('data-model-invoice-junk', invoiceCards());

    const problem = result.problems.find((each) => each.item === 'status');
    expect(problem?.kind).toBe('check');
    expect(problem?.reason).toContain('varchar(max)');
  });
});

describe('planDataModel: the note of a merge lists the columns united', () => {
  it('RF-623 names the separator twin of a column in the note', async () => {
    const column = (name: string) => ({
      name,
      type: 'int',
      nullable: true,
      legacy: null,
      risk: '',
    });
    const table = (name: string, columns: string[]) => ({
      ...{ name, purpose: 'Keeps rows.', sources: ['ENT-003'], primaryKey: [], uniqueKeys: [] },
      ...{ columns: columns.map(column), foreignKeys: [], checks: [], indexes: [] },
    });
    const answer = JSON.stringify({
      tables: [
        table('catalog_item', ['picture_file_name']),
        table('catalog_items', ['picturefilename']),
      ],
      dropped: [],
    });
    const { call } = scriptedPlanner({ maxEntities: 20, answer });

    const result = await planDataModel(call, {
      cards: catalogCards(),
      brief: briefOf('SQL Server'),
    });

    const note = result.problems.find((each) => each.item === 'catalog_item');
    expect(note?.reason).toContain('picturefilename');
    expect(result.assembly.model.tables[0]?.columns.map((each) => each.name)).toEqual([
      'picture_file_name',
    ]);
  });
});

describe('planDataModel: a configuration card that states stored data reaches the planner', () => {
  it('RF-623 sends ENT-120 and gives the price its precision of 19,4', async () => {
    const cards = [
      card('ENT-120', 'ENT', 'EntityModel Configuration and Entities', [
        'Column CatalogItem.Price: decimal(19,4), NOT NULL.',
      ]),
    ];
    const column = {
      ...{ name: 'price', type: 'decimal(18,2)', nullable: false, risk: '' },
      legacy: { claim: 'ENT-120.c1', field: 'Price' },
    };
    const table = {
      ...{ name: 'catalog_item', purpose: 'Keeps the products.', sources: ['ENT-120'] },
      ...{ columns: [column], primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [] },
      indexes: [],
    };
    const { call, requests } = scriptedPlanner({
      maxEntities: 20,
      answer: JSON.stringify({ tables: [table], dropped: [] }),
    });

    const result = await planDataModel(call, { cards, brief: briefOf('SQL Server') });

    const sent = requests.map((each) => each.messages.map((m) => m.content).join('')).join('');
    expect(sent).toContain('ENT-120');
    const price = result.assembly.model.tables[0]?.columns[0];
    expect(price?.type).toBe('decimal(19,4)');
    expect(result.problems.filter((each) => each.field === 'entity card')).toEqual([]);
  });
});

describe('planDataModel: Left out after the merge', () => {
  it('RF-623 does not list a column the merged model keeps as left out', async () => {
    const column = (name: string, type: unknown) => ({ name, type, nullable: true, risk: '' });
    const table = (name: string, columns: unknown[]) => ({
      ...{ name, purpose: 'Keeps rows.', sources: ['ENT-001'], primaryKey: [], uniqueKeys: [] },
      ...{ columns, foreignKeys: [], checks: [], indexes: [] },
    });
    const answer = JSON.stringify({
      tables: [
        table('catalog_brand', [column('id', 'int'), column('brand', 5)]),
        table('catalog_brands', [column('id', 'int'), column('brand', 'nvarchar(100)')]),
      ],
      dropped: [],
    });
    const { call } = scriptedPlanner({ maxEntities: 20, answer });

    const result = await planDataModel(call, {
      cards: catalogCards(),
      brief: briefOf('SQL Server'),
    });

    const names = result.assembly.model.tables[0]?.columns.map((each) => each.name);
    expect(names).toEqual(['id', 'brand']);
    const rows = result.problems.filter((each) => each.item === 'brand');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((each) => each.kind === 'check')).toBe(true);
    expect(rows[0]?.reason).toContain('malformed copy');
  });
});
