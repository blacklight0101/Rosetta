import { describe, expect, it } from 'vitest';
import type { DraftColumn, DraftTable } from '../../../../src/domain/planning/data-model.js';
import { mergedDrafts } from '../../../../src/domain/planning/data-model-merge.js';

// P7-13 round 2, RF-623, EV-31: the columns of merged tables are united by the same key as the
// tables (case, separators, plural), so a merge never turns a duplicate table into duplicate
// columns; the key does not strip an s from a short word or join the parts of a split word.

function column(name: string, type = 'int'): DraftColumn {
  return { name, type, nullable: true, legacy: null, risk: '' };
}

function table(name: string, columns: readonly string[] = ['id']): DraftTable {
  return {
    ...{ name, purpose: 'Keeps rows.', sources: [], primaryKey: [], uniqueKeys: [] },
    ...{ columns: columns.map((each) => column(each)), foreignKeys: [], checks: [], indexes: [] },
  };
}

const namesOf = (tables: readonly DraftTable[]) => tables.map((each) => each.name);

describe('mergedDrafts: the columns of a merge (Ollama eShop catalog_item)', () => {
  const item = ['id', 'name', 'description', 'price', 'picture_file_name', 'catalog_type_id'];
  const more = ['catalog_brand_id', 'available_stock', 'restock_threshold', 'max_stock_threshold'];
  const other = ['on_reorder', 'picture_uri'];
  const twins = [...item, ...more, ...other];
  const flat = twins.map((each) => each.replaceAll('_', ''));

  it('RF-623 keeps one column for each separator twin and the first spelling', () => {
    const { tables } = mergedDrafts([table('catalog_item', twins), table('catalog_items', flat)]);

    expect(tables).toHaveLength(1);
    expect(tables[0]?.columns.map((each) => each.name)).toEqual(twins);
  });

  it('RF-623 lists the columns it united in the note of the merge', () => {
    const { merges } = mergedDrafts([table('catalog_item', twins), table('catalog_items', flat)]);

    expect(merges[0]?.columns).toEqual(flat.filter((each, at) => each !== twins[at]));
  });

  it('RF-623 keeps a column that only the other table has, and plural twins of a column', () => {
    const { tables } = mergedDrafts([
      table('catalog_item', ['id', 'tag']),
      table('catalog_items', ['ID', 'tags', 'size']),
    ]);

    expect(tables[0]?.columns.map((each) => each.name)).toEqual(['id', 'tag', 'size']);
  });

  it('RF-623 does not unite a column with a longer name that holds the same word', () => {
    const { tables } = mergedDrafts([
      table('catalog_item', ['name']),
      table('catalog_items', ['catalog_item_name']),
    ]);

    expect(tables[0]?.columns.map((each) => each.name)).toEqual(['name', 'catalog_item_name']);
  });
});

describe('mergedDrafts: the key of a name', () => {
  it.each([
    ['news', 'new'],
    ['gas', 'ga'],
    ['user', 'u_ser'],
  ])('RF-603 does not merge %s with %s', (left, right) => {
    const { tables } = mergedDrafts([table(left), table(right)]);

    expect(namesOf(tables)).toEqual([left, right]);
  });

  it.each([
    ['tag', 'tags'],
    ['bus', 'buses'],
    ['order_line', 'orderline'],
    ['catalog_brand', 'catalogbrand'],
    ['user_role', 'user_roles'],
  ])('RF-603 still merges %s with %s', (left, right) => {
    const { tables } = mergedDrafts([table(left), table(right)]);

    expect(namesOf(tables)).toEqual([left]);
  });
});
