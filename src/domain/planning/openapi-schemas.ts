import type { ModelColumn, ModelTable } from './data-model.js';

// RF-624, RF-623, DEC-134: the JSON Schema of a target table, derived by code from its columns. The
// type names come from the checked data model (data-model-names.ts), so each one is a short type name
// with an optional size; the table maps to JSON Schema by that name alone, and a name the table below
// does not know is a string. A column that may be empty takes a type list with `null`, as OpenAPI
// 3.1 does (it has no `nullable` keyword).

/** A JSON-compatible object; the serializer (handoff-openapi-yaml.ts) turns it into text. */
export type JsonObject = Readonly<Record<string, unknown>>;

const dateTime: JsonObject = { type: 'string', format: 'date-time' };
const time: JsonObject = { type: 'string', format: 'time' };

/** The JSON Schema of each family of type names, first match wins. */
const families: readonly (readonly [readonly string[], JsonObject])[] = [
  [['smallint', 'integer', 'int', 'int2', 'int4', 'serial', 'smallserial'], { type: 'integer' }],
  [['bigint', 'int8', 'bigserial'], { type: 'integer', format: 'int64' }],
  [
    ['numeric', 'decimal', 'real', 'float', 'float4', 'float8', 'double precision', 'money'],
    { type: 'number' },
  ],
  [['boolean', 'bool', 'bit'], { type: 'boolean' }],
  [['uuid'], { type: 'string', format: 'uuid' }],
  [['date'], { type: 'string', format: 'date' }],
  [['timestamp', 'timestamptz', 'datetime', 'datetime2', 'smalldatetime'], dateTime],
  [['timestamp with time zone', 'timestamp without time zone'], dateTime],
  [['time', 'time with time zone', 'time without time zone'], time],
  [['json', 'jsonb'], {}],
  [['bytea', 'blob', 'binary', 'varbinary'], { type: 'string', format: 'byte' }],
];
const sizedTexts = ['varchar', 'character varying', 'char', 'character', 'nvarchar', 'nchar'];

const sizeSuffix = /\((\d+)\)$/u;
const precisionSuffix = /\([^)]*\)$/u;

function scalarSchema(base: string, size: number | undefined): JsonObject {
  const family = families.find(([names]) => names.includes(base));
  if (family !== undefined) return family[1];
  return sizedTexts.includes(base) && size !== undefined
    ? { type: 'string', maxLength: size }
    : { type: 'string' };
}

/** The JSON Schema of a column type name, such as `varchar(200)` or `uuid[]`. */
// RF-624
function typeSchema(typeName: string): JsonObject {
  const name = typeName.trim().toLowerCase();
  if (name.endsWith('[]')) return { type: 'array', items: typeSchema(name.slice(0, -2)) };
  const size = sizeSuffix.exec(name)?.[1];
  const base = name.replace(precisionSuffix, '').trim();
  return scalarSchema(base, size === undefined ? undefined : Number(size));
}

function columnSchema(column: ModelColumn): JsonObject {
  const schema = typeSchema(column.type);
  const { type } = schema;
  return column.nullable && typeof type === 'string' ? { ...schema, type: [type, 'null'] } : schema;
}

/** The schema of a table: an object with a property for each column and the non-empty ones required. */
// RF-624
export function tableSchema(table: ModelTable, mask: (text: string) => string): JsonObject {
  const required = table.columns.filter((column) => !column.nullable).map((column) => column.name);
  const properties = Object.fromEntries(
    table.columns.map((column) => [column.name, columnSchema(column)]),
  );
  return {
    type: 'object',
    ...(table.purpose === '' ? {} : { description: mask(table.purpose) }),
    ...(required.length === 0 ? {} : { required }),
    properties,
  };
}
