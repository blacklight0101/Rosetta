import { describe, expect, it } from 'vitest';
import type { DraftColumn, DraftTable } from '../../../../src/domain/planning/data-model.js';
import { assembleDataModel } from '../../../../src/domain/planning/data-model-assembly.js';

// RF-623, P7-32: sheets split by site or copy (same columns, a suffix that is not a column) are one
// table with a discriminator column. Synthetic names only.

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

const same = ['ap_id', 'label', 'model', 'install_date'];
const claimsOf = (drafts: readonly DraftTable[]) =>
  drafts.flatMap((each) =>
    each.sources.map((cardId) => ({ cardId, claimId: `${cardId}.c1`, text: 'Columns.' })),
  );
const tablesOf = (drafts: readonly DraftTable[]) =>
  assembleDataModel({ tables: drafts, dropped: [] }, claimsOf(drafts), null).model.tables;
const namesOf = (drafts: readonly DraftTable[]) => tablesOf(drafts).map((each) => each.name);

describe('sheets split by site or copy', () => {
  it('RF-623 makes three per-site sheets one table with a site column', () => {
    const [only, ...rest] = tablesOf([
      sheet('access_point_site_a', same),
      sheet('access_point_site_b', same),
      sheet('access_point_site_c', same),
    ]);

    expect(rest).toEqual([]);
    expect(only?.name).toBe('access_point');
    expect(only?.columns.map((each) => each.name)).toEqual([...same, 'site']);
    expect(only?.sources).toEqual([
      'ENT-access_point_site_a',
      'ENT-access_point_site_b',
      'ENT-access_point_site_c',
    ]);
  });

  it('RF-623 keeps the name of a sheet with no suffix and leaves its site empty', () => {
    const tables = tablesOf([
      sheet('phone_inventory', same),
      sheet('phone_inventory_site_a', same),
    ]);

    expect(tables.map((each) => each.name)).toEqual(['phone_inventory']);
    expect(tables[0]?.columns.find((each) => each.name === 'site')?.nullable).toBe(true);
  });

  it('RF-623 names the column source_sheet when the suffix is no known kind', () => {
    const tables = tablesOf([sheet('stock_north', same), sheet('stock_south', same)]);

    expect(tables.map((each) => each.name)).toEqual(['stock']);
    expect(tables[0]?.columns.map((each) => each.name)).toContain('source_sheet');
  });
});

describe('sheets that stay apart', () => {
  it('RF-623 keeps tables with different columns apart', () => {
    expect(
      namesOf([
        sheet('access_point_site_a', same),
        sheet('access_point_site_b', ['tag_id', 'colour', 'note', 'owner']),
      ]),
    ).toEqual(['access_point_site_a', 'access_point_site_b']);
  });

  it('RF-623 keeps tables apart when the rest of the name is a column', () => {
    const columns = ['id', 'date', 'total', 'customer'];

    expect(namesOf([sheet('order', columns), sheet('order_date', columns)])).toEqual([
      'order',
      'order_date',
    ]);
  });

  it('RF-623 points the keys that named a sheet at the one table', () => {
    const tables = tablesOf([
      sheet('access_point_site_a', same),
      sheet('access_point_site_b', same),
      sheet('visit', ['visit_id', 'ap_id'], {
        foreignKeys: [
          { columns: ['ap_id'], references: 'access_point_site_b', referencedColumns: ['ap_id'] },
        ],
      }),
    ]);

    expect(tables.find((each) => each.name === 'visit')?.foreignKeys[0]?.references).toBe(
      'access_point',
    );
  });
});

describe('the record of a split', () => {
  it('RF-623 gives the value of each sheet in the column, and none for a sheet with no suffix', () => {
    const { model } = assembleDataModel(
      {
        tables: [sheet('phone_inventory', same), sheet('phone_inventory_site_a', same)],
        dropped: [],
      },
      claimsOf([sheet('phone_inventory', same), sheet('phone_inventory_site_a', same)]),
      null,
    );

    expect(model.splits).toEqual([
      {
        table: 'phone_inventory',
        column: 'site',
        values: [
          { sheet: 'phone_inventory', value: null, sources: ['ENT-phone_inventory'] },
          { sheet: 'phone_inventory_site_a', value: 'a', sources: ['ENT-phone_inventory_site_a'] },
        ],
      },
    ]);
  });
});
