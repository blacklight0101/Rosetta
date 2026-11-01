import { describe, expect, it } from 'vitest';
import type { DraftTable } from '../../../../src/domain/planning/data-model.js';
import { withoutOutOfScopeTables } from '../../../../src/application/plan/data-model-skipped.js';

// RF-623, P7-32: a table that a PRD out-of-scope line drops is not written as a table.

function table(name: string, sources: string[]): DraftTable {
  return {
    ...{ name, purpose: '', sources, columns: [], primaryKey: [], uniqueKeys: [] },
    ...{ foreignKeys: [], checks: [], indexes: [] },
  };
}

describe('withoutOutOfScopeTables', () => {
  it('RF-623 keeps a table a line only mentions in passing', () => {
    const { tables, skipped } = withoutOutOfScopeTables(
      [table('access_point', ['ENT-001'])],
      [{ text: 'Access point firmware upgrades are out of scope.', sources: ['FEAT-004'] }],
    );

    expect(tables.map((each) => each.name)).toEqual(['access_point']);
    expect(skipped).toEqual([]);
  });

  it('RF-623 lists a table dropped because the line cites all its cards', () => {
    const { skipped } = withoutOutOfScopeTables(
      [table('spare_sheet', ['ENT-009'])],
      [{ text: 'The spare sheet is out of scope.', sources: ['ENT-009'] }],
    );

    expect(skipped[0]).toMatchObject({ item: 'spare_sheet', kind: 'check' });
  });

  it('RF-623 drops a table whose every card the line cites', () => {
    const { tables } = withoutOutOfScopeTables(
      [table('t1', ['ENT-009']), table('t2', ['ENT-001', 'ENT-002'])],
      [{ text: 'Empty sheets.', sources: ['ENT-009', 'ENT-001'] }],
    );

    expect(tables.map((each) => each.name)).toEqual(['t2']);
  });

  it('RF-623 keeps every table when nothing is out of scope', () => {
    expect(withoutOutOfScopeTables([table('t1', ['ENT-001'])], []).tables).toHaveLength(1);
  });
});
