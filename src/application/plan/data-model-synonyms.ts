// RF-623, P7-13, EV-74: the other names each database gives its types, and the types it deprecates.
// A synonym is a valid type of the database, so it is never a type problem; the model writes it under
// the one name below, so one model holds one dialect. A deprecated type is a valid name that the
// database advises against; checks.md lists the column with the replacement.

type Names = Readonly<Record<string, string>>;

const sqlServer: Names = {
  integer: 'int',
  dec: 'decimal',
  'character varying': 'varchar',
  'char varying': 'varchar',
  'national character varying': 'nvarchar',
  'national char varying': 'nvarchar',
  'nchar varying': 'nvarchar',
  character: 'char',
  'national character': 'nchar',
  'national char': 'nchar',
  'binary varying': 'varbinary',
  'double precision': 'float',
};

const postgres: Names = {
  int: 'integer',
  int4: 'integer',
  int2: 'smallint',
  int8: 'bigint',
  float4: 'real',
  float8: 'double precision',
  dec: 'decimal',
  'character varying': 'varchar',
  character: 'char',
};

const mysql: Names = {
  integer: 'int',
  dec: 'decimal',
  bool: 'boolean',
  'character varying': 'varchar',
  character: 'char',
  'double precision': 'double',
};

const sqlite: Names = {
  int: 'integer',
  'character varying': 'varchar',
  character: 'char',
  'double precision': 'double',
};

const synonyms: Readonly<Record<string, Names>> = {
  'SQL Server': sqlServer,
  PostgreSQL: postgres,
  MySQL: mysql,
  SQLite: sqlite,
};

const deprecated: Readonly<Record<string, Names>> = {
  'SQL Server': { text: 'varchar(max)', ntext: 'nvarchar(max)', image: 'varbinary(max)' },
};

/** The synonyms of a database, each with the one name the model writes. */
export function synonymsOf(database: string): Names {
  return synonyms[database] ?? {};
}

/** The deprecated types of a database, each with its replacement. */
export function deprecatedOf(database: string): Names {
  return deprecated[database] ?? {};
}
