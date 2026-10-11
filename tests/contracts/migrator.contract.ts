import { describe, expect, it } from 'vitest';
import type { Migrator } from '../../src/application/ports/migrator.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import {
  toMigrationFile,
  type MigrationFile,
} from '../../src/infrastructure/db/migration-files.js';

/** A fresh, empty database (or schema) and a way to look into it. */
export interface MigratorStore {
  migratorFor(migrations: readonly MigrationFile[]): Migrator;
  recorded(): Promise<readonly { version: number; name: string; checksum: string }[]>;
  tableExists(table: string): Promise<boolean>;
}

const createWidgets = toMigrationFile('0001_widgets.sql', 'CREATE TABLE widgets (id int);\n');
const addColour = toMigrationFile(
  '0002_widget_colour.sql',
  'ALTER TABLE widgets ADD COLUMN colour text;\n',
);
const createGadgets = toMigrationFile('0003_gadgets.sql', 'CREATE TABLE gadgets (id int);\n');
const failing = toMigrationFile(
  '0003_broken.sql',
  'CREATE TABLE gadgets (id int);\nSELECT * FROM no_such_table;\n',
);

async function failureOf(action: () => Promise<unknown>): Promise<RosettaError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected a RosettaError');
}

function applyingTests(fresh: () => Promise<MigratorStore>): void {
  it('RF-1302 applies pending migrations in order and records each with its checksum', async () => {
    const store = await fresh();

    const applied = await store.migratorFor([addColour, createWidgets]).migrate();

    expect(applied).toEqual([
      { version: 1, name: '0001_widgets.sql' },
      { version: 2, name: '0002_widget_colour.sql' },
    ]);
    expect(await store.recorded()).toEqual([
      { version: 1, name: '0001_widgets.sql', checksum: createWidgets.checksum },
      { version: 2, name: '0002_widget_colour.sql', checksum: addColour.checksum },
    ]);
  });

  it('RF-1302 a second run changes nothing', async () => {
    const store = await fresh();
    await store.migratorFor([createWidgets, addColour]).migrate();

    const applied = await store.migratorFor([createWidgets, addColour]).migrate();

    expect(applied).toEqual([]);
    expect(await store.recorded()).toHaveLength(2);
  });

  it('RF-1302 applies only the migrations added since the last run', async () => {
    const store = await fresh();
    await store.migratorFor([createWidgets]).migrate();

    const applied = await store.migratorFor([createWidgets, addColour]).migrate();

    expect(applied).toEqual([{ version: 2, name: '0002_widget_colour.sql' }]);
  });
}

function refusingTests(fresh: () => Promise<MigratorStore>): void {
  it('RF-1302 an applied migration whose file has changed stops with RST-2401 and applies nothing', async () => {
    const store = await fresh();
    await store.migratorFor([createWidgets]).migrate();
    const edited = toMigrationFile('0001_widgets.sql', 'CREATE TABLE widgets (id bigint);\n');

    const error = await failureOf(() => store.migratorFor([edited, addColour]).migrate());

    expect(error.code).toBe(ERROR_CODES.migrationChanged);
    expect(await store.recorded()).toHaveLength(1);
  });

  it('RF-1302 a database with a migration the image does not know stops with RST-2402', async () => {
    const store = await fresh();
    await store.migratorFor([createWidgets, addColour]).migrate();

    const error = await failureOf(() => store.migratorFor([createWidgets]).migrate());

    expect(error.code).toBe(ERROR_CODES.migrationUnknown);
  });

  it('RF-1302 a failing migration stops with RST-2403 and leaves the previous schema', async () => {
    const store = await fresh();
    await store.migratorFor([createWidgets]).migrate();

    const error = await failureOf(() =>
      store.migratorFor([createWidgets, addColour, failing]).migrate(),
    );

    expect(error.code).toBe(ERROR_CODES.migrationFailed);
    expect(error.message).toContain('0003_broken.sql');
    expect(error.cause).toBeInstanceOf(Error);
    expect((await store.recorded()).map((row) => row.version)).toEqual([1, 2]);
    expect(await store.tableExists('gadgets')).toBe(false);
  });

  it('RF-1302 after a fixed migration replaces the failing one, the run continues from there', async () => {
    const store = await fresh();
    await failureOf(() => store.migratorFor([createWidgets, failing]).migrate());

    const applied = await store.migratorFor([createWidgets, createGadgets]).migrate();

    expect(applied).toEqual([{ version: 3, name: '0003_gadgets.sql' }]);
    expect(await store.tableExists('gadgets')).toBe(true);
  });
}

/** Contract of the Migrator port (RF-1302): every adapter must pass it. */
export function migratorContract(name: string, fresh: () => Promise<MigratorStore>): void {
  describe(`Migrator contract: ${name} applies`, () => {
    applyingTests(fresh);
  });
  describe(`Migrator contract: ${name} refuses`, () => {
    refusingTests(fresh);
  });
}
