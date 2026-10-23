import type { TargetDataModel } from '../../domain/planning/data-model.js';
import { unconfirmedType } from '../../domain/planning/data-model-names.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, RF-630..RF-638, P3-120: the type names of the databases the data model knows, so the
// planner is told which to use and a column type that belongs to another database is listed in
// checks.md. Four databases: SQL Server, PostgreSQL, MySQL, SQLite. A type no vocabulary names is
// not judged, and a database outside the four is not checked at all (and the check says so).

const sqlServer = [
  ...['bigint', 'int', 'smallint', 'tinyint', 'bit', 'decimal', 'numeric', 'money', 'smallmoney'],
  ...['float', 'real', 'date', 'time', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'],
  ...['char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext', 'binary', 'varbinary', 'image'],
  ...['uniqueidentifier', 'xml', 'sql_variant', 'rowversion', 'timestamp', 'hierarchyid'],
  ...['geography', 'geometry'],
];

const postgres = [
  ...['smallint', 'integer', 'int', 'bigint', 'serial', 'bigserial', 'smallserial', 'decimal'],
  ...['numeric', 'real', 'double precision', 'money', 'boolean', 'char', 'character', 'varchar'],
  ...['character varying', 'text', 'bytea', 'date', 'time', 'time without time zone'],
  ...['time with time zone', 'timetz', 'timestamp', 'timestamp without time zone'],
  ...['timestamp with time zone', 'timestamptz', 'interval', 'uuid', 'json', 'jsonb', 'xml'],
  ...[
    'inet',
    'cidr',
    'macaddr',
    'float',
    'bit',
    'bit varying',
    'varbit',
    'int2',
    'int4',
    'int8',
    'float4',
    'float8',
  ],
];

const mysql = [
  ...['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'decimal', 'numeric'],
  ...['float', 'double', 'bit', 'boolean', 'bool', 'char', 'varchar', 'tinytext', 'text'],
  ...['mediumtext', 'longtext', 'binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob'],
  ...['longblob', 'enum', 'set', 'date', 'time', 'datetime', 'timestamp', 'year', 'json'],
];

const sqlite = [
  ...['integer', 'int', 'real', 'text', 'blob', 'numeric', 'boolean', 'date', 'datetime'],
  ...['timestamp', 'varchar', 'char', 'decimal', 'float', 'double', 'bigint', 'smallint'],
  ...['tinyint', 'clob'],
];

interface Database {
  readonly name: string;
  readonly types: readonly string[];
}

const all: readonly Database[] = [
  { name: 'SQL Server', types: sqlServer },
  { name: 'PostgreSQL', types: postgres },
  { name: 'MySQL', types: mysql },
  { name: 'SQLite', types: sqlite },
];

const patterns: readonly (readonly [RegExp, string])[] = [
  [/sql\s*server|mssql|azure sql/u, 'SQL Server'],
  [/postgres/u, 'PostgreSQL'],
  [/mysql|mariadb/u, 'MySQL'],
  [/sqlite/u, 'SQLite'],
];

function databaseOf(choice: string | null): Database | undefined {
  if (choice === null) return undefined;
  const text = choice.toLowerCase();
  const found = patterns.find(([pattern]) => pattern.test(text));
  return all.find((each) => each.name === found?.[1]);
}

/** The type names of the chosen database, or null when it is none of the four known ones. */
// RF-623
export function databaseTypeNames(choice: string | null): readonly string[] | null {
  return databaseOf(choice)?.types ?? null;
}

/** The type as a vocabulary names it: lower case, no size, no array mark, single spaces. */
function baseOf(type: string): string {
  return type
    .toLowerCase()
    .replace(/\(.*?\)/gu, '')
    .replace(/\[\]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

const unknownDatabase =
  'The chosen database is not SQL Server, PostgreSQL, MySQL or SQLite, so the column types are not checked.';

/** The columns whose type belongs to another database than the chosen one, and the unchecked database. */
// RF-623, P3-120
export function typeProblems(model: TargetDataModel): DataModelProblem[] {
  if (model.database === null) return [];
  const chosen = databaseOf(model.database);
  if (chosen === undefined) {
    return [{ item: model.database, field: 'database', reason: unknownDatabase }];
  }
  const own = new Set(chosen.types);
  const others = new Set(all.filter((each) => each !== chosen).flatMap((each) => each.types));
  return model.tables.flatMap((table) =>
    table.columns.flatMap((column) => {
      const base = baseOf(column.type);
      if (column.type === unconfirmedType || own.has(base) || !others.has(base)) return [];
      return [
        {
          item: column.name,
          field: `table ${table.name} columns`,
          reason: `The type "${base}" is not a ${chosen.name} type, so use the ${chosen.name} type for it.`,
        },
      ];
    }),
  );
}
