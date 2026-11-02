import type { TargetDataModel } from '../../domain/planning/data-model.js';
import { unconfirmedType } from '../../domain/planning/data-model-names.js';
import type { DataModelProblem } from './data-model-answer.js';
import { deprecatedOf, synonymsOf } from './data-model-synonyms.js';

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
export function baseOf(type: string): string {
  return type
    .toLowerCase()
    .replace(/\(.*?\)/gu, '')
    .replace(/\[\]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

const unknownDatabase =
  'The chosen database is not SQL Server, PostgreSQL, MySQL or SQLite, so the column types are not checked.';

const typeShape = /^([^([]*?)\s*(\([^)]*\))?\s*(\[\])?$/u;

/** The type with its database's one name for it, keeping the size and the array mark; unchanged when it has none. */
function canonicalOf(database: Database, type: string): string {
  const base = baseOf(type);
  const one = synonymsOf(database.name)[base];
  const match = typeShape.exec(type.trim());
  if (one === undefined || match === null) return type;
  return `${one}${base === 'double precision' ? '' : (match[2] ?? '')}${match[3] ?? ''}`;
}

/** Whether a type name is a type or a synonym of the chosen database; true when the database is not known. */
// RF-623, P7-13
export function isDatabaseType(choice: string | null, type: string): boolean {
  const chosen = databaseOf(choice);
  if (chosen === undefined) return true;
  const base = baseOf(type);
  return chosen.types.includes(base) || synonymsOf(chosen.name)[base] !== undefined;
}

/** The type as the chosen database names it: two spellings of one type compare equal. */
// RF-623, P7-13
export function sameType(choice: string | null, left: string, right: string): boolean {
  const chosen = databaseOf(choice);
  const squeeze = (type: string): string =>
    chosen === undefined ? type : canonicalOf(chosen, type);
  return (
    squeeze(left).toLowerCase().replace(/\s+/gu, '') ===
    squeeze(right).toLowerCase().replace(/\s+/gu, '')
  );
}

// SQL Server reads a char, varchar, nchar, nvarchar, binary or varbinary without a length as one character.
const lengthTypes = new Set(['char', 'varchar', 'nchar', 'nvarchar', 'binary', 'varbinary']);

function unsizedReason(database: string, type: string): string | undefined {
  if (database !== 'SQL Server' || type.includes('(') || !lengthTypes.has(baseOf(type)))
    return undefined;
  return `The type "${baseOf(type)}" has no length, and SQL Server reads it as a length of 1, so give it a length or max.`;
}

/** The columns whose type belongs to another database than the chosen one, and the unchecked database. */
// RF-623, P3-120, P7-13
export function typeProblems(model: TargetDataModel): DataModelProblem[] {
  if (model.database === null) return [];
  const chosen = databaseOf(model.database);
  if (chosen === undefined) {
    return [{ item: model.database, field: 'database', reason: unknownDatabase }];
  }
  const old = deprecatedOf(chosen.name);
  const others = new Set(all.filter((each) => each !== chosen).flatMap((each) => each.types));
  return model.tables.flatMap((table) =>
    table.columns.flatMap((column) => {
      const base = baseOf(column.type);
      const field = `table ${table.name} columns`;
      const replacement = old[base];
      const unsized = unsizedReason(chosen.name, column.type);
      if (unsized !== undefined) return [{ item: column.name, field, reason: unsized }];
      if (replacement !== undefined) {
        const reason = `The type "${base}" is deprecated in ${chosen.name}, so use ${replacement} for it.`;
        return [{ item: column.name, field, reason }];
      }
      if (
        column.type === unconfirmedType ||
        isDatabaseType(model.database, base) ||
        !others.has(base)
      )
        return [];
      const reason = `The type "${base}" is not a ${chosen.name} type, so use the ${chosen.name} type for it.`;
      return [{ item: column.name, field, reason }];
    }),
  );
}

/** The model with every type under the one name of its database (a synonym is written as that name). */
// RF-623, P7-13
export function withCanonicalTypes(model: TargetDataModel): TargetDataModel {
  const chosen = databaseOf(model.database);
  if (chosen === undefined) return model;
  return {
    ...model,
    tables: model.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) =>
        column.type === unconfirmedType
          ? column
          : { ...column, type: canonicalOf(chosen, column.type) },
      ),
    })),
  };
}
