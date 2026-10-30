import { describe, expect, it } from 'vitest';
import {
  typeProblems,
  withCanonicalTypes,
} from '../../../../src/application/plan/data-model-database.js';
import type { TargetDataModel } from '../../../../src/domain/planning/data-model.js';

// P7-13, RF-623, EV-74: a type synonym of the chosen database is accepted and written under the one
// name the model uses; a deprecated type is a type problem with its replacement named.

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

const typesOf = (model: TargetDataModel) =>
  model.tables.flatMap((table) => table.columns.map((column) => column.type));

describe('SQL Server synonyms', () => {
  const synonyms = [
    ...['integer', 'dec(10,2)', 'character varying(20)', 'national character varying(50)'],
    ...['national char varying(5)', 'character(3)', 'national character(4)', 'double precision'],
  ];

  it('RF-623 accepts integer, dec and the character synonyms', () => {
    expect(typeProblems(withTypes(synonyms, 'SQL Server'))).toEqual([]);
  });

  it('RF-623 writes each synonym under the one name, keeping the size', () => {
    const model = withCanonicalTypes(withTypes(synonyms, 'SQL Server'));

    expect(typesOf(model)).toEqual([
      ...['int', 'decimal(10,2)', 'varchar(20)', 'nvarchar(50)'],
      ...['nvarchar(5)', 'char(3)', 'nchar(4)', 'float'],
    ]);
  });

  it('RF-623 leaves a model that already uses the one name, to confirm and an unknown database alone', () => {
    const own = withTypes(['int', 'varchar(20)', 'to confirm'], 'SQL Server');

    expect(withCanonicalTypes(own)).toEqual(own);
    const other = withTypes(['integer', 'dec'], 'Oracle');
    expect(withCanonicalTypes(other)).toEqual(other);
    expect(withCanonicalTypes(withTypes(['integer'], null))).toEqual(withTypes(['integer'], null));
  });
});

describe('synonyms of the other databases', () => {
  it('RF-623 PostgreSQL writes int, int4 and int8 as integer and bigint, and keeps an array mark', () => {
    const types = ['int', 'int4', 'int8', 'int[]', 'float8', 'character varying(9)'];

    expect(typesOf(withCanonicalTypes(withTypes(types, 'PostgreSQL')))).toEqual([
      ...['integer', 'integer', 'bigint', 'integer[]', 'double precision', 'varchar(9)'],
    ]);
  });

  it('RF-623 MySQL writes integer and dec as int and decimal; SQLite writes int as integer', () => {
    expect(typesOf(withCanonicalTypes(withTypes(['integer', 'dec(5,2)'], 'MySQL 8')))).toEqual([
      'int',
      'decimal(5,2)',
    ]);
    expect(typesOf(withCanonicalTypes(withTypes(['int'], 'SQLite')))).toEqual(['integer']);
  });
});

describe('deprecated types', () => {
  it('RF-623 lists text, ntext and image on SQL Server and names the replacement', () => {
    const types = ['text', 'ntext', 'image', 'varchar(max)'];
    const problems = typeProblems(withTypes(types, 'SQL Server'));

    expect(problems.map((each) => each.item)).toEqual(['c0', 'c1', 'c2']);
    expect(problems[0]?.reason).toContain('deprecated');
    expect(problems[0]?.reason).toContain('varchar(max)');
    expect(problems[1]?.reason).toContain('nvarchar(max)');
    expect(problems[2]?.reason).toContain('varbinary(max)');
  });

  it('RF-623 accepts text on PostgreSQL and MySQL', () => {
    expect(typeProblems(withTypes(['text'], 'PostgreSQL'))).toEqual([]);
    expect(typeProblems(withTypes(['text'], 'MySQL'))).toEqual([]);
  });
});

describe('a character type without a length', () => {
  it('RF-623 lists varchar, nvarchar, char and varbinary without a length on SQL Server (length 1)', () => {
    const types = ['varchar', 'nvarchar', 'char', 'varbinary', 'VARCHAR'];
    const problems = typeProblems(withTypes(types, 'SQL Server'));

    expect(problems.map((each) => each.item)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
    expect(problems[0]?.reason).toContain('length');
    expect(problems[0]?.reason).toContain('1');
  });

  it('RF-623 accepts a length, max and the types that take none', () => {
    const types = ['varchar(20)', 'nvarchar(max)', 'int', 'datetime2', 'text'];
    const problems = typeProblems(withTypes(types, 'SQL Server'));

    expect(problems.map((each) => each.item)).toEqual(['c4']);
  });

  it('RF-623 leaves varchar alone on PostgreSQL, where it has no limit', () => {
    expect(typeProblems(withTypes(['varchar', 'character varying'], 'PostgreSQL'))).toEqual([]);
  });
});
