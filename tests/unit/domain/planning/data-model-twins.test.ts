import { describe, expect, it } from 'vitest';
import type { DraftColumn, DraftTable } from '../../../../src/domain/planning/data-model.js';
import { assembleDataModel } from '../../../../src/domain/planning/data-model-assembly.js';

// RF-623, P8-07, EV-31, EV-40: twin tables of a small local model (a plural inside the name, an
// entity or output suffix) that share most columns are one table; tables that only look alike stay
// apart; a merged table keeps ids that repeat across sites apart. Synthetic names only.

const text = (name: string): DraftColumn => ({
  ...{ name, type: 'varchar(50)', nullable: true },
  legacy: null,
  risk: '',
});

function sheet(name: string, columns: readonly string[], rest: Partial<DraftTable> = {}) {
  return {
    ...{ name, purpose: 'Keeps rows.', sources: [`ENT-${name}`], columns: columns.map(text) },
    ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
    ...rest,
  };
}

const tablesOf = (drafts: readonly DraftTable[]) =>
  assembleDataModel({ tables: drafts, dropped: [] }, [], null).model.tables;
const namesOf = (drafts: readonly DraftTable[]) => tablesOf(drafts).map((each) => each.name);

const stock = ['item_id', 'warehouse', 'quantity', 'reserved'];
const kind = ['type_id', 'label', 'note'];

describe('twin tables', () => {
  it('RF-623 makes a table and its twin with a plural inside the name one table', () => {
    const tables = tablesOf([
      sheet('depot_item_stock', stock),
      sheet('depot_items_stock', [...stock, 'updated_at']),
    ]);

    expect(tables.map((each) => each.name)).toEqual(['depot_item_stock']);
    expect(tables[0]?.sources).toEqual(['ENT-depot_item_stock', 'ENT-depot_items_stock']);
    expect(tables[0]?.columns.map((each) => each.name)).toContain('updated_at');
  });

  it('RF-623 makes a table and its entity twin one table when they share most columns', () => {
    expect(namesOf([sheet('depot_type', kind), sheet('depot_type_entity', kind)])).toEqual([
      'depot_type',
    ]);
  });

  it('RF-623 makes a table and its outputs twin one table when they share most columns', () => {
    const group = ['group_id', 'label', 'size'];

    expect(
      namesOf([sheet('crate_group', group), sheet('crate_group_outputs', [...group, 'total'])]),
    ).toEqual(['crate_group']);
  });
});

describe('twin tables, keys and few shared columns', () => {
  it('RF-623 points the keys of the twin at the table kept', () => {
    const tables = tablesOf([
      sheet('depot_type', kind),
      sheet('depot_type_entity', kind),
      sheet('depot_item', ['item_id', 'type_id'], {
        foreignKeys: [
          { columns: ['type_id'], references: 'depot_type_entity', referencedColumns: ['type_id'] },
        ],
      }),
    ]);

    expect(tables.find((each) => each.name === 'depot_item')?.foreignKeys[0]?.references).toBe(
      'depot_type',
    );
  });

  it('RF-623 keeps a table and a suffixed twin apart when they share few columns', () => {
    expect(
      namesOf([
        sheet('depot_type', kind),
        sheet('depot_type_entity', ['rule_id', 'formula', 'owner', 'label']),
      ]),
    ).toEqual(['depot_type', 'depot_type_entity']);
  });
});

describe('the key of a merged table', () => {
  const same = ['ap_id', 'label', 'model', 'install_date'];

  it('RF-623 keeps ids that repeat across sites apart when one sheet has no suffix', () => {
    const [table] = tablesOf([
      sheet('phone_inventory', same, { primaryKey: ['ap_id'] }),
      sheet('phone_inventory_site_a', same, { primaryKey: ['ap_id'] }),
    ]);

    expect(table?.primaryKey).toEqual([]);
    expect(table?.indexes).toContainEqual(
      expect.objectContaining({ columns: ['site', 'ap_id'], unique: true }),
    );
  });
});
