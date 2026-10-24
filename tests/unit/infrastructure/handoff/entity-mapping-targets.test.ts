import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// P5-33, RF-601, RF-623: the entity mapping names the table of the data model of the same package,
// never the name the planner wrote for the entity.

const masker = new SecretMasker();

function packageWith(
  entities: HandoffPackage['content']['entities'],
  tables: readonly string[] = ['tbl_orders'],
): HandoffPackage {
  const base = handoffOf('Plain text.');
  const [first] = base.dataModel.tables;
  if (first === undefined) throw new Error('The fixture has no table');
  return {
    ...base,
    content: { ...base.content, entities },
    dataModel: {
      ...base.dataModel,
      tables: tables.map((name) => ({
        ...first,
        name,
        sources: name === 'tbl_orders' ? ['ENT-001'] : ['ENT-002'],
      })),
    },
  };
}

function mappingOf(entities: HandoffPackage['content']['entities'], tables?: string[]): string {
  return renderHandoff(packageWith(entities, tables), masker)['entity-mapping.md'] ?? '';
}

function rowOf(text: string, legacy: string): string {
  return text.split('\n').find((line) => line.startsWith(`| ${legacy} `)) ?? '';
}

describe('entity-mapping.md target names', () => {
  it('P5-33 shows the table of the data model, not the name the planner gave the entity', () => {
    const text = mappingOf([
      { legacy: 'Orders', target: 'Order', notes: '', sources: ['ENT-001'] },
    ]);
    const row = rowOf(text, 'Orders');

    expect(row).toContain('tbl_orders');
    expect(row).not.toContain('| Order |');
  });

  it('P5-33 says an entity has no table when no table is built from its card', () => {
    const text = mappingOf([{ legacy: 'Fax', target: 'FaxLog', notes: '', sources: ['ENT-009'] }]);
    const row = rowOf(text, 'Fax');

    expect(row).toContain('No table in the target data model');
    expect(row).toContain('The planner named it FaxLog.');
  });

  it('P5-33 lists every table when two tables are built from the entity cards', () => {
    const text = mappingOf(
      [{ legacy: 'Both', target: 'X', notes: '', sources: ['ENT-001', 'ENT-002'] }],
      ['tbl_orders', 'tbl_customers'],
    );

    expect(rowOf(text, 'Both')).toMatch(/tbl_orders.*tbl_customers|tbl_customers.*tbl_orders/u);
  });

  it('P5-33 falls back to a table named like the entity when the card ids do not match', () => {
    const text = mappingOf([{ legacy: 'Orders', target: 'Order', notes: '', sources: [] }]);

    expect(rowOf(text, 'Orders')).toContain('tbl_orders');
  });

  it('P5-33 mutation: the target cell is not the planner name', () => {
    const text = mappingOf([
      { legacy: 'Orders', target: 'PlannerName', notes: '', sources: ['ENT-001'] },
    ]);

    expect(rowOf(text, 'Orders').split('|')[2]).not.toContain('PlannerName');
  });
});

describe('entity-mapping.md planner name', () => {
  it('P5-33 keeps the planner name as a note when it differs from the table', () => {
    const text = mappingOf([
      { legacy: 'Orders', target: 'Order', notes: 'Kept.', sources: ['ENT-001'] },
    ]);

    expect(rowOf(text, 'Orders')).toContain('The planner named it Order.');
    expect(rowOf(text, 'Orders')).toContain('Kept.');
  });

  it('P5-33 adds no note when the planner name is the table', () => {
    const text = mappingOf([
      { legacy: 'Orders', target: 'tbl_orders', notes: '', sources: ['ENT-001'] },
    ]);

    expect(rowOf(text, 'Orders')).not.toContain('planner named');
  });
});
