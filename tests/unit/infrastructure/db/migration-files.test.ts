import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { toMigrationFile } from '../../../../src/infrastructure/db/migration-files.js';

function failureOf(action: () => unknown): RosettaError {
  try {
    action();
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected a RosettaError');
}

describe('toMigrationFile', () => {
  it('RF-1302 takes the version from the four-digit prefix and keeps the file name', () => {
    const file = toMigrationFile('0003_cost_ledger_audit.sql', 'SELECT 1;\n');

    expect(file).toMatchObject({
      version: 3,
      name: '0003_cost_ledger_audit.sql',
      sql: 'SELECT 1;\n',
    });
  });

  it('RF-1302 records the SHA-256 of the file contents as lower-case hex', () => {
    const sql = 'CREATE TABLE things (id int);\n';

    expect(toMigrationFile('0001_things.sql', sql).checksum).toBe(
      createHash('sha256').update(sql, 'utf8').digest('hex'),
    );
  });

  it('RF-1302 a changed file gets a different checksum', () => {
    const before = toMigrationFile('0001_things.sql', 'SELECT 1;\n');
    const after = toMigrationFile('0001_things.sql', 'SELECT 2;\n');

    expect(after.checksum).not.toBe(before.checksum);
  });

  it.each([
    '1_short.sql',
    '0001-dash.sql',
    '0001_Upper.sql',
    '0001_.sql',
    '0001_name.txt',
    'name.sql',
  ])('RF-1302 refuses the file name %s with RST-2400', (fileName) => {
    const error = failureOf(() => toMigrationFile(fileName, 'SELECT 1;'));

    expect(error.code).toBe(ERROR_CODES.migrationFileInvalid);
    expect(error.message).toContain(fileName);
  });

  it('RF-1302 refuses version 0000 with RST-2400', () => {
    expect(failureOf(() => toMigrationFile('0000_zero.sql', 'SELECT 1;')).code).toBe(
      ERROR_CODES.migrationFileInvalid,
    );
  });
});
