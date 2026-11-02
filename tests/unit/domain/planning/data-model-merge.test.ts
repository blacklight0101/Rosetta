import { describe, expect, it } from 'vitest';
import type { DraftTable } from '../../../../src/domain/planning/data-model.js';
import { assembleDataModel } from '../../../../src/domain/planning/data-model-assembly.js';
import { mergedDrafts } from '../../../../src/domain/planning/data-model-merge.js';
import { legacyClaimsOf } from '../../../../src/domain/planning/data-model.js';
import { catalogCards } from '../../../support/data-model-defect-cards.js';

// P7-13, RF-603, RF-623, EV-31, EV-40: tables whose names differ only by plural, case or separators
// are one table: their sources and columns are united and the keys that pointed at the others now
// point at the one kept.

function table(name: string, rest: Partial<DraftTable> = {}): DraftTable {
  return {
    ...{ name, purpose: 'Keeps rows.', sources: [], primaryKey: ['id'], uniqueKeys: [] },
    ...{ columns: [{ name: 'id', type: 'int', nullable: false, legacy: null, risk: '' }] },
    ...{ foreignKeys: [], checks: [], indexes: [] },
    ...rest,
  };
}

function column(name: string) {
  return { name, type: 'int', nullable: true, legacy: null, risk: '' };
}

const namesOf = (tables: readonly DraftTable[]) => tables.map((each) => each.name);

describe('mergedDrafts', () => {
  it('RF-603 merges catalog_brand and catalog_brands into the first, with both sources and columns', () => {
    const { tables, merges } = mergedDrafts([
      table('catalog_brand', { sources: ['ENT-001'], columns: [column('id'), column('brand')] }),
      table('catalog_type'),
      table('catalog_brands', { sources: ['ENT-004'], columns: [column('id'), column('size')] }),
    ]);

    expect(namesOf(tables)).toEqual(['catalog_brand', 'catalog_type']);
    expect(tables[0]?.sources).toEqual(['ENT-001', 'ENT-004']);
    expect(tables[0]?.columns.map((each) => each.name)).toEqual(['id', 'brand', 'size']);
    expect(merges).toEqual([{ kept: 'catalog_brand', merged: ['catalog_brands'] }]);
  });

  it('RF-603 merges names that differ by case or by separators', () => {
    const { tables, merges } = mergedDrafts([
      table('catalog_item'),
      table('Catalog_Item'),
      table('catalogitem'),
    ]);

    expect(namesOf(tables)).toEqual(['catalog_item']);
    expect(merges[0]?.merged).toEqual(['Catalog_Item', 'catalogitem']);
  });

  it('RF-603 merges ies and es plurals and a table written twice', () => {
    const { tables } = mergedDrafts([
      ...[table('category'), table('categories'), table('status'), table('statuses')],
      ...[table('order_line'), table('order_line')],
    ]);

    expect(namesOf(tables)).toEqual(['category', 'status', 'order_line']);
  });

  it('RF-603 keeps tables whose names only look alike', () => {
    const names = ['address', 'addres', 'status', 'statu', 'order', 'order_line', 'orders_line_x'];
    const { tables, merges } = mergedDrafts(names.map((each) => table(each)));

    expect(namesOf(tables)).toEqual(names);
    expect(merges).toEqual([]);
  });
});

describe('mergedDrafts: what stays', () => {
  it('RF-603 leaves a name that is not an identifier alone', () => {
    const { tables } = mergedDrafts([table('a b'), table('a b')]);

    expect(tables).toHaveLength(2);
  });

  it('RF-603 points the keys of the other tables at the table kept and joins keys without repeating them', () => {
    const key = { columns: ['brand_id'], references: 'catalog_brands', referencedColumns: ['id'] };
    const { tables } = mergedDrafts([
      table('catalog_brand', { checks: ['brand is not empty'] }),
      table('catalog_item', { foreignKeys: [key] }),
      table('catalog_brands', { checks: ['brand is not empty', 'brand is short'] }),
    ]);

    expect(tables[1]?.foreignKeys).toEqual([{ ...key, references: 'catalog_brand' }]);
    expect(tables[0]?.checks).toEqual(['brand is not empty', 'brand is short']);
  });
});

describe('assembleDataModel: merged tables', () => {
  it('RF-623 reports the merge and counts nothing as left out', () => {
    const draft = {
      tables: [table('catalog_brand', { sources: ['ENT-001'] }), table('catalog_brands')],
      dropped: [],
    };

    const { model, merged, leftOut } = assembleDataModel(
      draft,
      legacyClaimsOf(catalogCards()),
      null,
    );

    expect(model.tables.map((each) => each.name)).toEqual(['catalog_brand']);
    expect(merged).toEqual([{ kept: 'catalog_brand', merged: ['catalog_brands'] }]);
    expect(leftOut.tables).toBe(0);
  });
});
