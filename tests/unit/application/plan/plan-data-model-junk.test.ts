import { describe, expect, it } from 'vitest';
import { planDataModel } from '../../../../src/application/plan/plan-data-model.js';
import { briefOf } from '../../../support/data-model-sqlserver-orders.js';
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
