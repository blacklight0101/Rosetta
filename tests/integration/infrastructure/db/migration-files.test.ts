import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { readMigrationFiles } from '../../../../src/infrastructure/db/migration-files.js';
import { migrationsFolder } from '../../../support/postgres.js';
import { useTempRoot } from '../../../support/temp-root.js';

describe('readMigrationFiles', () => {
  const root = useTempRoot('rst-migrations-');

  it('RF-1302 reads the numbered .sql files in version order and ignores other files', async () => {
    await writeFile(join(root.path, '0002_second.sql'), 'SELECT 2;\n');
    await writeFile(join(root.path, '0001_first.sql'), 'SELECT 1;\n');
    await writeFile(join(root.path, '.gitkeep'), '');
    await writeFile(join(root.path, 'README.md'), '# notes\n');

    const files = await readMigrationFiles(root.path);

    expect(files.map((file) => [file.version, file.name, file.sql])).toEqual([
      [1, '0001_first.sql', 'SELECT 1;\n'],
      [2, '0002_second.sql', 'SELECT 2;\n'],
    ]);
  });

  it('RF-1302 refuses a .sql file whose name is not NNNN_snake_name.sql with RST-2400', async () => {
    await writeFile(join(root.path, '0001_First.sql'), 'SELECT 1;\n');

    await expect(readMigrationFiles(root.path)).rejects.toMatchObject({
      code: ERROR_CODES.migrationFileInvalid,
    });
  });

  it('RF-1302 refuses two files with the same version with RST-2400', async () => {
    await writeFile(join(root.path, '0001_first.sql'), 'SELECT 1;\n');
    await writeFile(join(root.path, '0001_again.sql'), 'SELECT 2;\n');

    await expect(readMigrationFiles(root.path)).rejects.toBeInstanceOf(RosettaError);
  });
});

describe('release migrations', () => {
  it('RF-1302 db/migrations holds the release-1 migrations of data-model.md section 7', async () => {
    const files = await readMigrationFiles(migrationsFolder);

    expect(files.map((file) => file.name)).toEqual([
      '0001_accounts.sql',
      '0002_projects_runs.sql',
      '0003_cost_ledger_audit.sql',
      '0004_server_settings_defaults.sql',
      '0005_cost_ledger_tasks_and_tokens.sql',
    ]);
  });

  it('RF-1302 migration files use LF line endings so the checksum is the same on every system', async () => {
    const files = await readMigrationFiles(migrationsFolder);

    for (const file of files) {
      expect(file.sql).not.toContain('\r');
    }
  });
});
