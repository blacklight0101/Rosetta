import { describe, expect, it } from 'vitest';
import {
  databaseTypeNames,
  typeProblems,
} from '../../../../src/application/plan/data-model-database.js';
import type { TargetDataModel } from '../../../../src/domain/planning/data-model.js';
import { recordedModel } from '../../../support/data-model-sqlserver-orders.js';

// P3-120, RF-623, RF-630..RF-638: a column type that does not belong to the database the brief chose
// is listed in checks.md; a database the check does not know is said so and checks nothing.

function withTypes(types: readonly string[], database: string | null): TargetDataModel {
  const columns = types.map((type, index) => ({
    ...{ name: `c${String(index)}`, type, nullable: false, migrationRisk: '' },
    legacy: null,
  }));
  const table = {
    ...{ name: 't', purpose: 'Keeps rows.', sources: [], columns },
    ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
  };
  return { database, tables: [table], dropped: [] };
}

const itemsOf = (model: TargetDataModel) => typeProblems(model).map((each) => each.item);

describe('typeProblems', () => {
  it('RF-623 lists the PostgreSQL types of a SQL Server model (recorded wrong answer)', async () => {
    const problems = typeProblems(await recordedModel('wrong'));

    expect(problems.map((each) => each.item)).toEqual(['id', 'created_at', 'is_open']);
    expect(problems[0]?.field).toBe('table orders columns');
    expect(problems[0]?.reason).toContain('uuid');
    expect(problems[0]?.reason).toContain('SQL Server');
  });

  it('RF-623 lists nothing for a SQL Server model with SQL Server types (recorded right answer)', async () => {
    expect(typeProblems(await recordedModel('right'))).toEqual([]);
  });

  it('RF-623 lists SQL Server types under PostgreSQL', () => {
    const model = withTypes(['nvarchar(50)', 'bit', 'datetime2', 'uuid', 'text'], 'PostgreSQL 16');

    expect(itemsOf(model)).toEqual(['c0', 'c1', 'c2']);
  });

  it('RF-623 knows MySQL and SQLite as well', () => {
    expect(itemsOf(withTypes(['uuid', 'varchar(20)', 'datetime'], 'MySQL 8'))).toEqual(['c0']);
    expect(itemsOf(withTypes(['uniqueidentifier', 'integer', 'text'], 'SQLite'))).toEqual(['c0']);
  });

  it('RF-623 compares the type name without its size, case or array mark', () => {
    expect(itemsOf(withTypes(['VarChar(200)', 'DECIMAL(10, 2)'], 'SQL Server'))).toEqual([]);
    expect(itemsOf(withTypes(['UUID', 'Timestamp With Time Zone'], 'SQL Server'))).toEqual([
      'c0',
      'c1',
    ]);
  });

  it('RF-623 does not flag a type no database vocabulary names, or a type to confirm', () => {
    expect(itemsOf(withTypes(['mystery', 'to confirm'], 'SQL Server'))).toEqual([]);
  });

  it('RF-623 says an unknown database is not checked, once, and checks no type', () => {
    const problems = typeProblems(withTypes(['uuid', 'boolean'], 'Oracle 19'));

    expect(problems).toHaveLength(1);
    expect(problems[0]?.item).toBe('Oracle 19');
    expect(problems[0]?.reason).toContain('not checked');
  });

  it('RF-623 checks nothing and says nothing when the brief chose no database', () => {
    expect(typeProblems(withTypes(['uuid'], null))).toEqual([]);
  });
});

describe('databaseTypeNames', () => {
  it('RF-623 gives the type names of the four databases and nothing for others', () => {
    expect(databaseTypeNames('Microsoft SQL Server 2022')).toContain('uniqueidentifier');
    expect(databaseTypeNames('SQL Server')).not.toContain('uuid');
    expect(databaseTypeNames('PostgreSQL')).toContain('timestamp with time zone');
    expect(databaseTypeNames('MySQL')).toContain('mediumtext');
    expect(databaseTypeNames('SQLite')).toContain('blob');
    expect(databaseTypeNames('Oracle')).toBeNull();
    expect(databaseTypeNames(null)).toBeNull();
  });
});
