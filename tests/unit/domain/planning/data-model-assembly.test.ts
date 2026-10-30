import { describe, expect, it } from 'vitest';
import {
  legacyClaimsOf,
  type DataModelDraft,
  type DraftTable,
} from '../../../../src/domain/planning/data-model.js';
import { assembleDataModel } from '../../../../src/domain/planning/data-model-assembly.js';
import { draftModel, legacyCards } from '../../../support/data-model-fixtures.js';

// RF-623, RF-262, RF-603: the planner's draft of the target tables is checked against the supported
// ENT claims of the cards before it becomes the data model. Every legacy field is mapped or listed
// as dropped; a source the cards do not support is never claimed.

const legacy = legacyClaimsOf(legacyCards());

function assembled(draft: DataModelDraft = draftModel()) {
  return assembleDataModel(draft, legacy, 'PostgreSQL');
}

function tableNamed(draft: DataModelDraft, name: string): DraftTable {
  const found = draft.tables.find((table) => table.name === name);
  if (found === undefined) throw new Error(`No table ${name}`);
  return found;
}

function withTable(name: string, change: Partial<DraftTable>): DataModelDraft {
  const draft = draftModel();
  return {
    ...draft,
    tables: draft.tables.map((table) => (table.name === name ? { ...table, ...change } : table)),
  };
}

describe('legacyClaimsOf', () => {
  it('RF-623 lists the supported claims of the ENT cards only, in card order', () => {
    expect(legacy.map((claim) => claim.claimId)).toEqual([
      'ENT-001.c1',
      'ENT-001.c2',
      'ENT-002.c1',
      'ENT-002.c2',
      'ENT-002.c3',
    ]);
  });
});

describe('assembleDataModel: tables', () => {
  it('RF-623 keeps each table with its columns, types, keys, constraints and indexes', () => {
    const { model } = assembled();

    expect(model.database).toBe('PostgreSQL');
    expect(model.tables.map((table) => table.name)).toEqual(['customer', 'customer_order']);
    const order = model.tables[1];
    expect(order?.columns.map((column) => `${column.name}:${column.type}`)).toEqual([
      'id:uuid',
      'customer_id:uuid',
      'status:varchar(20)',
      'total:numeric(10,2)',
    ]);
    expect(order?.primaryKey).toEqual(['id']);
    expect(order?.foreignKeys).toEqual([
      { columns: ['customer_id'], references: 'customer', referencedColumns: ['id'] },
    ]);
    expect(order?.checks).toEqual(['total is zero or more']);
    expect(order?.indexes).toHaveLength(1);
    expect(model.tables[0]?.uniqueKeys).toEqual([['email']]);
  });

  it('RF-623 a column names the legacy card, claim and field it comes from, or is new', () => {
    const { model } = assembled();

    const columns = model.tables.flatMap((table) => table.columns);
    expect(columns.find((column) => column.name === 'status')?.legacy).toEqual({
      ...{ cardId: 'ENT-001', claimId: 'ENT-001.c1' },
      field: 'Status',
    });
    expect(columns.find((column) => column.name === 'customer_id')?.legacy).toBeNull();
  });

  it('RF-623 a table lists the ENT cards its columns come from, sorted', () => {
    const order = tableNamed(draftModel(), 'customer_order');
    const columns = order.columns.map((column) =>
      column.name === 'id' ? { ...column, legacy: { claim: 'ENT-002.c1', field: 'Id' } } : column,
    );

    const { model } = assembled(withTable('customer_order', { sources: ['ENT-009'], columns }));

    expect(model.tables[1]?.sources).toEqual(['ENT-001', 'ENT-002']);
  });
});

describe('assembleDataModel: migration risks', () => {
  it('RF-623 a type change that can lose data stays on its column as a migration risk', () => {
    const { model } = assembled();

    const columns = model.tables.flatMap((table) => table.columns);
    const risky = columns.filter((column) => column.migrationRisk !== '');
    expect(risky.map((column) => column.name)).toEqual(['status']);
  });
});

describe('assembleDataModel: legacy sources', () => {
  it('RF-623 a column citing a claim that is not a supported ENT claim becomes new', () => {
    const columns = tableNamed(draftModel(), 'customer').columns.map((column) =>
      column.name === 'email'
        ? { ...column, legacy: { claim: 'ENT-001.c3', field: 'Card' } }
        : column,
    );

    const { model, leftOut } = assembled(withTable('customer', { columns }));

    expect(model.tables[0]?.columns[1]?.legacy).toBeNull();
    expect(leftOut.sources).toBe(1);
  });

  it('RF-623 a claim neither mapped nor dropped by the planner is listed as dropped by the code', () => {
    const { model } = assembled();

    const unlisted = model.dropped.find((field) => field.claimId === 'ENT-002.c3');
    expect(unlisted).toMatchObject({ cardId: 'ENT-002', byPlanner: false });
    expect(unlisted?.reason).toMatch(/no target column/iu);
  });
});

describe('assembleDataModel: dropped fields', () => {
  it('RF-623 a dropped field keeps the planner reason and its claim', () => {
    const { model } = assembled();

    expect(model.dropped.find((field) => field.claimId === 'ENT-002.c2')).toEqual({
      ...{ cardId: 'ENT-002', claimId: 'ENT-002.c2', field: 'Fax' },
      reason: 'The new system contacts customers by email only.',
      byPlanner: true,
    });
  });

  it('RF-623 a dropped field naming a claim the cards do not support is ignored', () => {
    const draft = {
      ...draftModel(),
      dropped: [{ claim: 'ENT-001.c3', field: 'Card', reason: 'Not needed.' }],
    };

    const { model } = assembled(draft);

    expect(model.dropped.map((field) => field.claimId)).not.toContain('ENT-001.c3');
  });

  it('RF-623 every supported ENT claim is mapped to a column or listed as dropped', () => {
    const drafts = [
      draftModel(),
      { ...draftModel(), dropped: [] },
      { ...draftModel(), tables: draftModel().tables.slice(0, 1) },
      withTable('customer', { columns: [] }),
    ];
    for (const draft of drafts) {
      const { model } = assembled(draft);
      const mapped = model.tables.flatMap((table) =>
        table.columns.flatMap((column) => (column.legacy === null ? [] : [column.legacy.claimId])),
      );
      const dropped = model.dropped.map((field) => field.claimId);

      const covered = new Set([...mapped, ...dropped]);
      expect([...covered].sort()).toEqual(legacy.map((claim) => claim.claimId).sort());
    }
  });
});

describe('assembleDataModel: what the planner may not write', () => {
  it('RF-623 leaves out a foreign key to a missing table or column', () => {
    const order = tableNamed(draftModel(), 'customer_order');
    const foreignKeys = [
      ...order.foreignKeys,
      { columns: ['customer_id'], references: 'ghost', referencedColumns: ['id'] },
      { columns: ['customer_id'], references: 'customer', referencedColumns: ['nope'] },
      { columns: ['nope'], references: 'customer', referencedColumns: ['id'] },
      { columns: ['customer_id', 'id'], references: 'customer', referencedColumns: ['id'] },
    ];

    const { model, leftOut } = assembled(withTable('customer_order', { foreignKeys }));

    expect(model.tables[1]?.foreignKeys).toHaveLength(1);
    expect(leftOut.keys).toBe(4);
  });
});

describe('assembleDataModel: keys', () => {
  it('RF-623 leaves out a key or index over a column the table lacks', () => {
    const { model } = assembled(
      withTable('customer', {
        primaryKey: ['missing'],
        uniqueKeys: [['email'], ['missing']],
        indexes: [{ columns: ['missing'], unique: false, reason: 'None.' }],
      }),
    );

    expect(model.tables[0]).toMatchObject({ primaryKey: [], uniqueKeys: [['email']], indexes: [] });
  });
});

describe('assembleDataModel: names and types', () => {
  it('RF-603 refuses a table or column whose name is not an identifier; a table written twice is merged', () => {
    const columns = [
      { name: 'id', type: 'uuid', nullable: false, legacy: null, risk: '' },
      { name: 'id', type: 'text', nullable: false, legacy: null, risk: '' },
      { name: 'a b;drop', type: 'text', nullable: false, legacy: null, risk: '' },
    ];
    const first = withTable('customer', { columns, primaryKey: ['id'], uniqueKeys: [] });
    const customer = tableNamed(first, 'customer');
    const draft = {
      ...first,
      tables: [
        ...first.tables,
        { ...customer, name: 'x"; drop table y' },
        { ...customer, name: 'customer' },
      ],
    };

    const { model, leftOut } = assembled(draft);

    expect(model.tables.map((table) => table.name)).toEqual(['customer', 'customer_order']);
    expect(model.tables[0]?.columns.map((column) => column.name)).toEqual(['id']);
    expect(leftOut).toMatchObject({ tables: 1, columns: 2 });
  });

  it('RF-603 writes a type that is not a type name as to confirm', () => {
    const bad = 'integer); DROP TABLE customer;--';
    const columns = [{ name: 'id', type: bad, nullable: false, legacy: null, risk: '' }];

    const { model } = assembled(
      withTable('customer', { columns, primaryKey: ['id'], uniqueKeys: [] }),
    );

    expect(model.tables[0]?.columns[0]?.type).toBe('to confirm');
  });

  it('RF-623 a nullable flag is kept as written', () => {
    const { model } = assembled();

    expect(model.tables[1]?.columns.map((column) => column.nullable)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});
