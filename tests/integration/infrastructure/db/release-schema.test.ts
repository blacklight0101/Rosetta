import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { expectedColumns, expectedIndexes } from './expected-schema.js';

/** Tables that data-model.md section 4 describes in a sentence rather than a column table. */
const PROSE_TABLES = ['schema_version', 'server_settings'];

/** Table name to column names, read from the column tables of data-model.md section 4. */
async function documentedColumns(): Promise<Map<string, string[]>> {
  const text = await readFile(new URL('../../../../docs/data-model.md', import.meta.url), 'utf8');
  const section = text.slice(text.indexOf('## 4. Tables'), text.indexOf('### 4.1'));
  const tables = new Map<string, string[]>();
  for (const chunk of section.split(/^\*\*`/m).slice(1)) {
    const table = chunk.slice(0, chunk.indexOf('`'));
    const firstCells = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith('| `'))
      .map((line) => line.split('|')[1] ?? '');
    const names = firstCells.flatMap((cell) =>
      [...cell.matchAll(/`([a-z0-9_]+)`/g)].map((match) => match[1] ?? ''),
    );
    if (names.length > 0) tables.set(table, names);
  }
  return tables;
}

interface ColumnRow {
  table: string;
  column: string;
  type: string;
  nullable: string;
}

async function actualColumns(pool: DatabasePool): Promise<Map<string, string[]>> {
  const result = await pool.query<ColumnRow>(
    `SELECT table_name AS table, column_name AS column, udt_name AS type, is_nullable AS nullable
       FROM information_schema.columns
      WHERE table_schema = current_schema()
      ORDER BY table_name, ordinal_position`,
  );
  const tables = new Map<string, string[]>();
  for (const row of result.rows) {
    const described = `${row.column} ${row.type}${row.nullable === 'YES' ? ' null' : ''}`;
    tables.set(row.table, [...(tables.get(row.table) ?? []), described]);
  }
  return tables;
}

function describeIndex(table: string, definition: string): string {
  const match = /^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING btree \((.*)\)$/.exec(definition);
  return `${table} ${match?.[1] ?? ''}(${match?.[2] ?? definition})`;
}

describe.skipIf(!hasTestDatabase)('release-1 schema', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: true }));
  });

  it('RF-1302 has exactly the tables of data-model.md section 4', async () => {
    const tables = [...(await actualColumns(pool)).keys()].sort();
    const documented = [...(await documentedColumns()).keys(), ...PROSE_TABLES].sort();

    expect(tables).toEqual(Object.keys(expectedColumns).sort());
    expect(tables).toEqual(documented);
  });

  it.each(Object.keys(expectedColumns))(
    'RF-1302 %s has the columns, types and nullability of data-model.md section 4',
    async (table) => {
      expect((await actualColumns(pool)).get(table)).toEqual(expectedColumns[table]);
    },
  );

  it('RF-1302 the column names match the column tables of data-model.md section 4', async () => {
    const actual = await actualColumns(pool);

    for (const [table, columns] of await documentedColumns()) {
      const names = (actual.get(table) ?? []).map((column) => column.split(' ')[0]);
      expect({ table, columns: names.sort() }).toEqual({ table, columns: [...columns].sort() });
    }
  });

  it('RF-1302 has the primary keys, unique keys and indexes of data-model.md section 4', async () => {
    const result = await pool.query<{ table: string; definition: string }>(
      `SELECT tablename AS table, indexdef AS definition
         FROM pg_indexes WHERE schemaname = current_schema()`,
    );

    expect(result.rows.map((row) => describeIndex(row.table, row.definition)).sort()).toEqual(
      [...expectedIndexes].sort(),
    );
  });
});
